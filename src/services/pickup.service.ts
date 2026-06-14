import { Transaction, User } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import {
  createPickupReleaseOtp,
  getPickupReleaseOtpStatus,
  verifyPickupReleaseOtp,
} from './otp.service';
import { releaseEscrowFunds } from './payment.service';
import { publicUserSelect } from '../utils/userSelect';
import { serializeDecimal } from '../utils/serialize';
import { Prisma } from '@prisma/client';

const listingSummarySelect = {
  id: true,
  title: true,
  price: true,
  currency: true,
  quantity: true,
  status: true,
  city: true,
  country: true,
  condition: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true, isPrimary: true },
  },
} as const;

const transactionInclude = {
  listing: { select: listingSummarySelect },
  buyer: { select: publicUserSelect },
  seller: { select: publicUserSelect },
  payment: true,
} satisfies Prisma.TransactionInclude;

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;

const serializePayment = (
  payment: NonNullable<TransactionWithRelations['payment']> | null,
) => {
  if (!payment) {
    return null;
  }

  return {
    ...payment,
    amount: serializeDecimal(payment.amount),
  };
};

export const serializeTransactionWithPayment = (transaction: TransactionWithRelations) => {
  const amount = serializeDecimal(transaction.amount);
  const platformFee = serializeDecimal(transaction.platformFee);

  return {
    ...transaction,
    unitPrice: serializeDecimal(transaction.unitPrice),
    amount,
    platformFee,
    sellerPayout: amount - platformFee,
    payment: serializePayment(transaction.payment),
    listing: transaction.listing
      ? {
          ...transaction.listing,
          price: serializeDecimal(transaction.listing.price),
        }
      : transaction.listing,
  };
};

const assertBuyer = (transaction: Pick<Transaction, 'buyerId'>, user: User) => {
  if (transaction.buyerId !== user.id && user.role !== 'ADMIN') {
    throw new AppError(403, 'Only the buyer can perform this action');
  }
};

const assertSeller = (transaction: Pick<Transaction, 'sellerId'>, user: User) => {
  if (transaction.sellerId !== user.id && user.role !== 'ADMIN') {
    throw new AppError(403, 'Only the seller can perform this action');
  }
};

const assertParticipant = (
  transaction: Pick<Transaction, 'buyerId' | 'sellerId'>,
  user: User,
) => {
  if (
    transaction.buyerId !== user.id &&
    transaction.sellerId !== user.id &&
    user.role !== 'ADMIN'
  ) {
    throw new AppError(403, 'Only transaction participants can access pickup details');
  }
};

const getTransactionOrThrow = async (id: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: transactionInclude,
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  return transaction;
};

export const confirmPickup = async (
  id: string,
  user: User,
  pickupPhotoUrl: string,
) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { payment: true, buyer: { select: { email: true } } },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertBuyer(transaction, user);

  if (transaction.status === 'COMPLETED') {
    throw new AppError(400, 'Transaction is already completed');
  }

  if (transaction.pickupConfirmedAt && transaction.status === 'IN_PROGRESS') {
    const otpStatus = await getPickupReleaseOtpStatus(id);

    return {
      transaction: serializeTransactionWithPayment(
        await getTransactionOrThrow(id),
      ),
      pickup: buildPickupStatus(transaction, otpStatus),
      message: 'Pickup already confirmed. Share the existing release code with the seller.',
      alreadyConfirmed: true,
    };
  }

  if (transaction.status !== 'PAYMENT_CONFIRMED') {
    throw new AppError(400, 'Pickup can only be confirmed after payment is secured in escrow');
  }

  if (!transaction.payment || transaction.payment.escrowStatus !== 'HELD') {
    throw new AppError(400, 'Escrow funds must be held before pickup confirmation');
  }

  const releaseCode = await createPickupReleaseOtp({
    transactionId: transaction.id,
    buyerId: transaction.buyerId,
    buyerEmail: transaction.buyer.email,
  });

  const now = new Date();

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      pickupConfirmedAt: now,
      pickupPhotoUrl,
      releaseOtpGeneratedAt: now,
    },
    include: transactionInclude,
  });

  const otpStatus = await getPickupReleaseOtpStatus(id);

  return {
    transaction: serializeTransactionWithPayment(updated),
    pickup: buildPickupStatus(updated, otpStatus),
    message:
      'Pickup confirmed with photo evidence. Give the release code to the seller only after you are satisfied with the item.',
    alreadyConfirmed: false,
    ...(env.NODE_ENV === 'development' && { releaseCode }),
  };
};

export const getPickupStatus = async (id: string, user: User) => {
  const transaction = await getTransactionOrThrow(id);
  assertParticipant(transaction, user);

  const otpStatus = await getPickupReleaseOtpStatus(id);

  return {
    transaction: serializeTransactionWithPayment(transaction),
    pickup: buildPickupStatus(transaction, otpStatus),
  };
};

export const verifyReleaseOtp = async (id: string, user: User, code: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { payment: true },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertSeller(transaction, user);

  if (
    transaction.status === 'COMPLETED' &&
    transaction.payment?.escrowStatus === 'RELEASED'
  ) {
    const current = await getTransactionOrThrow(id);

    return {
      transaction: serializeTransactionWithPayment(current),
      message: 'Funds were already released. Transaction is complete.',
      alreadyReleased: true,
    };
  }

  if (transaction.status !== 'IN_PROGRESS') {
    throw new AppError(400, 'Release code can only be verified during an in-progress transaction');
  }

  if (!transaction.pickupConfirmedAt || !transaction.pickupPhotoUrl) {
    throw new AppError(400, 'Buyer must confirm pickup with photo before funds can be released');
  }

  if (!transaction.payment || transaction.payment.escrowStatus !== 'HELD') {
    throw new AppError(400, 'No escrow funds available for release');
  }

  await verifyPickupReleaseOtp({ transactionId: id, code });

  const { transaction: released, alreadyReleased } = await releaseEscrowFunds(
    transaction.payment.id,
  );

  if (!alreadyReleased) {
    await prisma.transaction.update({
      where: { id },
      data: { pickupOtpVerifiedAt: new Date() },
    });
  }

  const current = await getTransactionOrThrow(released.id);

  return {
    transaction: serializeTransactionWithPayment(current),
    message: alreadyReleased
      ? 'Funds were already released. Transaction is complete.'
      : 'Pickup verified. Escrow funds released to seller.',
    alreadyReleased,
  };
};

export const regenerateReleaseOtp = async (id: string, user: User) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { buyer: { select: { email: true } } },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertBuyer(transaction, user);

  if (transaction.status !== 'IN_PROGRESS' || !transaction.pickupConfirmedAt) {
    throw new AppError(400, 'Pickup must be confirmed before regenerating a release code');
  }

  if (transaction.fundsReleasedAt) {
    throw new AppError(400, 'Funds have already been released');
  }

  const otpStatus = await getPickupReleaseOtpStatus(id);
  if (otpStatus.active) {
    throw new AppError(400, 'Current release code is still valid');
  }

  const releaseCode = await createPickupReleaseOtp({
    transactionId: transaction.id,
    buyerId: transaction.buyerId,
    buyerEmail: transaction.buyer.email,
  });

  const updated = await prisma.transaction.update({
    where: { id },
    data: { releaseOtpGeneratedAt: new Date() },
    include: transactionInclude,
  });

  const nextOtpStatus = await getPickupReleaseOtpStatus(id);

  return {
    transaction: serializeTransactionWithPayment(updated),
    pickup: buildPickupStatus(updated, nextOtpStatus),
    message: 'New release code generated. Share it with the seller after verifying the item.',
    ...(env.NODE_ENV === 'development' && { releaseCode }),
  };
};

const buildPickupStatus = (
  transaction: Pick<
    Transaction,
    | 'pickupConfirmedAt'
    | 'pickupPhotoUrl'
    | 'releaseOtpGeneratedAt'
    | 'pickupOtpVerifiedAt'
    | 'fundsReleasedAt'
    | 'status'
  >,
  otpStatus: Awaited<ReturnType<typeof getPickupReleaseOtpStatus>>,
) => ({
  confirmed: Boolean(transaction.pickupConfirmedAt),
  confirmedAt: transaction.pickupConfirmedAt,
  photoUrl: transaction.pickupPhotoUrl,
  releaseOtpGeneratedAt: transaction.releaseOtpGeneratedAt,
  releaseOtpVerifiedAt: transaction.pickupOtpVerifiedAt,
  fundsReleasedAt: transaction.fundsReleasedAt,
  otp: {
    active: otpStatus.active,
    expiresAt: otpStatus.expiresAt,
    verified: otpStatus.verified,
    attemptsRemaining: otpStatus.attemptsRemaining,
  },
  canReleaseFunds:
    transaction.status === 'IN_PROGRESS' &&
    Boolean(transaction.pickupPhotoUrl) &&
    otpStatus.active,
});

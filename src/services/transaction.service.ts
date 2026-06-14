import { Prisma, Transaction, TransactionStatus, User } from '@prisma/client';
import { ACTIVE_TRANSACTION_STATUSES, calculateTransactionAmounts } from '../lib/transactions';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { createPickupReleaseOtp, verifyPickupReleaseOtp } from './otp.service';
import {
  initiateEscrowRefund,
  processEscrowRelease,
} from './payment.service';
import { serializeDecimal } from '../utils/serialize';
import { publicUserSelect } from '../utils/userSelect';
import { env } from '../config/env';

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

const serializeTransaction = (transaction: TransactionWithRelations) => {
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

const assertCanAccessTransaction = (
  transaction: Pick<Transaction, 'buyerId' | 'sellerId'>,
  user: User,
) => {
  if (
    transaction.buyerId !== user.id &&
    transaction.sellerId !== user.id &&
    user.role !== 'ADMIN'
  ) {
    throw new AppError(403, 'You can only access your own transactions');
  }
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
    throw new AppError(403, 'Only transaction participants can perform this action');
  }
};

const restoreListingQuantity = async (
  tx: Prisma.TransactionClient,
  listingId: string,
  quantity: number,
) => {
  const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
  const newQuantity = listing.quantity + quantity;

  await tx.listing.update({
    where: { id: listingId },
    data: {
      quantity: newQuantity,
      status:
        listing.status === 'RESERVED' || listing.status === 'SOLD'
          ? 'ACTIVE'
          : listing.status,
    },
  });
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

export const createTransaction = async (
  buyerId: string,
  input: {
    listingId: string;
    quantity: number;
    pickupLocation: string;
    agreedPickupAt: Date;
    notes?: string;
  },
) => {
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findFirst({
      where: {
        id: input.listingId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (!listing) {
      throw new AppError(404, 'Listing not found or not available for purchase');
    }

    if (listing.sellerId === buyerId) {
      throw new AppError(403, 'You cannot buy your own listing');
    }

    if (input.quantity > listing.quantity) {
      throw new AppError(
        400,
        `Requested quantity (${input.quantity}) exceeds available stock (${listing.quantity})`,
      );
    }

    const conflicting = await tx.transaction.findFirst({
      where: {
        listingId: listing.id,
        status: { in: ACTIVE_TRANSACTION_STATUSES },
        buyerId: { not: buyerId },
      },
    });

    if (listing.quantity === 1 && conflicting) {
      throw new AppError(409, 'This listing is already reserved by another buyer');
    }

    const { amount, platformFee } = calculateTransactionAmounts(
      listing.price,
      input.quantity,
    );
    const remainingQuantity = listing.quantity - input.quantity;

    const transaction = await tx.transaction.create({
      data: {
        listingId: listing.id,
        buyerId,
        sellerId: listing.sellerId,
        quantity: input.quantity,
        unitPrice: listing.price,
        amount,
        currency: listing.currency,
        platformFee,
        status: 'PENDING',
        pickupLocation: input.pickupLocation,
        agreedPickupAt: input.agreedPickupAt,
        notes: input.notes,
      },
      include: transactionInclude,
    });

    await tx.listing.update({
      where: { id: listing.id },
      data: {
        quantity: remainingQuantity,
        status: remainingQuantity === 0 ? 'RESERVED' : 'ACTIVE',
      },
    });

    return transaction;
  });

  return serializeTransaction(result);
};

export const listMyTransactions = async (
  userId: string,
  query: {
    page: number;
    limit: number;
    status?: TransactionStatus;
    role: 'buyer' | 'seller' | 'all';
  },
) => {
  const where: Prisma.TransactionWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.role === 'buyer' && { buyerId: userId }),
    ...(query.role === 'seller' && { sellerId: userId }),
    ...(query.role === 'all' && {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(serializeTransaction),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getTransactionById = async (id: string, user: User) => {
  const transaction = await getTransactionOrThrow(id);
  assertCanAccessTransaction(transaction, user);
  return serializeTransaction(transaction);
};

export const confirmPickup = async (
  id: string,
  user: User,
  input: { pickupPhotoUrl: string },
) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { payment: true, buyer: { select: { email: true } } },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertBuyer(transaction, user);

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

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      pickupConfirmedAt: new Date(),
      pickupPhotoUrl: input.pickupPhotoUrl,
    },
    include: transactionInclude,
  });

  return {
    transaction: serializeTransaction(updated),
    message: 'Pickup confirmed. Share the release code with the seller after collecting the item.',
    ...(env.NODE_ENV === 'development' && { releaseCode }),
  };
};

export const verifyReleaseOtp = async (
  id: string,
  user: User,
  code: string,
) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { payment: true },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertSeller(transaction, user);

  if (transaction.status !== 'IN_PROGRESS') {
    throw new AppError(400, 'Release code can only be verified during an in-progress transaction');
  }

  if (!transaction.payment || transaction.payment.escrowStatus !== 'HELD') {
    throw new AppError(400, 'No escrow funds available for release');
  }

  await verifyPickupReleaseOtp({ transactionId: id, code });

  const updated = await prisma.$transaction(async (tx) => {
    await processEscrowRelease(tx, transaction.payment!);
    return tx.transaction.findUniqueOrThrow({
      where: { id },
      include: transactionInclude,
    });
  });

  return {
    transaction: serializeTransaction(updated),
    message: 'Pickup verified. Escrow funds released to seller.',
  };
};

export const cancelTransaction = async (
  id: string,
  user: User,
  reason?: string,
) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { payment: true },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertParticipant(transaction, user);

  if (!['PENDING', 'PAYMENT_CONFIRMED', 'IN_PROGRESS'].includes(transaction.status)) {
    throw new AppError(400, 'This transaction cannot be cancelled');
  }

  const noteSuffix = reason ? ` Cancellation reason: ${reason}` : '';

  if (transaction.payment?.escrowStatus === 'HELD') {
    await initiateEscrowRefund(id);

    const updated = await prisma.$transaction(async (tx) => {
      await restoreListingQuantity(tx, transaction.listingId, transaction.quantity);

      return tx.transaction.findUniqueOrThrow({
        where: { id },
        include: transactionInclude,
      });
    });

    return {
      transaction: serializeTransaction(updated),
      message: 'Transaction cancelled. Escrow funds refunded to buyer.',
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await restoreListingQuantity(tx, transaction.listingId, transaction.quantity);

    return tx.transaction.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        notes: transaction.notes ? `${transaction.notes}${noteSuffix}` : reason,
      },
      include: transactionInclude,
    });
  });

  return {
    transaction: serializeTransaction(updated),
    message: 'Transaction cancelled and listing stock restored.',
  };
};

export const disputeTransaction = async (
  id: string,
  user: User,
  reason: string,
) => {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id },
      include: { payment: true },
    });

    if (!transaction) {
      throw new AppError(404, 'Transaction not found');
    }

    assertParticipant(transaction, user);

    if (!['PAYMENT_CONFIRMED', 'IN_PROGRESS'].includes(transaction.status)) {
      throw new AppError(400, 'This transaction cannot be disputed');
    }

    if (!transaction.payment || transaction.payment.escrowStatus !== 'HELD') {
      throw new AppError(400, 'Disputes require escrow funds to be held');
    }

    return tx.transaction.update({
      where: { id },
      data: {
        status: 'DISPUTED',
        notes: transaction.notes
          ? `${transaction.notes} Dispute: ${reason}`
          : `Dispute: ${reason}`,
      },
      include: transactionInclude,
    });
  });

  return {
    transaction: serializeTransaction(updated),
    message: 'Transaction disputed. Escrow funds remain held pending resolution.',
  };
};

export const refundTransaction = async (id: string, user: User, reason?: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { payment: true },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  assertParticipant(transaction, user);

  if (transaction.status !== 'DISPUTED') {
    throw new AppError(400, 'Refunds can only be processed for disputed transactions');
  }

  if (!transaction.payment || transaction.payment.escrowStatus !== 'HELD') {
    throw new AppError(400, 'No escrow funds available to refund');
  }

  await initiateEscrowRefund(id);

  const updated = await prisma.$transaction(async (tx) => {
    await restoreListingQuantity(tx, transaction.listingId, transaction.quantity);

    if (reason) {
      await tx.transaction.update({
        where: { id },
        data: {
          notes: transaction.notes
            ? `${transaction.notes} Refund reason: ${reason}`
            : `Refund reason: ${reason}`,
        },
      });
    }

    return tx.transaction.findUniqueOrThrow({
      where: { id },
      include: transactionInclude,
    });
  });

  return {
    transaction: serializeTransaction(updated),
    message: 'Escrow funds refunded to buyer.',
  };
};

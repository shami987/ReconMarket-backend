import { PaymentProvider, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import {
  generateExternalPaymentReference,
  generateProviderReference,
  generateRefundReference,
} from '../lib/payment.webhook';
import { prisma } from '../lib/prisma';
import { serializeDecimal } from '../utils/serialize';
import { MockPaymentWebhookInput } from '../schemas/payment.schema';

const serializePayment = (
  payment: {
    amount: { toNumber(): number } | number;
    [key: string]: unknown;
  },
) => ({
  ...payment,
  amount: serializeDecimal(payment.amount),
});

export const createPaymentIntent = async (
  transactionId: string,
  buyerId: string,
  input: { provider: PaymentProvider; payerPhone?: string },
) => {
  const payment = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
      include: { payment: true },
    });

    if (!transaction) {
      throw new AppError(404, 'Transaction not found');
    }

    if (transaction.buyerId !== buyerId) {
      throw new AppError(403, 'Only the buyer can initiate payment');
    }

    if (transaction.status !== 'PENDING') {
      throw new AppError(400, 'Payment can only be initiated for pending transactions');
    }

    if (transaction.payment) {
      if (transaction.payment.status === 'SUCCEEDED') {
        throw new AppError(409, 'Payment already completed for this transaction');
      }

      if (transaction.payment.status === 'PENDING') {
        return transaction.payment;
      }
    }

    return tx.payment.create({
      data: {
        transactionId: transaction.id,
        provider: input.provider,
        payerPhone: input.payerPhone,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'PENDING',
        escrowStatus: 'NONE',
        externalReference: generateExternalPaymentReference(),
        metadata: {
          providerLabel:
            input.provider === 'MTN_MOMO' ? 'MTN Mobile Money' : 'Airtel Money',
          mock: env.PAYMENT_PROVIDER === 'mock',
        },
      },
    });
  });

  const serialized = serializePayment(payment);

  return {
    payment: serialized,
    checkout: {
      provider: payment.provider,
      amount: serialized.amount,
      currency: payment.currency,
      externalReference: payment.externalReference,
      instructions:
        env.PAYMENT_PROVIDER === 'mock'
          ? 'Mock payment: call POST /api/payments/mock/simulate with externalReference, or wait for webhook.'
          : 'Complete payment on your mobile money app.',
      ...(env.NODE_ENV === 'development' && {
        simulateEndpoint: '/api/payments/mock/simulate',
      }),
    },
  };
};

export const getPaymentForTransaction = async (transactionId: string, userId: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { payment: true },
  });

  if (!transaction) {
    throw new AppError(404, 'Transaction not found');
  }

  if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
    throw new AppError(403, 'Access denied');
  }

  if (!transaction.payment) {
    throw new AppError(404, 'No payment found for this transaction');
  }

  return serializePayment(transaction.payment);
};

export const processPaymentSuccess = async (
  tx: Prisma.TransactionClient,
  payment: { id: string; transactionId: string },
  input: {
    providerReference?: string;
    paidAt?: Date;
  },
) => {
  const updatedPayment = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: 'SUCCEEDED',
      escrowStatus: 'HELD',
      providerReference: input.providerReference,
      paidAt: input.paidAt ?? new Date(),
    },
  });

  await tx.transaction.update({
    where: { id: payment.transactionId },
    data: {
      status: 'PAYMENT_CONFIRMED',
      paymentMethod: updatedPayment.provider,
      paymentReference: updatedPayment.providerReference ?? updatedPayment.externalReference,
    },
  });

  return updatedPayment;
};

export const processPaymentFailure = async (
  tx: Prisma.TransactionClient,
  paymentId: string,
  reason?: string,
) =>
  tx.payment.update({
    where: { id: paymentId },
    data: {
      status: 'FAILED',
      metadata: reason ? { failureReason: reason } : undefined,
    },
  });

export const processEscrowRefund = async (
  tx: Prisma.TransactionClient,
  payment: { id: string; transactionId: string },
  refundReference?: string,
) => {
  const reference = refundReference ?? generateRefundReference();

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: 'REFUNDED',
      escrowStatus: 'REFUNDED',
      refundedAt: new Date(),
      refundReference: reference,
    },
  });

  await tx.transaction.update({
    where: { id: payment.transactionId },
    data: {
      status: 'REFUNDED',
      cancelledAt: new Date(),
    },
  });

  return reference;
};

export const processEscrowRelease = async (
  tx: Prisma.TransactionClient,
  payment: { id: string; transactionId: string },
): Promise<{ transaction: Prisma.TransactionGetPayload<object>; alreadyReleased: boolean }> => {
  const currentPayment = await tx.payment.findUnique({
    where: { id: payment.id },
  });

  if (!currentPayment) {
    throw new AppError(404, 'Payment not found');
  }

  if (currentPayment.escrowStatus === 'RELEASED') {
    const transaction = await tx.transaction.findUniqueOrThrow({
      where: { id: payment.transactionId },
    });
    return { transaction, alreadyReleased: true };
  }

  if (currentPayment.escrowStatus !== 'HELD') {
    throw new AppError(400, 'Escrow funds are not available for release');
  }

  const releaseResult = await tx.payment.updateMany({
    where: { id: payment.id, escrowStatus: 'HELD' },
    data: {
      escrowStatus: 'RELEASED',
      releasedAt: new Date(),
    },
  });

  if (releaseResult.count === 0) {
    const transaction = await tx.transaction.findUniqueOrThrow({
      where: { id: payment.transactionId },
    });
    return { transaction, alreadyReleased: true };
  }

  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: payment.transactionId },
    include: { listing: true },
  });

  await tx.listing.update({
    where: { id: transaction.listingId },
    data: {
      status: transaction.listing.quantity === 0 ? 'SOLD' : transaction.listing.status,
    },
  });

  const updatedTransaction = await tx.transaction.update({
    where: { id: payment.transactionId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      fundsReleasedAt: new Date(),
    },
  });

  return { transaction: updatedTransaction, alreadyReleased: false };
};

export const releaseEscrowFunds = async (paymentId: string) =>
  prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    return processEscrowRelease(tx, payment);
  });

export const handleMockPaymentWebhook = async (input: MockPaymentWebhookInput) => {
  const payment = await prisma.payment.findUnique({
    where: { externalReference: input.externalReference },
    include: { transaction: true },
  });

  if (!payment) {
    throw new AppError(404, 'Payment not found');
  }

  if (input.event === 'payment.succeeded') {
    if (payment.status === 'SUCCEEDED') {
      return { payment, transaction: payment.transaction, duplicate: true };
    }

    if (payment.status !== 'PENDING' && payment.status !== 'PROCESSING') {
      throw new AppError(400, 'Payment cannot be marked as succeeded');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedPayment = await processPaymentSuccess(tx, payment, {
        providerReference:
          input.providerReference ?? generateProviderReference(payment.provider),
        paidAt: input.paidAt,
      });

      const transaction = await tx.transaction.findUniqueOrThrow({
        where: { id: payment.transactionId },
      });

      return { payment: updatedPayment, transaction };
    });

    return { ...result, duplicate: false };
  }

  if (input.event === 'payment.failed') {
    const updated = await prisma.$transaction(async (tx) => {
      const failedPayment = await processPaymentFailure(tx, payment.id, input.failureReason);
      return { payment: failedPayment, transaction: payment.transaction };
    });

    return { ...updated, duplicate: false };
  }

  if (input.event === 'refund.succeeded') {
    if (payment.escrowStatus === 'REFUNDED') {
      return { payment, transaction: payment.transaction, duplicate: true };
    }

    if (payment.escrowStatus !== 'HELD') {
      throw new AppError(400, 'Only held escrow funds can be refunded');
    }

    const result = await prisma.$transaction(async (tx) => {
      await processEscrowRefund(tx, payment, input.refundReference);
      const updatedPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const transaction = await tx.transaction.findUniqueOrThrow({
        where: { id: payment.transactionId },
      });
      return { payment: updatedPayment, transaction };
    });

    return { ...result, duplicate: false };
  }

  throw new AppError(400, 'Unsupported webhook event');
};

export const simulateMockPayment = async (externalReference: string) => {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    throw new AppError(400, 'Mock payment simulation is only available in mock mode');
  }

  const payment = await prisma.payment.findUnique({
    where: { externalReference },
  });

  if (!payment) {
    throw new AppError(404, 'Payment not found');
  }

  return handleMockPaymentWebhook({
    event: 'payment.succeeded',
    externalReference,
    providerReference: generateProviderReference(payment.provider),
    amount: serializeDecimal(payment.amount),
    currency: payment.currency,
    paidAt: new Date(),
  });
};

export const initiateEscrowRefund = async (transactionId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { transactionId },
  });

  if (!payment) {
    return null;
  }

  if (payment.escrowStatus !== 'HELD') {
    return null;
  }

  if (env.PAYMENT_PROVIDER === 'mock') {
    return handleMockPaymentWebhook({
      event: 'refund.succeeded',
      externalReference: payment.externalReference,
      refundReference: generateRefundReference(),
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const reference = await processEscrowRefund(tx, payment);
    const updatedPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const transaction = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    return { payment: updatedPayment, transaction, refundReference: reference };
  });

  return result;
};

export type SerializedPayment = ReturnType<typeof serializePayment>;

import { Prisma, TransactionStatus } from '@prisma/client';
import { createNotifications } from './notification.service';

type DbClient = Prisma.TransactionClient | undefined;

const transactionData = (transactionId: string, extra?: Record<string, unknown>) => ({
  transactionId,
  ...extra,
});

export const notifyNewMessage = async (
  input: {
    recipientId: string;
    chatId: string;
    messageId: string;
    senderName: string;
    preview: string;
    listingId?: string | null;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.recipientId,
        type: 'MESSAGE',
        title: `New message from ${input.senderName}`,
        body: input.preview.slice(0, 200),
        data: {
          chatId: input.chatId,
          messageId: input.messageId,
          listingId: input.listingId ?? undefined,
        },
      },
    ],
    tx,
  );

export const notifyPaymentEscrowHeld = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
    amount: string | number;
    currency: string;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: 'Payment confirmed',
        body: `Your payment for "${input.listingTitle}" is secured in escrow (${input.amount} ${input.currency}).`,
        data: transactionData(input.transactionId, { status: 'PAYMENT_CONFIRMED' }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'Payment received — escrow held',
        body: `A buyer paid for "${input.listingTitle}". Funds are held in escrow until pickup is verified.`,
        data: transactionData(input.transactionId, { status: 'PAYMENT_CONFIRMED' }),
      },
    ],
    tx,
  );

export const notifyPickupOtpReady = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
    regenerated?: boolean;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: input.regenerated ? 'New pickup release code' : 'Pickup release code ready',
        body: `Your release code for "${input.listingTitle}" is ready. Share it with the seller only after you collect the item.`,
        data: transactionData(input.transactionId, {
          status: 'IN_PROGRESS',
          event: 'pickup_otp_ready',
        }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'Buyer confirmed pickup',
        body: `The buyer confirmed pickup for "${input.listingTitle}". Ask them for the release code to receive payment.`,
        data: transactionData(input.transactionId, {
          status: 'IN_PROGRESS',
          event: 'pickup_confirmed',
        }),
      },
    ],
    tx,
  );

export const notifyVerificationReview = async (
  input: {
    userId: string;
    verificationId: string;
    status: 'APPROVED' | 'REJECTED' | 'RESUBMIT_REQUIRED';
    requestedType: string;
    rejectionReason?: string | null;
  },
  tx?: DbClient,
) => {
  const readableStatus = input.status.toLowerCase().replace(/_/g, ' ');
  const body =
    input.status === 'APPROVED'
      ? `You are now verified as ${input.requestedType.replace(/_/g, ' ').toLowerCase()}. You can create listings.`
      : input.rejectionReason ?? 'Your seller verification request was updated.';

  return createNotifications(
    [
      {
        userId: input.userId,
        type: 'VERIFICATION',
        title: `Seller verification ${readableStatus}`,
        body,
        data: {
          verificationId: input.verificationId,
          status: input.status,
        },
      },
    ],
    tx,
  );
};

export const notifyTransactionStatusChange = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
    status: TransactionStatus;
    buyerMessage: string;
    sellerMessage: string;
    event?: string;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: `Transaction ${input.status.toLowerCase().replace(/_/g, ' ')}`,
        body: input.buyerMessage.replace('{listing}', input.listingTitle),
        data: transactionData(input.transactionId, {
          status: input.status,
          event: input.event,
        }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: `Transaction ${input.status.toLowerCase().replace(/_/g, ' ')}`,
        body: input.sellerMessage.replace('{listing}', input.listingTitle),
        data: transactionData(input.transactionId, {
          status: input.status,
          event: input.event,
        }),
      },
    ],
    tx,
  );

export const notifyTransactionCreated = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: 'Order started',
        body: `Complete payment to secure your purchase of "${input.listingTitle}".`,
        data: transactionData(input.transactionId, { status: 'PENDING', event: 'created' }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'New purchase started',
        body: `A buyer started a purchase for "${input.listingTitle}". Awaiting payment.`,
        data: transactionData(input.transactionId, { status: 'PENDING', event: 'created' }),
      },
    ],
    tx,
  );

export const notifyTransactionCompleted = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: 'Transaction completed',
        body: `Your purchase of "${input.listingTitle}" is complete.`,
        data: transactionData(input.transactionId, { status: 'COMPLETED', event: 'completed' }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'Payment released',
        body: `Escrow funds for "${input.listingTitle}" have been released to you.`,
        data: transactionData(input.transactionId, { status: 'COMPLETED', event: 'funds_released' }),
      },
    ],
    tx,
  );

export const notifyTransactionCancelled = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
    refunded: boolean;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: input.refunded ? 'Order cancelled — refunded' : 'Order cancelled',
        body: input.refunded
          ? `Your order for "${input.listingTitle}" was cancelled and escrow funds were refunded.`
          : `Your order for "${input.listingTitle}" was cancelled.`,
        data: transactionData(input.transactionId, {
          status: input.refunded ? 'REFUNDED' : 'CANCELLED',
          event: 'cancelled',
        }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'Order cancelled',
        body: `The order for "${input.listingTitle}" was cancelled.`,
        data: transactionData(input.transactionId, {
          status: input.refunded ? 'REFUNDED' : 'CANCELLED',
          event: 'cancelled',
        }),
      },
    ],
    tx,
  );

export const notifyTransactionDisputed = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: 'Transaction disputed',
        body: `A dispute was opened for "${input.listingTitle}". Escrow funds remain held.`,
        data: transactionData(input.transactionId, { status: 'DISPUTED', event: 'disputed' }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'Transaction disputed',
        body: `A dispute was opened for "${input.listingTitle}". Escrow funds remain held.`,
        data: transactionData(input.transactionId, { status: 'DISPUTED', event: 'disputed' }),
      },
    ],
    tx,
  );

export const notifyTransactionRefunded = async (
  input: {
    buyerId: string;
    sellerId: string;
    transactionId: string;
    listingTitle: string;
  },
  tx?: DbClient,
) =>
  createNotifications(
    [
      {
        userId: input.buyerId,
        type: 'TRANSACTION',
        title: 'Refund processed',
        body: `Escrow funds for "${input.listingTitle}" were refunded to you.`,
        data: transactionData(input.transactionId, { status: 'REFUNDED', event: 'refunded' }),
      },
      {
        userId: input.sellerId,
        type: 'TRANSACTION',
        title: 'Order refunded',
        body: `The order for "${input.listingTitle}" was refunded to the buyer.`,
        data: transactionData(input.transactionId, { status: 'REFUNDED', event: 'refunded' }),
      },
    ],
    tx,
  );

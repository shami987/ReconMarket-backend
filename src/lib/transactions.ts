import { Prisma, TransactionStatus } from '@prisma/client';
import { env } from '../config/env';

export const ACTIVE_TRANSACTION_STATUSES: TransactionStatus[] = [
  'PENDING',
  'PAYMENT_CONFIRMED',
  'IN_PROGRESS',
  'DISPUTED',
];

export const TRANSACTION_TRANSITIONS: Record<
  TransactionStatus,
  TransactionStatus[]
> = {
  PENDING: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
  REFUNDED: [],
};

export const calculateTransactionAmounts = (
  unitPrice: Prisma.Decimal,
  quantity: number,
): { amount: Prisma.Decimal; platformFee: Prisma.Decimal } => {
  const subtotal = unitPrice.mul(quantity);
  const platformFee = subtotal
    .mul(env.PLATFORM_FEE_PERCENT)
    .div(100)
    .toDecimalPlaces(2);

  return {
    amount: subtotal.toDecimalPlaces(2),
    platformFee,
  };
};

export const assertStatusTransition = (
  current: TransactionStatus,
  next: TransactionStatus,
): void => {
  if (!TRANSACTION_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid transition from ${current} to ${next}`);
  }
};

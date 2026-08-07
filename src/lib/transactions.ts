import { Prisma, TransactionStatus } from '@prisma/client';

export const ACTIVE_TRANSACTION_STATUSES: TransactionStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'DISPUTED',
];

export const TRANSACTION_TRANSITIONS: Record<
  TransactionStatus,
  TransactionStatus[]
> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
  REFUNDED: [],
};

export const calculateTransactionAmounts = (
  unitPrice: Prisma.Decimal,
  quantity: number,
): { amount: Prisma.Decimal } => {
  const amount = unitPrice.mul(quantity).toDecimalPlaces(2);

  return { amount };
};

export const assertStatusTransition = (
  current: TransactionStatus,
  next: TransactionStatus,
): void => {
  if (!TRANSACTION_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid transition from ${current} to ${next}`);
  }
};

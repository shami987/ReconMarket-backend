import { z } from 'zod';
import { idParamSchema, paginationSchema } from './common';

export const transactionStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'REFUNDED',
]);

export const createTransactionSchema = z.object({
  listingId: z.uuid(),
  quantity: z.coerce.number().int().positive().default(1),
  notes: z.string().max(1000).optional(),
});

export const listTransactionsQuerySchema = paginationSchema.extend({
  status: transactionStatusSchema.optional(),
  role: z.enum(['buyer', 'seller', 'all']).default('all'),
});

export const transactionIdParamSchema = idParamSchema;

export const cancelTransactionSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

export const disputeTransactionSchema = z.object({
  reason: z.string().min(10).max(1000),
});

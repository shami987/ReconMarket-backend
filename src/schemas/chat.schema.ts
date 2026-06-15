import { z } from 'zod';
import { idParamSchema, paginationSchema } from './common';

export const messageTypeSchema = z.enum(['TEXT', 'IMAGE']);

export const startChatSchema = z.object({
  listingId: z.uuid(),
  buyerId: z.uuid().optional(),
  transactionId: z.uuid().optional(),
  initialMessage: z.string().min(1).max(5000).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  type: messageTypeSchema.default('TEXT'),
});

export const listChatsQuerySchema = paginationSchema;

export const listMessagesQuerySchema = paginationSchema.extend({
  since: z.coerce.date().optional(),
});

export const chatIdParamSchema = idParamSchema;

export const messageIdParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

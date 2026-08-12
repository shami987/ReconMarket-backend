import { z } from 'zod';
import { idParamSchema, paginationSchema } from './common';

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200, 'Subject must be at most 200 characters'),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(5000, 'Message must be at most 5000 characters'),
});

export const listSupportTicketsQuerySchema = paginationSchema.extend({
  status: z
    .enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
    .optional(),
});

export const supportTicketIdParamSchema = idParamSchema;

export const supportTicketReplySchema = z.object({
  reply: z.string().trim().min(1, 'Reply cannot be empty').max(5000, 'Reply must be at most 5000 characters'),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
});
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid id'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

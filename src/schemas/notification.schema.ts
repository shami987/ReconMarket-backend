import { z } from 'zod';
import { idParamSchema, paginationSchema } from './common';

export const notificationTypeSchema = z.enum([
  'TRANSACTION',
  'MESSAGE',
  'LISTING',
  'REVIEW',
  'VERIFICATION',
  'SYSTEM',
]);

export const listNotificationsQuerySchema = paginationSchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  type: notificationTypeSchema.optional(),
});

export const notificationIdParamSchema = idParamSchema;

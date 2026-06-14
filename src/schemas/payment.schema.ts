import { z } from 'zod';

export const paymentProviderSchema = z.enum(['MTN_MOMO', 'AIRTEL_MONEY']);

export const createPaymentIntentSchema = z.object({
  provider: paymentProviderSchema,
  payerPhone: z
    .string()
    .regex(/^(\+250|250|0)?7[2389]\d{7}$/, 'Invalid Rwanda mobile number')
    .optional(),
});

export const mockPaymentWebhookSchema = z.object({
  event: z.enum(['payment.succeeded', 'payment.failed', 'refund.succeeded']),
  externalReference: z.string().min(1),
  providerReference: z.string().optional(),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().length(3).optional(),
  paidAt: z.coerce.date().optional(),
  failureReason: z.string().optional(),
  refundReference: z.string().optional(),
});

export const simulateMockPaymentSchema = z.object({
  externalReference: z.string().min(1),
});

export type MockPaymentWebhookInput = z.infer<typeof mockPaymentWebhookSchema>;

export const confirmPickupSchema = z.object({
  pickupPhotoUrl: z.url(),
});

export const verifyReleaseOtpSchema = z.object({
  code: z.string().length(6, 'OTP must be 6 digits'),
});

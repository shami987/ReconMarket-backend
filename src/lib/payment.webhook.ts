import crypto from 'crypto';
import { env } from '../config/env';

export const signWebhookPayload = (payload: string): string =>
  crypto.createHmac('sha256', env.MOCK_PAYMENT_WEBHOOK_SECRET).update(payload).digest('hex');

export const verifyWebhookSignature = (payload: string, signature: string | undefined): boolean => {
  if (!signature) {
    return false;
  }

  const expected = signWebhookPayload(payload);
  const provided = signature.replace(/^sha256=/, '');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
};

export const generateExternalPaymentReference = (): string =>
  `MOCK-${crypto.randomUUID()}`;

export const generateProviderReference = (provider: string): string =>
  `${provider}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

export const generateRefundReference = (): string =>
  `REF-${crypto.randomUUID()}`;

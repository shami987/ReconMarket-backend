import { Router } from 'express';
import { env } from '../config/env';
import { verifyWebhookSignature } from '../lib/payment.webhook';
import { AppError } from '../errors/AppError';
import { mockPaymentWebhookSchema, simulateMockPaymentSchema } from '../schemas/payment.schema';
import {
  handleMockPaymentWebhook,
  simulateMockPayment,
} from '../services/payment.service';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post(
  '/payments/mock',
  asyncHandler(async (req, res) => {
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body);

    const signature = req.headers['x-webhook-signature'];
    if (!verifyWebhookSignature(rawBody, typeof signature === 'string' ? signature : undefined)) {
      throw new AppError(401, 'Invalid webhook signature');
    }

    const payload = mockPaymentWebhookSchema.parse(JSON.parse(rawBody));
    const result = await handleMockPaymentWebhook(payload);

    res.json({
      received: true,
      duplicate: result.duplicate ?? false,
      payment: result.payment,
      transaction: result.transaction,
    });
  }),
);

export default router;

export const paymentDevRouter = Router();

paymentDevRouter.post(
  '/mock/simulate',
  validate(simulateMockPaymentSchema),
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === 'production') {
      throw new AppError(403, 'Payment simulation is disabled in production');
    }

    const result = await simulateMockPayment(req.body.externalReference);

    res.json({
      message: 'Mock payment processed as if webhook payment.succeeded was received',
      duplicate: result.duplicate ?? false,
      payment: result.payment,
      transaction: result.transaction,
    });
  }),
);

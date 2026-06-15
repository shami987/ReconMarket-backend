import { Router } from 'express';
import {
  cancelTransactionSchema,
  createTransactionSchema,
  disputeTransactionSchema,
  listTransactionsQuerySchema,
  transactionIdParamSchema,
} from '../schemas/transaction.schema';
import {
  confirmPickupSchema,
  createPaymentIntentSchema,
  verifyReleaseOtpSchema,
} from '../schemas/payment.schema';
import * as paymentService from '../services/payment.service';
import * as pickupService from '../services/pickup.service';
import * as transactionService from '../services/transaction.service';
import { uploadPickupPhotoToCloudinary } from '../services/upload.service';
import { AppError } from '../errors/AppError';
import { authenticate } from '../middleware/authenticate';
import { canBuy } from '../middleware/authorize';
import { uploadPickupPhoto } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

router.get(
  '/me',
  authenticate,
  validate(listTransactionsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await transactionService.listMyTransactions(
      req.user!.id,
      req.validatedQuery as Parameters<typeof transactionService.listMyTransactions>[1],
    );
    res.json(result);
  }),
);

router.get(
  '/:id',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.getTransactionById(
      req.params.id as string,
      req.user!,
    );
    res.json({ transaction });
  }),
);

router.post(
  '/',
  authenticate,
  canBuy,
  validate(createTransactionSchema),
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.createTransaction(req.user!.id, req.body);
    res.status(201).json({
      transaction,
      message: 'Transaction created. Initiate payment to secure escrow funds.',
    });
  }),
);

router.post(
  '/:id/payments/intent',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  validate(createPaymentIntentSchema),
  asyncHandler(async (req, res) => {
    const result = await paymentService.createPaymentIntent(
      req.params.id as string,
      req.user!.id,
      req.body,
    );
    res.status(201).json(result);
  }),
);

router.get(
  '/:id/payment',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const payment = await paymentService.getPaymentForTransaction(
      req.params.id as string,
      req.user!.id,
    );
    res.json({ payment });
  }),
);

router.get(
  '/:id/pickup',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const result = await pickupService.getPickupStatus(req.params.id as string, req.user!);
    res.json(result);
  }),
);

router.post(
  '/:id/confirm-pickup',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  uploadPickupPhoto,
  asyncHandler(async (req, res) => {
    let pickupPhotoUrl = req.body.pickupPhotoUrl as string | undefined;
    const file = req.file as Express.Multer.File | undefined;

    if (file) {
      const uploaded = await uploadPickupPhotoToCloudinary(file);
      pickupPhotoUrl = uploaded.url;
    }

    if (!pickupPhotoUrl) {
      throw new AppError(
        400,
        'Pickup photo is required. Upload multipart field pickupPhoto or provide pickupPhotoUrl.',
      );
    }

    confirmPickupSchema.parse({ pickupPhotoUrl });

    const result = await pickupService.confirmPickup(
      req.params.id as string,
      req.user!,
      pickupPhotoUrl,
    );
    res.json(result);
  }),
);

router.post(
  '/:id/regenerate-release-otp',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const result = await pickupService.regenerateReleaseOtp(req.params.id as string, req.user!);
    res.json(result);
  }),
);

router.post(
  '/:id/verify-release-otp',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  validate(verifyReleaseOtpSchema),
  asyncHandler(async (req, res) => {
    const result = await pickupService.verifyReleaseOtp(
      req.params.id as string,
      req.user!,
      req.body.code,
    );
    res.json(result);
  }),
);

router.patch(
  '/:id/cancel',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  validate(cancelTransactionSchema),
  asyncHandler(async (req, res) => {
    const result = await transactionService.cancelTransaction(
      req.params.id as string,
      req.user!,
      req.body.reason,
    );
    res.json(result);
  }),
);

router.patch(
  '/:id/dispute',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  validate(disputeTransactionSchema),
  asyncHandler(async (req, res) => {
    const result = await transactionService.disputeTransaction(
      req.params.id as string,
      req.user!,
      req.body.reason,
    );
    res.json(result);
  }),
);

router.patch(
  '/:id/refund',
  authenticate,
  validate(transactionIdParamSchema, 'params'),
  validate(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const result = await transactionService.refundTransaction(
      req.params.id as string,
      req.user!,
      req.body.reason,
    );
    res.json(result);
  }),
);

export default router;

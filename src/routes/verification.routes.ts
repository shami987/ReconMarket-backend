import { Router } from 'express';
import { applyVerificationSchema } from '../schemas/verification.schema';
import * as verificationService from '../services/verification.service';
import { authenticate } from '../middleware/authenticate';
import { requireEmailVerified } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post(
  '/apply',
  authenticate,
  requireEmailVerified,
  validate(applyVerificationSchema),
  asyncHandler(async (req, res) => {
    const verification = await verificationService.applyForSellerVerification(
      req.user!.id,
      req.body,
    );
    res.status(201).json({
      message: 'Verification request submitted. An admin will review your documents.',
      verification,
    });
  }),
);

router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const status = await verificationService.getVerificationStatus(req.user!.id);
    res.json(status);
  }),
);

export default router;

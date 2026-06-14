import { Router } from 'express';
import { updateRoleSchema } from '../schemas/auth.schema';
import { reviewVerificationSchema } from '../schemas/verification.schema';
import { adminCategoryRouter } from './category.routes';
import * as authService from '../services/auth.service';
import * as verificationService from '../services/verification.service';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.use('/categories', adminCategoryRouter);

router.get(
  '/verifications/pending',
  asyncHandler(async (_req, res) => {
    const verifications = await verificationService.listPendingVerifications();
    res.json({ verifications });
  }),
);

router.patch(
  '/verifications/:id',
  validate(reviewVerificationSchema),
  asyncHandler(async (req, res) => {
    const result = await verificationService.reviewVerification(
      req.user!.id,
      req.params.id as string,
      req.body,
    );
    res.json(result);
  }),
);

router.patch(
  '/users/:id/role',
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.updateUserRole(
      req.user!.id,
      req.params.id as string,
      req.body.role,
    );
    res.json({ user });
  }),
);

export default router;

import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  }),
);

router.post(
  '/logout',
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.json({ message: 'Logged out successfully' });
  }),
);

router.post(
  '/refresh',
  validate(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refreshSession(req.body.refreshToken);
    res.json(result);
  }),
);

router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.verifyEmail(req.body);
    res.json(result);
  }),
);

router.post(
  '/resend-verification',
  validate(resendVerificationSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resendVerificationEmail(req.body.email);
    res.json(result);
  }),
);

router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email);
    res.json(result);
  }),
);

router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    res.json(result);
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!.id);
    res.json({ user });
  }),
);

export default router;

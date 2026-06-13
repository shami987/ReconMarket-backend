import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(10).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
});

export const resendVerificationSchema = z.object({
  email: z.email(),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = refreshTokenSchema;

export const updateRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
});

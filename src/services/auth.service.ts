import { User } from '@prisma/client';
import { AppError } from '../errors/AppError';
import {
  parseDurationToMs,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt';
import { comparePassword, hashPassword, hashToken } from '../lib/password';
import { prisma } from '../lib/prisma';
import { publicUserSelect, toPublicUser } from '../utils/userSelect';
import { createOtp, sendOtpEmail, verifyOtp } from './otp.service';
import { env } from '../config/env';

const issueTokens = async (user: User) => {
  const refreshRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: '',
      expiresAt: new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN)),
    },
  });

  const refreshToken = signRefreshToken(user.id, refreshRecord.id);
  const tokenHash = await hashToken(refreshToken);

  await prisma.refreshToken.update({
    where: { id: refreshRecord.id },
    data: { tokenHash },
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
  };
};

export const register = async (input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}) => {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.email },
        ...(input.phone ? [{ phone: input.phone }] : []),
      ],
      deletedAt: null,
    },
  });

  if (existing) {
    throw new AppError(409, 'Email or phone already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      phone: input.phone,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    select: publicUserSelect,
  });

  const code = await createOtp({
    purpose: 'EMAIL_VERIFICATION',
    email: user.email,
    userId: user.id,
  });
  await sendOtpEmail(user.email, 'EMAIL_VERIFICATION', code);

  const tokens = await issueTokens(user as User);

  return {
    user: toPublicUser(user),
    ...tokens,
    message: 'Registration successful. Please verify your email.',
  };
};

export const login = async (input: { email: string; password: string }) => {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null, isActive: true },
    select: { ...publicUserSelect, passwordHash: true },
  });

  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const isValid = await comparePassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const { passwordHash: _, ...publicUser } = user;

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await issueTokens(user as User);

  return {
    user: toPublicUser(publicUser),
    ...tokens,
  };
};

export const logout = async (refreshToken: string) => {
  try {
    const payload = verifyRefreshToken(refreshToken);
    const record = await prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    if (record && !record.revokedAt) {
      const matches = await import('../lib/password').then((m) =>
        m.compareToken(refreshToken, record.tokenHash),
      );
      if (matches) {
        await prisma.refreshToken.update({
          where: { id: record.id },
          data: { revokedAt: new Date() },
        });
      }
    }
  } catch {
    // Token invalid or expired — logout is idempotent
  }
};

export const refreshSession = async (refreshToken: string) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const record = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const { compareToken } = await import('../lib/password');
  const matches = await compareToken(refreshToken, record.tokenHash);
  if (!matches) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, isActive: true },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AppError(401, 'Account is inactive');
  }

  const tokens = await issueTokens(user as User);

  return {
    user: toPublicUser(user),
    ...tokens,
  };
};

export const verifyEmail = async (input: { email: string; code: string }) => {
  const { userId } = await verifyOtp({
    purpose: 'EMAIL_VERIFICATION',
    email: input.email,
    code: input.code,
  });

  const user = await prisma.user.update({
    where: userId ? { id: userId } : { email: input.email },
    data: { isEmailVerified: true },
    select: publicUserSelect,
  });

  return { user: toPublicUser(user), message: 'Email verified successfully' };
};

export const resendVerificationEmail = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.deletedAt) {
    return { message: 'If the account exists, a verification email has been sent.' };
  }

  if (user.isEmailVerified) {
    throw new AppError(400, 'Email is already verified');
  }

  const code = await createOtp({
    purpose: 'EMAIL_VERIFICATION',
    email: user.email,
    userId: user.id,
  });
  await sendOtpEmail(user.email, 'EMAIL_VERIFICATION', code);

  return { message: 'If the account exists, a verification email has been sent.' };
};

export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && !user.deletedAt && user.isActive) {
    const code = await createOtp({
      purpose: 'PASSWORD_RESET',
      email: user.email,
      userId: user.id,
    });
    await sendOtpEmail(user.email, 'PASSWORD_RESET', code);
  }

  return { message: 'If the account exists, a password reset code has been sent.' };
};

export const resetPassword = async (input: {
  email: string;
  code: string;
  newPassword: string;
}) => {
  const { userId } = await verifyOtp({
    purpose: 'PASSWORD_RESET',
    email: input.email,
    code: input.code,
  });

  if (!userId) {
    throw new AppError(400, 'Invalid reset request');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { message: 'Password reset successfully. Please log in again.' };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  return toPublicUser(user);
};

export const updateUserRole = async (
  adminId: string,
  userId: string,
  role: 'USER' | 'ADMIN',
) => {
  if (adminId === userId && role !== 'ADMIN') {
    throw new AppError(400, 'You cannot demote yourself');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: publicUserSelect,
  });

  return toPublicUser(user);
};

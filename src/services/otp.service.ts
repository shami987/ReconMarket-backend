import { OtpPurpose } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { generateOtpCode } from '../lib/jwt';
import { hashToken } from '../lib/password';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

const invalidateExistingOtps = async (
  purpose: OtpPurpose,
  email?: string,
  userId?: string,
): Promise<void> => {
  await prisma.otp.updateMany({
    where: {
      purpose,
      usedAt: null,
      ...(email && { email }),
      ...(userId && { userId }),
    },
    data: { usedAt: new Date() },
  });
};

export const createOtp = async (params: {
  purpose: OtpPurpose;
  email: string;
  userId?: string;
}): Promise<string> => {
  const code = generateOtpCode();
  const codeHash = await hashToken(code);
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000);

  await invalidateExistingOtps(params.purpose, params.email, params.userId);

  await prisma.otp.create({
    data: {
      email: params.email,
      userId: params.userId,
      codeHash,
      purpose: params.purpose,
      expiresAt,
    },
  });

  return code;
};

export const verifyOtp = async (params: {
  purpose: OtpPurpose;
  email: string;
  code: string;
}): Promise<{ userId?: string }> => {
  const otp = await prisma.otp.findFirst({
    where: {
      email: params.email,
      purpose: params.purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AppError(400, 'Invalid or expired verification code');
  }

  if (otp.attempts >= otp.maxAttempts) {
    throw new AppError(429, 'Too many attempts. Request a new code.');
  }

  const { compareToken } = await import('../lib/password');
  const isValid = await compareToken(params.code, otp.codeHash);

  if (!isValid) {
    await prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, 'Invalid or expired verification code');
  }

  await prisma.otp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  return { userId: otp.userId ?? undefined };
};

export const sendOtpEmail = async (
  email: string,
  purpose: OtpPurpose,
  code: string,
): Promise<void> => {
  const subjects: Record<OtpPurpose, string> = {
    EMAIL_VERIFICATION: 'Verify your ReconMarket email',
    PHONE_VERIFICATION: 'Verify your ReconMarket phone',
    PASSWORD_RESET: 'Reset your ReconMarket password',
    LOGIN: 'Your ReconMarket login code',
  };

  logger.info(
    { email, purpose, subject: subjects[purpose] },
    `[DEV EMAIL] OTP for ${email}: ${code}`,
  );
};

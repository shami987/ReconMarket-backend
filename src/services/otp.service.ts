import { OtpPurpose } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { generateOtpCode } from '../lib/jwt';
import { compareToken, hashToken } from '../lib/password';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mail';
import { prisma } from '../lib/prisma';

const invalidateExistingOtps = async (
  purpose: OtpPurpose,
  filters: { email?: string; userId?: string; transactionId?: string },
): Promise<void> => {
  await prisma.otp.updateMany({
    where: {
      purpose,
      usedAt: null,
      ...(filters.email && { email: filters.email }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.transactionId && { transactionId: filters.transactionId }),
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

  await invalidateExistingOtps(params.purpose, {
    email: params.email,
    userId: params.userId,
  });

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

export const createPickupReleaseOtp = async (params: {
  transactionId: string;
  buyerId: string;
  buyerEmail: string;
}): Promise<string> => {
  const code = generateOtpCode();
  const codeHash = await hashToken(code);
  const expiresAt = new Date(Date.now() + env.PICKUP_OTP_EXPIRES_MINUTES * 60 * 1000);

  await invalidateExistingOtps('PICKUP_RELEASE', { transactionId: params.transactionId });

  await prisma.otp.create({
    data: {
      transactionId: params.transactionId,
      userId: params.buyerId,
      email: params.buyerEmail,
      codeHash,
      purpose: 'PICKUP_RELEASE',
      expiresAt,
    },
  });

  logger.info(
    { transactionId: params.transactionId, buyerEmail: params.buyerEmail },
    `[DEV PICKUP OTP] Release code for transaction ${params.transactionId}: ${code}`,
  );

  return code;
};

export const verifyPickupReleaseOtp = async (params: {
  transactionId: string;
  code: string;
}): Promise<void> => {
  const otp = await prisma.otp.findFirst({
    where: {
      transactionId: params.transactionId,
      purpose: 'PICKUP_RELEASE',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AppError(400, 'Invalid or expired pickup release code');
  }

  if (otp.attempts >= otp.maxAttempts) {
    throw new AppError(429, 'Too many attempts. Buyer must confirm pickup again.');
  }

  const { compareToken } = await import('../lib/password');
  const isValid = await compareToken(params.code, otp.codeHash);

  if (!isValid) {
    await prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, 'Invalid or expired pickup release code');
  }

  await prisma.otp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });
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
    PICKUP_RELEASE: 'Your ReconMarket pickup release code',
  };

  try {
    await sendMail({
      to: email,
      subject: template.subject,
      html: template.html,
    });
  } catch (err) {
    logger.error({ err, email, purpose }, 'Failed to send OTP email — user can still use the code from logs');
    logger.info({ email, purpose, code }, `[DEV FALLBACK] OTP code for ${email}: ${code}`);
  }
};

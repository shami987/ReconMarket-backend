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

const otpEmailTemplates: Record<OtpPurpose, (code: string) => { subject: string; html: string }> = {
  EMAIL_VERIFICATION: (code) => ({
    subject: 'Verify your ReconMarket email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Email Verification</h2>
        <p>Use the following code to verify your email address:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a2e;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in ${env.OTP_EXPIRES_MINUTES} minutes.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  }),
  PHONE_VERIFICATION: (code) => ({
    subject: 'Verify your ReconMarket phone',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Phone Verification</h2>
        <p>Use the following code to verify your phone number:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a2e;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in ${env.OTP_EXPIRES_MINUTES} minutes.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  }),
  PASSWORD_RESET: (code) => ({
    subject: 'Reset your ReconMarket password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Password Reset</h2>
        <p>You requested a password reset. Use the following code:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a2e;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in ${env.OTP_EXPIRES_MINUTES} minutes.</p>
        <p style="color: #999; font-size: 13px;">If you didn't request a password reset, please secure your account.</p>
      </div>
    `,
  }),
  LOGIN: (code) => ({
    subject: 'Your ReconMarket login code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Login Code</h2>
        <p>Use the following code to complete your login:</p>
        <div style="background: #f4f4f8; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a2e;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in ${env.OTP_EXPIRES_MINUTES} minutes.</p>
        <p style="color: #666; font-size: 14px;">If you didn't attempt to log in, please ignore this email.</p>
      </div>
    `,
  }),
};

export const sendOtpEmail = async (
  email: string,
  purpose: OtpPurpose,
  code: string,
): Promise<void> => {
  const template = otpEmailTemplates[purpose](code);

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

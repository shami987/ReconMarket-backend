import { VerificationStatus, VerificationType } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { notifyVerificationReview } from './notification.triggers';
import { publicUserSelect, toPublicUser } from '../utils/userSelect';

export const applyForSellerVerification = async (
  userId: string,
  input: {
    requestedType: 'INDIVIDUAL_SELLER' | 'BUSINESS_SELLER';
    documentUrl: string;
    businessName?: string;
  },
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.deletedAt) {
    throw new AppError(404, 'User not found');
  }

  if (!user.isEmailVerified) {
    throw new AppError(403, 'Verify your email before applying to sell');
  }

  if (user.verificationType !== 'NONE') {
    throw new AppError(409, 'You are already a verified seller');
  }

  const pending = await prisma.sellerVerification.findFirst({
    where: { userId, status: 'PENDING' },
  });

  if (pending) {
    throw new AppError(409, 'You already have a pending verification request');
  }

  if (input.requestedType === 'BUSINESS_SELLER' && !input.businessName?.trim()) {
    throw new AppError(400, 'Business name is required for business seller verification');
  }

  const verification = await prisma.sellerVerification.create({
    data: {
      userId,
      requestedType: input.requestedType,
      documentUrl: input.documentUrl,
      businessName: input.businessName,
    },
  });

  return verification;
};

export const getVerificationStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      verificationType: true,
      sellerVerifications: {
        orderBy: { submittedAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  return {
    verificationType: user.verificationType,
    canSell:
      user.verificationType === 'INDIVIDUAL_SELLER' ||
      user.verificationType === 'BUSINESS_SELLER',
    requests: user.sellerVerifications,
  };
};

export const listPendingVerifications = async () =>
  prisma.sellerVerification.findMany({
    where: { status: 'PENDING' },
    include: {
      user: { select: publicUserSelect },
    },
    orderBy: { submittedAt: 'asc' },
  });

export const reviewVerification = async (
  adminId: string,
  verificationId: string,
  input: {
    status: 'APPROVED' | 'REJECTED' | 'RESUBMIT_REQUIRED';
    rejectionReason?: string;
  },
) => {
  const verification = await prisma.sellerVerification.findUnique({
    where: { id: verificationId },
    include: { user: true },
  });

  if (!verification) {
    throw new AppError(404, 'Verification request not found');
  }

  if (verification.status !== 'PENDING' && verification.status !== 'RESUBMIT_REQUIRED') {
    throw new AppError(400, 'This verification request has already been reviewed');
  }

  if (
    (input.status === 'REJECTED' || input.status === 'RESUBMIT_REQUIRED') &&
    !input.rejectionReason?.trim()
  ) {
    throw new AppError(400, 'Rejection reason is required');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.sellerVerification.update({
      where: { id: verificationId },
      data: {
        status: input.status as VerificationStatus,
        rejectionReason: input.rejectionReason,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: { user: { select: publicUserSelect } },
    });

    if (input.status === 'APPROVED') {
      await tx.user.update({
        where: { id: verification.userId },
        data: { verificationType: verification.requestedType as VerificationType },
      });
    }

    if (input.status === 'RESUBMIT_REQUIRED') {
      await tx.user.update({
        where: { id: verification.userId },
        data: { verificationType: 'NONE' },
      });
    }

    await notifyVerificationReview(
      {
        userId: verification.userId,
        verificationId,
        status: input.status,
        requestedType: verification.requestedType,
        rejectionReason: input.rejectionReason,
      },
      tx,
    );

    return record;
  });

  return {
    verification: updated,
    user: toPublicUser(updated.user),
  };
};

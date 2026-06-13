import { User } from '@prisma/client';

export const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  verificationType: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = Pick<User, keyof typeof publicUserSelect>;

export const toPublicUser = (user: PublicUser) => ({
  ...user,
  canSell:
    user.verificationType === 'INDIVIDUAL_SELLER' ||
    user.verificationType === 'BUSINESS_SELLER',
});

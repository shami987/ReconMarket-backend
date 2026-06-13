import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { env } from '../config/env';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: User['role'];
  verificationType: User['verificationType'];
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};

export const signAccessToken = (user: User): string => {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    verificationType: user.verificationType,
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const signRefreshToken = (userId: string, tokenId: string): string => {
  const payload: RefreshTokenPayload = { sub: userId, jti: tokenId };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;

export const generateOtpCode = (): string =>
  crypto.randomInt(100000, 999999).toString();

export const parseDurationToMs = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
};

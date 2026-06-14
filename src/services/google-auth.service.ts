import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { User } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { publicUserSelect, toPublicUser } from '../utils/userSelect';

const googleClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
);

export const getGoogleAuthUrl = (): string => {
  return googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'consent',
    redirect_uri: env.GOOGLE_CALLBACK_URL,
  });
};

export const handleGoogleCallback = async (code: string) => {
  const { tokens } = await googleClient.getToken({
    code,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
  });

  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new AppError(401, 'Google authentication failed — no email returned');
  }

  const { email, given_name, family_name, picture, sub: googleId } = payload;

  // Find or create user
  let user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });

  if (user) {
    // Update avatar if Google has one and user doesn't
    if (picture && !user.avatarUrl) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: picture, isEmailVerified: true },
      });
    } else {
      // Ensure email is marked verified for Google users
      if (!user.isEmailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { isEmailVerified: true },
        });
      }
    }
  } else {
    // Generate a random password hash (Google users don't need a password)
    const { hashPassword } = await import('../lib/password');
    const dummyHash = await hashPassword(crypto.randomUUID());

    user = await prisma.user.create({
      data: {
        email,
        firstName: given_name || email.split('@')[0],
        lastName: family_name || '',
        avatarUrl: picture || null,
        passwordHash: dummyHash,
        isEmailVerified: true,
        isActive: true,
      },
    });
  }

  // Issue tokens — need a User object for signAccessToken
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!fullUser) {
    throw new AppError(500, 'Failed to load user after Google auth');
  }

  const { parseDurationToMs, signAccessToken, signRefreshToken } = await import('../lib/jwt');
  const { hashToken } = await import('../lib/password');

  const refreshRecord = await prisma.refreshToken.create({
    data: {
      userId: fullUser.id,
      tokenHash: '',
      expiresAt: new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN)),
    },
  });

  const refreshToken = signRefreshToken(fullUser.id, refreshRecord.id);
  const tokenHash = await hashToken(refreshToken);

  await prisma.refreshToken.update({
    where: { id: refreshRecord.id },
    data: { tokenHash },
  });

  const accessToken = signAccessToken(fullUser);

  const publicUser = await prisma.user.findUnique({
    where: { id: fullUser.id },
    select: publicUserSelect,
  });

  return {
    user: toPublicUser(publicUser!),
    accessToken,
    refreshToken,
  };
};

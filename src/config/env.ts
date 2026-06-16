import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  APP_URL: z.string().url().default('http://localhost:5000'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  OTP_EXPIRES_MINUTES: z.coerce.number().int().positive().default(10),
  PICKUP_OTP_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),

  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('ReconMarket <noreply@reconmarket.com>'),

  SENTRY_DSN: z.string().optional().default(''),

  UPSTASH_REDIS_REST_URL: z.string().optional().default(''),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().url().default('http://localhost:5000/api/auth/google/callback'),

  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
  CLOUDINARY_FOLDER: z.string().default('reconmarket/listings'),
  CLOUDINARY_PICKUP_FOLDER: z.string().default('reconmarket/pickups'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(5),
  MAX_LISTING_IMAGES: z.coerce.number().int().positive().max(20).default(10),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(5),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  MOCK_PAYMENT_WEBHOOK_SECRET: z
    .string()
    .min(16, 'MOCK_PAYMENT_WEBHOOK_SECRET must be at least 16 characters'),
});

export type Env = z.infer<typeof envSchema>;

const DEV_MOCK_WEBHOOK_SECRET = 'dev-mock-payment-webhook-secret';

/** Map legacy JWT_SECRET / JWT_EXPIRES_IN to the split access + refresh config. */
const normalizedEnv = {
  ...process.env,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN:
    process.env.JWT_REFRESH_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? '7d',
  MOCK_PAYMENT_WEBHOOK_SECRET:
    process.env.MOCK_PAYMENT_WEBHOOK_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : DEV_MOCK_WEBHOOK_SECRET),
};

export const env: Env = envSchema.parse(normalizedEnv);

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
  OTP_EXPIRES_MINUTES: z.coerce.number().int().positive().default(10),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
  CLOUDINARY_FOLDER: z.string().default('reconmarket/listings'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(5),
  MAX_LISTING_IMAGES: z.coerce.number().int().positive().max(20).default(10),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(5),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  MOCK_PAYMENT_WEBHOOK_SECRET: z
    .string()
    .min(16, 'MOCK_PAYMENT_WEBHOOK_SECRET must be at least 16 characters'),
  PICKUP_OTP_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

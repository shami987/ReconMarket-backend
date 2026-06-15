import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { logger } from './logger';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const verifyCloudinaryConnection = async (): Promise<boolean> => {
  try {
    await cloudinary.api.ping();
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Cloudinary connection failed');
    return false;
  }
};

export { cloudinary };

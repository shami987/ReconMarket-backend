import { env } from './env';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

export const uploadConfig = {
  maxFileSizeBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  maxListingImages: env.MAX_LISTING_IMAGES,
  cloudinaryFolder: env.CLOUDINARY_FOLDER,
} as const;

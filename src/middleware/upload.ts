import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  uploadConfig,
} from '../config/upload';
import { AppError } from '../errors/AppError';

const isAllowedImage = (file: Express.Multer.File): boolean => {
  const ext = path.extname(file.originalname).toLowerCase();

  return (
    ALLOWED_IMAGE_MIME_TYPES.includes(
      file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    ) && ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])
  );
};

const listingImagesMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: uploadConfig.maxFileSizeBytes,
    files: uploadConfig.maxListingImages,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImage(file)) {
      cb(
        new AppError(
          400,
          `Invalid file type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`,
        ),
      );
      return;
    }

    cb(null, true);
  },
});

const runMulter =
  (middleware: ReturnType<typeof listingImagesMulter.array>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }

      next();
    });
  };

export const uploadListingImages = runMulter(
  listingImagesMulter.array('images', uploadConfig.maxListingImages),
);

const pickupPhotoMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: uploadConfig.maxFileSizeBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImage(file)) {
      cb(
        new AppError(
          400,
          `Invalid file type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`,
        ),
      );
      return;
    }

    cb(null, true);
  },
});

export const uploadPickupPhoto = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  pickupPhotoMulter.single('pickupPhoto')(req, res, (err: unknown) => {
    if (err) {
      next(err);
      return;
    }

    next();
  });
};

import { Router } from 'express';
import { AppError } from '../errors/AppError';
import { authenticate } from '../middleware/authenticate';
import { requireVerifiedSeller } from '../middleware/authorize';
import { uploadListingImages } from '../middleware/upload';
import { uploadListingImagesToCloudinary } from '../services/upload.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post(
  '/listing-images',
  authenticate,
  requireVerifiedSeller,
  uploadListingImages,
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files?.length) {
      throw new AppError(400, 'At least one image file is required (field name: images)');
    }

    const images = await uploadListingImagesToCloudinary(files);

    res.status(201).json({
      images,
      message: 'Images uploaded successfully. Use the returned URLs when creating or updating a listing.',
    });
  }),
);

export default router;

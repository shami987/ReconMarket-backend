import { Router } from 'express';
import { paginationSchema } from '../schemas/common';
import {
  createListingSchema,
  listListingsQuerySchema,
  listingIdParamSchema,
  updateListingSchema,
} from '../schemas/listing.schema';
import * as listingService from '../services/listing.service';
import { AppError } from '../errors/AppError';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate';
import { requireVerifiedSeller } from '../middleware/authorize';
import { uploadListingImages } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

router.get(
  '/',
  validate(listListingsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await listingService.listListings(
      req.validatedQuery as Parameters<typeof listingService.listListings>[0],
    );
    res.json(result);
  }),
);

router.get(
  '/seller/me',
  authenticate,
  validate(
    paginationSchema.extend({
      status: z.enum(['DRAFT', 'ACTIVE', 'SOLD', 'RESERVED', 'EXPIRED', 'REMOVED']).optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const result = await listingService.getMyListings(
      req.user!.id,
      req.validatedQuery as Parameters<typeof listingService.getMyListings>[1],
    );
    res.json(result);
  }),
);

router.get(
  '/seller/:sellerId',
  validate(z.object({ sellerId: z.uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const seller = await listingService.sellerPublicProfile(req.params.sellerId as string);
    res.json({ seller });
  }),
);

router.get(
  '/:id',
  optionalAuthenticate,
  validate(listingIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const listing = await listingService.getListingById(
      req.params.id as string,
      req.user,
      true,
    );
    res.json({ listing });
  }),
);

router.post(
  '/',
  authenticate,
  requireVerifiedSeller,
  validate(createListingSchema),
  asyncHandler(async (req, res) => {
    const listing = await listingService.createListing(req.user!.id, req.body);
    res.status(201).json({ listing });
  }),
);

router.patch(
  '/:id',
  authenticate,
  requireVerifiedSeller,
  validate(listingIdParamSchema, 'params'),
  validate(updateListingSchema),
  asyncHandler(async (req, res) => {
    const listing = await listingService.updateListing(
      req.params.id as string,
      req.user!,
      req.body,
    );
    res.json({ listing });
  }),
);

router.patch(
  '/:id/publish',
  authenticate,
  requireVerifiedSeller,
  validate(listingIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const listing = await listingService.publishListing(req.params.id as string, req.user!);
    res.json({ listing, message: 'Listing published successfully' });
  }),
);

router.post(
  '/:id/images',
  authenticate,
  requireVerifiedSeller,
  validate(listingIdParamSchema, 'params'),
  uploadListingImages,
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files?.length) {
      throw new AppError(400, 'At least one image file is required (field name: images)');
    }

    const listing = await listingService.addListingImages(
      req.params.id as string,
      req.user!,
      files,
    );

    res.status(201).json({
      listing,
      message: 'Images uploaded and linked to listing successfully',
    });
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireVerifiedSeller,
  validate(listingIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const listing = await listingService.deleteListing(req.params.id as string, req.user!);
    res.json({ listing, message: 'Listing removed successfully' });
  }),
);

export default router;

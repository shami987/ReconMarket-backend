import { z } from 'zod';
import { idParamSchema, paginationSchema } from './common';

const listingConditionSchema = z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR']);
const listingStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'SOLD',
  'RESERVED',
  'EXPIRED',
  'REMOVED',
]);

const listingImageSchema = z.object({
  url: z.url(),
  altText: z.string().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isPrimary: z.boolean().default(false),
});

export const createListingSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  price: z.coerce.number().positive(),
  currency: z.string().length(3).default('RWF'),
  condition: listingConditionSchema,
  city: z.string().min(2).max(100).optional(),
  country: z.string().min(2).max(100).default('Rwanda'),
  quantity: z.coerce.number().int().positive().default(1),
  expiresAt: z.coerce.date().optional(),
  images: z.array(listingImageSchema).min(1).max(10),
});

export const updateListingSchema = createListingSchema.partial().extend({
  status: listingStatusSchema.optional(),
});

export const listListingsQuerySchema = paginationSchema.extend({
  categoryId: z.uuid().optional(),
  categorySlug: z.string().optional(),
  search: z.string().min(1).max(100).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  condition: listingConditionSchema.optional(),
  status: listingStatusSchema.optional(),
  sellerId: z.uuid().optional(),
  sort: z
    .enum(['newest', 'oldest', 'price_asc', 'price_desc'])
    .default('newest'),
});

export const listingIdParamSchema = idParamSchema;

export { listingConditionSchema, listingStatusSchema };

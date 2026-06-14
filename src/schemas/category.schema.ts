import { z } from 'zod';
import { paginationSchema } from './common';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens')
    .optional(),
  description: z.string().max(500).optional(),
  imageUrl: z.url().optional(),
  parentId: z.uuid().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const categorySlugParamSchema = z.object({
  slug: z.string().min(1),
});

export const listCategoriesQuerySchema = paginationSchema.extend({
  parentId: z.uuid().optional(),
  includeSubcategories: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

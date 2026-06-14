import { Router } from 'express';
import {
  categorySlugParamSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '../schemas/category.schema';
import { idParamSchema } from '../schemas/common';
import * as categoryService from '../services/category.service';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get(
  '/tree',
  asyncHandler(async (_req, res) => {
    const result = await categoryService.getCategoryTree();
    res.json(result);
  }),
);

router.get(
  '/',
  validate(listCategoriesQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await categoryService.listCategories(
      req.validatedQuery as Parameters<typeof categoryService.listCategories>[0],
    );
    res.json(result);
  }),
);

router.get(
  '/:slug',
  validate(categorySlugParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const category = await categoryService.getCategoryBySlug(req.params.slug as string);
    res.json({ category });
  }),
);

export default router;

export const adminCategoryRouter = Router();

adminCategoryRouter.post(
  '/',
  validate(createCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ category });
  }),
);

adminCategoryRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await categoryService.updateCategory(req.params.id as string, req.body);
    res.json({ category });
  }),
);

adminCategoryRouter.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const category = await categoryService.deleteCategory(req.params.id as string);
    res.json({ category, message: 'Category deactivated' });
  }),
);

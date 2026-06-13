import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { slugify } from '../utils/serialize';

const categoryCounts = {
  _count: { select: { listings: true, children: true } },
} as const;

const subcategoryInclude = (includeInactive: boolean) => ({
  where: includeInactive ? undefined : { isActive: true },
  orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
  include: categoryCounts,
});

export const listCategories = async (query: {
  page: number;
  limit: number;
  parentId?: string;
  includeSubcategories?: boolean;
  includeInactive?: boolean;
}) => {
  const includeInactive = query.includeInactive ?? false;

  const where: Prisma.CategoryWhereInput = {
    parentId: query.parentId ?? null,
    ...(!includeInactive && { isActive: true }),
  };

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        ...categoryCounts,
        ...(query.includeSubcategories !== false &&
          query.parentId === undefined && {
            children: subcategoryInclude(includeInactive),
          }),
      },
    }),
    prisma.category.count({ where }),
  ]);

  return {
    categories,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getCategoryTree = async (includeInactive = false) => {
  const categories = await prisma.category.findMany({
    where: {
      parentId: null,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      ...categoryCounts,
      children: subcategoryInclude(includeInactive),
    },
  });

  return { categories };
};

export const getCategoryBySlug = async (slug: string, includeInactive = false) => {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: {
      children: subcategoryInclude(includeInactive),
      parent: true,
      _count: { select: { listings: true } },
    },
  });

  if (!category || (!includeInactive && !category.isActive)) {
    throw new AppError(404, 'Category not found');
  }

  return category;
};

export const createCategory = async (input: {
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  sortOrder?: number;
}) => {
  const slug = input.slug ?? slugify(input.name);

  if (input.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId },
      include: { parent: true },
    });
    if (!parent) {
      throw new AppError(404, 'Parent category not found');
    }
    if (parent.parentId) {
      throw new AppError(400, 'Subcategories cannot have nested children (max 2 levels)');
    }
  }

  try {
    return await prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        imageUrl: input.imageUrl,
        parentId: input.parentId,
        sortOrder: input.sortOrder ?? 0,
      },
      include: {
        parent: true,
        ...categoryCounts,
      },
    });
  } catch {
    throw new AppError(409, 'Category with this slug already exists');
  }
};

export const updateCategory = async (
  id: string,
  input: {
    name?: string;
    slug?: string;
    description?: string;
    imageUrl?: string;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) => {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, 'Category not found');
  }

  if (input.parentId === id) {
    throw new AppError(400, 'Category cannot be its own parent');
  }

  if (input.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
    if (!parent) {
      throw new AppError(404, 'Parent category not found');
    }
    if (parent.parentId) {
      throw new AppError(400, 'Cannot nest subcategory under another subcategory');
    }
    if (existing.parentId === null) {
      const childCount = await prisma.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new AppError(400, 'Move or remove subcategories before changing parent category');
      }
    }
  }

  try {
    return await prisma.category.update({
      where: { id },
      data: input,
      include: {
        parent: true,
        children: subcategoryInclude(false),
        ...categoryCounts,
      },
    });
  } catch {
    throw new AppError(409, 'Category with this slug already exists');
  }
};

export const deleteCategory = async (id: string) => {
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { listings: true, children: true } } },
  });

  if (!existing) {
    throw new AppError(404, 'Category not found');
  }

  if (existing._count.listings > 0) {
    throw new AppError(409, 'Cannot delete category with listings. Deactivate it instead.');
  }

  if (existing._count.children > 0) {
    throw new AppError(409, 'Cannot delete category with subcategories. Deactivate subcategories first.');
  }

  return prisma.category.update({
    where: { id },
    data: { isActive: false },
  });
};

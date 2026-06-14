import { ListingStatus, Prisma, User } from '@prisma/client';
import { uploadConfig } from '../config/upload';
import { AppError } from '../errors/AppError';
import { toListingImageInputs } from '../lib/upload';
import { uploadListingImagesToCloudinary } from './upload.service';
import { prisma } from '../lib/prisma';
import { publicUserSelect } from '../utils/userSelect';
import { serializeDecimal } from '../utils/serialize';

const sellerSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  verificationType: true,
  avatarUrl: true,
} as const;

const listingInclude = {
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      parent: { select: { id: true, name: true, slug: true } },
    },
  },
  seller: { select: sellerSummarySelect },
  images: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ListingInclude;

const serializeListing = <
  T extends { price: { toNumber(): number } | number },
>(
  listing: T,
) => ({
  ...listing,
  price: serializeDecimal(listing.price),
  location: 'city' in listing && listing.city ? listing.city : undefined,
});

const assertCanManageListing = (listing: { sellerId: string }, user: User) => {
  if (listing.sellerId !== user.id && user.role !== 'ADMIN') {
    throw new AppError(403, 'You can only manage your own listings');
  }
};

export const listListings = async (query: {
  page: number;
  limit: number;
  categoryId?: string;
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  country?: string;
  condition?: string;
  status?: ListingStatus;
  sellerId?: string;
  sort: 'newest' | 'oldest' | 'price_asc' | 'price_desc';
}) => {
  const where: Prisma.ListingWhereInput = {
    deletedAt: null,
    status: query.status ?? 'ACTIVE',
    ...(query.sellerId && { sellerId: query.sellerId }),
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.categorySlug && { category: { slug: query.categorySlug } }),
    ...(query.city && { city: { contains: query.city, mode: 'insensitive' } }),
    ...(query.country && { country: { contains: query.country, mode: 'insensitive' } }),
    ...(query.condition && {
      condition: query.condition as Prisma.EnumListingConditionFilter['equals'],
    }),
    ...(query.search && {
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          price: {
            ...(query.minPrice !== undefined && { gte: query.minPrice }),
            ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
          },
        }
      : {}),
  };

  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    query.sort === 'price_asc'
      ? [{ price: 'asc' }]
      : query.sort === 'price_desc'
        ? [{ price: 'desc' }]
        : query.sort === 'oldest'
          ? [{ createdAt: 'asc' }]
          : [{ createdAt: 'desc' }];

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    listings: listings.map(serializeListing),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getListingById = async (
  id: string,
  viewer?: User,
  incrementView = true,
) => {
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: listingInclude,
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found');
  }

  const isOwner = viewer?.id === listing.sellerId;
  const isAdmin = viewer?.role === 'ADMIN';

  if (listing.status !== 'ACTIVE' && !isOwner && !isAdmin) {
    throw new AppError(404, 'Listing not found');
  }

  if (incrementView && listing.status === 'ACTIVE') {
    await prisma.listing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    listing.viewCount += 1;
  }

  return serializeListing(listing);
};

export const getMyListings = async (
  sellerId: string,
  query: { page: number; limit: number; status?: ListingStatus },
) => {
  const where: Prisma.ListingWhereInput = {
    sellerId,
    deletedAt: null,
    ...(query.status && { status: query.status }),
  };

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    listings: listings.map(serializeListing),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const createListing = async (
  sellerId: string,
  input: {
    categoryId: string;
    title: string;
    description: string;
    price: number;
    currency: string;
    condition: string;
    city?: string;
    country?: string;
    expiresAt?: Date;
    images: Array<{
      url: string;
      altText?: string;
      sortOrder: number;
      isPrimary: boolean;
    }>;
  },
) => {
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, isActive: true },
  });

  if (!category) {
    throw new AppError(404, 'Category not found');
  }

  const hasPrimary = input.images.some((img) => img.isPrimary);
  const images = hasPrimary
    ? input.images
    : input.images.map((img, index) => ({ ...img, isPrimary: index === 0 }));

  const listing = await prisma.listing.create({
    data: {
      sellerId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      price: input.price,
      currency: input.currency,
      condition: input.condition as Prisma.ListingCreateInput['condition'],
      city: input.city,
      country: input.country,
      expiresAt: input.expiresAt,
      status: 'DRAFT',
      images: { create: images },
    },
    include: listingInclude,
  });

  return serializeListing(listing);
};

export const updateListing = async (
  id: string,
  user: User,
  input: Partial<{
    categoryId: string;
    title: string;
    description: string;
    price: number;
    currency: string;
    condition: string;
    city: string;
    country: string;
    expiresAt: Date;
    status: ListingStatus;
    images: Array<{
      url: string;
      altText?: string;
      sortOrder: number;
      isPrimary: boolean;
    }>;
  }>,
) => {
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found');
  }

  assertCanManageListing(listing, user);

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, isActive: true },
    });
    if (!category) {
      throw new AppError(404, 'Category not found');
    }
  }

  if (user.role !== 'ADMIN' && input.status && !['DRAFT', 'REMOVED'].includes(input.status)) {
    throw new AppError(403, 'Use the publish endpoint to activate listings');
  }

  const { images, ...data } = input;

  const updated = await prisma.$transaction(async (tx) => {
    if (images) {
      await tx.listingImage.deleteMany({ where: { listingId: id } });
      await tx.listingImage.createMany({
        data: images.map((image) => ({ ...image, listingId: id })),
      });
    }

    return tx.listing.update({
      where: { id },
      data: {
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        price: data.price,
        currency: data.currency,
        condition: data.condition as Prisma.ListingUpdateInput['condition'],
        city: data.city,
        country: data.country,
        expiresAt: data.expiresAt,
        status: data.status,
      },
      include: listingInclude,
    });
  });

  return serializeListing(updated);
};

export const publishListing = async (id: string, user: User) => {
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: { images: true },
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found');
  }

  assertCanManageListing(listing, user);

  if (listing.images.length === 0) {
    throw new AppError(400, 'Add at least one image before publishing');
  }

  if (!['DRAFT', 'REMOVED'].includes(listing.status)) {
    throw new AppError(400, 'Only draft or removed listings can be published');
  }

  const updated = await prisma.listing.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      publishedAt: new Date(),
    },
    include: listingInclude,
  });

  return serializeListing(updated);
};

export const addListingImages = async (
  id: string,
  user: User,
  files: Express.Multer.File[],
) => {
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: { images: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found');
  }

  assertCanManageListing(listing, user);

  const currentCount = listing.images.length;

  if (currentCount + files.length > uploadConfig.maxListingImages) {
    throw new AppError(
      400,
      `Listing cannot have more than ${uploadConfig.maxListingImages} images (${currentCount} existing, ${files.length} uploaded)`,
    );
  }

  const uploads = await uploadListingImagesToCloudinary(files);
  const hasPrimary = listing.images.some((image) => image.isPrimary);
  const imageInputs = toListingImageInputs(uploads, {
    startSortOrder: currentCount,
    markFirstAsPrimary: !hasPrimary && currentCount === 0,
  });

  const updated = await prisma.$transaction(async (tx) => {
    if (imageInputs.some((image) => image.isPrimary)) {
      await tx.listingImage.updateMany({
        where: { listingId: id },
        data: { isPrimary: false },
      });
    }

    await tx.listingImage.createMany({
      data: imageInputs.map((image) => ({
        listingId: id,
        url: image.url,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
    });

    return tx.listing.findUniqueOrThrow({
      where: { id },
      include: listingInclude,
    });
  });

  return serializeListing(updated);
};

export const deleteListing = async (id: string, user: User) => {
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found');
  }

  assertCanManageListing(listing, user);

  const updated = await prisma.listing.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'REMOVED',
    },
    include: listingInclude,
  });

  return serializeListing(updated);
};

export const sellerPublicProfile = async (sellerId: string) => {
  const seller = await prisma.user.findFirst({
    where: { id: sellerId, deletedAt: null, isActive: true },
    select: {
      ...publicUserSelect,
      _count: {
        select: {
          listings: { where: { status: 'ACTIVE', deletedAt: null } },
          reviewsReceived: true,
        },
      },
    },
  });

  if (!seller) {
    throw new AppError(404, 'Seller not found');
  }

  const reviews = await prisma.review.aggregate({
    where: { revieweeId: sellerId },
    _avg: { rating: true },
  });

  const { _count, ...publicSeller } = seller;

  return {
    ...publicSeller,
    canSell:
      seller.verificationType === 'INDIVIDUAL_SELLER' ||
      seller.verificationType === 'BUSINESS_SELLER',
    activeListings: _count.listings,
    reviewCount: _count.reviewsReceived,
    averageRating: reviews._avg.rating,
  };
};

import { Router } from 'express';
import { updateRoleSchema } from '../schemas/auth.schema';
import { reviewVerificationSchema } from '../schemas/verification.schema';
import { adminCategoryRouter } from './category.routes';
import * as authService from '../services/auth.service';
import * as verificationService from '../services/verification.service';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.use('/categories', adminCategoryRouter);

router.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const [totalUsers, totalListings, topCategories, topSellers] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.listing.count({ where: { deletedAt: null } }),
      prisma.category.findMany({
        where: { isActive: true },
        select: { name: true, _count: { select: { listings: { where: { deletedAt: null } } } } },
        orderBy: { listings: { _count: 'desc' } },
        take: 5,
      }),
      prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          verificationType: { in: ['INDIVIDUAL_SELLER', 'BUSINESS_SELLER'] },
        },
        select: {
          firstName: true,
          lastName: true,
          verificationType: true,
          _count: { select: { listings: { where: { deletedAt: null, status: 'ACTIVE' } } } },
        },
        orderBy: { listings: { _count: 'desc' } },
        take: 5,
      }),
    ]);

    res.json({
      totalUsers,
      totalListings,
      topCategories: topCategories.map((c) => ({
        name: c.name,
        count: c._count.listings,
      })),
      topSellers: topSellers.map((s) => ({
        name: `${s.firstName} ${s.lastName}`,
        business: s.verificationType === 'BUSINESS_SELLER' ? 'Business Seller' : 'Individual Seller',
        activeListings: s._count.listings,
      })),
    });
  }),
);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        verificationType: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  }),
);

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const where: Parameters<typeof prisma.listing.findMany>[0]['where'] = {
      deletedAt: null,
      ...(status && { status: status as Parameters<typeof prisma.listing.findMany>[0]['where']['status'] }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          seller: { select: { id: true, firstName: true, lastName: true, email: true } },
          category: { select: { id: true, name: true, slug: true } },
          images: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ]);

    res.json({
      listings: listings.map((l) => ({ ...l, price: Number(l.price) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

router.get(
  '/verifications',
  asyncHandler(async (_req, res) => {
    const verifications = await verificationService.listPendingVerifications();
    res.json({ verifications });
  }),
);

router.patch(
  '/verifications/:id',
  validate(reviewVerificationSchema),
  asyncHandler(async (req, res) => {
    const result = await verificationService.reviewVerification(
      req.user!.id,
      req.params.id as string,
      req.body,
    );
    res.json(result);
  }),
);

router.patch(
  '/users/:id/role',
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.updateUserRole(
      req.user!.id,
      req.params.id as string,
      req.body.role,
    );
    res.json({ user });
  }),
);

export default router;

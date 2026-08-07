import { Prisma } from '@prisma/client';
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
    const STATUS_COLORS: Record<string, string> = {
      PENDING: 'bg-amber-500',
      IN_PROGRESS: 'bg-violet-500',
      COMPLETED: 'bg-emerald-500',
      CANCELLED: 'bg-slate-400',
      DISPUTED: 'bg-red-500',
      REFUNDED: 'bg-orange-500',
    };

    const now = new Date();
    const monthsBack = 7;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));

    const [
      totalUsers,
      totalListings,
      totalOrders,
      completedAgg,
      statusGroups,
      monthlyTxns,
      topCategories,
      topSellersRaw,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.listing.count({ where: { deletedAt: null } }),
      prisma.transaction.count(),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.transaction.findMany({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: monthStart },
        },
        select: { amount: true, createdAt: true },
      }),
      prisma.category.findMany({
        where: { isActive: true, parentId: null },
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
          sales: {
            where: { status: 'COMPLETED' },
            select: { amount: true },
          },
          reviewsReceived: {
            select: { rating: true },
          },
        },
        take: 20,
      }),
    ]);

    const monthLabels: { key: string; label: string }[] = [];
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + i, 1));
      monthLabels.push({
        key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
        label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      });
    }

    const revenueMap = new Map<string, number>();
    for (const label of monthLabels) revenueMap.set(label.key, 0);
    for (const txn of monthlyTxns) {
      const d = txn.createdAt;
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (revenueMap.has(key)) {
        revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(txn.amount));
      }
    }

    const categoryTotal = topCategories.reduce((sum, c) => sum + c._count.listings, 0) || 1;

    const topSellers = topSellersRaw
      .map((s) => {
        const sales = s.sales.reduce((sum, t) => sum + Number(t.amount), 0);
        const ratingCount = s.reviewsReceived.length;
        const rating =
          ratingCount > 0
            ? s.reviewsReceived.reduce((sum, r) => sum + r.rating, 0) / ratingCount
            : 0;
        return {
          name: `${s.firstName} ${s.lastName}`.trim(),
          business: s.verificationType === 'BUSINESS_SELLER' ? 'Business Seller' : 'Individual Seller',
          sales,
          rating: Math.round(rating * 10) / 10,
        };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    res.json({
      totalUsers,
      totalListings,
      totalOrders,
      totalRevenue: Number(completedAgg._sum.amount ?? 0),
      revenueByMonth: monthLabels.map(({ key, label }) => ({
        month: label,
        amount: revenueMap.get(key) ?? 0,
      })),
      topCategories: topCategories.map((c) => ({
        name: c.name,
        count: c._count.listings,
        percent: Math.round((c._count.listings / categoryTotal) * 100),
      })),
      topSellers,
      ordersByStatus: statusGroups.map((g) => ({
        status: g.status.replace(/_/g, ' '),
        count: g._count._all,
        color: STATUS_COLORS[g.status] ?? 'bg-slate-400',
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

    const where: Prisma.ListingWhereInput = {
      deletedAt: null,
      ...(status && { status: status as Prisma.ListingWhereInput['status'] }),
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

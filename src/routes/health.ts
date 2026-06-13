import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let database: 'ok' | 'error' = 'ok';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    res.json({
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'reconmarket-backend',
      database,
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;

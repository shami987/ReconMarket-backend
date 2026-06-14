import { Redis } from '@upstash/redis';
import { env } from '../config/env';
import { logger } from './logger';

export const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export const verifyRedisConnection = async (): Promise<boolean> => {
  if (!redis) {
    logger.warn('Redis not configured — skipping connection check');
    return true;
  }

  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error({ err: error }, 'Redis connection failed');
    return false;
  }
};

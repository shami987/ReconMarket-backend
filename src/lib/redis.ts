import { Redis } from '@upstash/redis';
import { env } from '../config/env';
import { logger } from './logger';

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const verifyRedisConnection = async (): Promise<boolean> => {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error({ err: error }, 'Redis connection failed');
    return false;
  }
};

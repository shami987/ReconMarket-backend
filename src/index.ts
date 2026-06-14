import * as Sentry from '@sentry/node';
import app from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis, verifyRedisConnection } from './lib/redis';
import { verifyMailConnection } from './lib/mail';
import { verifyCloudinaryConnection } from './lib/cloudinary';

const CHECK = '\u2714';
const CROSS = '\u2718';
const WARN = '\u26A0';
const DOT = '\u2500';

const TABLE_WIDTH = 56;

const pad = (str: string, len: number) => str.padEnd(len);
const center = (str: string, len: number) => {
  const left = Math.floor((len - str.length) / 2);
  return ' '.repeat(left) + str + ' '.repeat(len - str.length - left);
};

const printTable = (rows: { label: string; value: string; ok: boolean }[]): void => {
  const line = `${DOT.repeat(TABLE_WIDTH)}`;

  console.log(`\n  ${DOT.repeat(3)} RECONMARKET ${DOT.repeat(TABLE_WIDTH - 15)}`);

  for (const row of rows) {
    const icon = row.ok ? `\x1b[32m${CHECK}\x1b[0m` : `\x1b[31m${CROSS}\x1b[0m`;
    const val = row.ok
      ? `\x1b[32m${row.value}\x1b[0m`
      : `\x1b[31m${row.value}\x1b[0m`;
    console.log(`  ${icon} ${pad(row.label, 16)} ${val}`);
  }

  console.log(`  ${line}`);
};

const checkConnections = async (): Promise<{
  pgOk: boolean;
  redisOk: boolean;
  mailOk: boolean;
  cloudinaryOk: boolean;
}> => {
  let pgOk = false;
  let redisOk = false;
  let mailOk = false;
  let cloudinaryOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    pgOk = true;
  } catch {
    // failed
  }

  redisOk = await verifyRedisConnection();
  mailOk = await verifyMailConnection();
  cloudinaryOk = await verifyCloudinaryConnection();

  return { pgOk, redisOk, mailOk, cloudinaryOk };
};

const start = async (): Promise<void> => {
  // Sentry
  if (env.SENTRY_DSN) {
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  }

  const { pgOk, redisOk, mailOk, cloudinaryOk } = await checkConnections();

  const rows = [
    {
      label: 'PostgreSQL',
      value: pgOk ? `Connected (Neon)` : `FAILED`,
      ok: pgOk,
    },
    {
      label: 'Redis',
      value: redisOk ? `Connected (Upstash)` : `FAILED`,
      ok: redisOk,
    },
    {
      label: 'Email',
      value: mailOk ? `SMTP ${env.EMAIL_HOST}:${env.EMAIL_PORT}` : `FAILED`,
      ok: mailOk,
    },
    {
      label: 'Cloudinary',
      value: cloudinaryOk ? env.CLOUDINARY_CLOUD_NAME : `FAILED`,
      ok: cloudinaryOk,
    },
    {
      label: 'Sentry',
      value: env.SENTRY_DSN ? `Active` : `Disabled`,
      ok: true,
    },
  ];

  printTable(rows);

  if (!pgOk || !redisOk) {
    logger.fatal('Required service connection failed — exiting');
    process.exit(1);
  }

  const url = `http://localhost:${env.PORT}/api/docs`;
  console.log(`  \x1b[36m${center(url, TABLE_WIDTH + 18)}\x1b[0m\n`);

  const server = app.listen(env.PORT, () => {
    console.log(`  \x1b[32m${CHECK}\x1b[0m Server running on \x1b[36mhttp://localhost:${env.PORT}\x1b[0m\n`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n  \x1b[33mShutting down (${signal})...\x1b[0m`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('  \x1b[32m✔ PostgreSQL disconnected\x1b[0m');
      process.exit(0);
    });

    setTimeout(() => {
      console.log('  \x1b[31m✘ Forced shutdown after timeout\x1b[0m');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

start().catch((error) => {
  console.error('\x1b[31m✘ Failed to start server:\x1b[0m', error);
  process.exit(1);
});

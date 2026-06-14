import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { swaggerSpec, swaggerUi, swaggerUiHandler } from './config/swagger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';
import adminRouter from './routes/admin.routes';
import authRouter from './routes/auth.routes';
import categoryRouter from './routes/category.routes';
import healthRouter from './routes/health';
import listingRouter from './routes/listing.routes';
import transactionRouter from './routes/transaction.routes';
import uploadRouter from './routes/upload.routes';
import verificationRouter from './routes/verification.routes';
import webhookRouter, { paymentDevRouter } from './routes/webhook.routes';

const app = express();

app.use(
  pinoHttp({
    logger,
    autoLogging: false,
  }),
);
app.use(cors({
  origin: [env.CLIENT_URL, 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));
app.use(cors());

app.use(
  '/api/webhooks',
  express.raw({ type: 'application/json' }),
  webhookRouter,
);

app.use(express.json());

app.get('/api-docs', (_req, res) => res.redirect(301, '/api/docs'));
app.get('/api-docs/', (_req, res) => res.redirect(301, '/api/docs/'));
app.get('/api-docs.json', (_req, res) => res.redirect(301, '/api/docs.json'));
app.use('/api/docs', swaggerUi.serve, swaggerUiHandler);
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/listings', listingRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/payments', paymentDevRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

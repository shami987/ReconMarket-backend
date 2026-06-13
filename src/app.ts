import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { swaggerSpec, swaggerUi, swaggerUiHandler } from './config/swagger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';
import adminRouter from './routes/admin.routes';
import authRouter from './routes/auth.routes';
import categoryRouter from './routes/category.routes';
import healthRouter from './routes/health';
import listingRouter from './routes/listing.routes';
import verificationRouter from './routes/verification.routes';

const app = express();

const skipRequestLog = (url: string): boolean =>
  url.startsWith('/api/docs') ||
  url.startsWith('/api-docs') ||
  url === '/api/docs.json';

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => skipRequestLog(req.url ?? ''),
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  }),
);
app.use(cors());
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
app.use('/api/verification', verificationRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

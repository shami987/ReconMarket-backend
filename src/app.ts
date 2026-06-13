import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { swaggerSpec, swaggerUi, swaggerUiHandler } from './config/swagger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';
import adminRouter from './routes/admin.routes';
import authRouter from './routes/auth.routes';
import healthRouter from './routes/health';
import verificationRouter from './routes/verification.routes';

const app = express();

app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());

app.get('/api-docs', (_req, res) => res.redirect(301, '/api/docs'));
app.get('/api-docs/', (_req, res) => res.redirect(301, '/api/docs/'));
app.get('/api-docs.json', (_req, res) => res.redirect(301, '/api/docs.json'));
app.use('/api/docs', swaggerUi.serve, swaggerUiHandler);
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
//
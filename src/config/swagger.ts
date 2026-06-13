import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { env } from './env';

const specPath = path.join(process.cwd(), 'src', 'docs', 'openapi.yaml');
const specFile = fs.readFileSync(specPath, 'utf8');
const spec = parse(specFile) as Record<string, unknown>;

if (Array.isArray(spec.servers)) {
  spec.servers = [{ url: env.APP_URL, description: 'Current environment' }];
}

export const swaggerSpec = spec;
export const swaggerUiHandler = swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ReconMarket API Docs',
});
export { swaggerUi };

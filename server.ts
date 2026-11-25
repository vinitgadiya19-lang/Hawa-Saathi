import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerApiRoutes } from './server/routes.ts';
import { createRateLimiter, securityHeadersMiddleware } from './server/security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppServerOptions {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export function createApp(options: AppServerOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '8mb' }));

  const apiRateLimiter = createRateLimiter({
    maxRequests: options.rateLimitMax ?? 60,
    windowMs: options.rateLimitWindowMs ?? 60_000,
  });
  app.use('/api', apiRateLimiter);
  registerApiRoutes(app);

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  const distDir = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Hawa Saathi server listening on http://0.0.0.0:${port}`);
  });
}

// Only bind port when run directly (not when imported in tests)
const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryScript === __filename) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

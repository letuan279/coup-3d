/**
 * Server entry (docs/SPEC.md §2): `tsx server/index.ts` in dev, `node dist/server/index.js`
 * in production. Serves the built client (if any) and Socket.IO on PORT (default 3000).
 */
import { createCoupServer } from './app';
import { resolveStaticDir } from './http';

const DEFAULT_PORT = 3000;
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function parsePort(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < 65536 && value !== undefined && value !== '' ? n : DEFAULT_PORT;
}

async function main(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const port = parsePort(process.env.PORT);
  const host = process.env.HOST || undefined;
  const staticDir = resolveStaticDir(import.meta.url);

  const server = createCoupServer({ staticDir, corsOrigins: isProd ? [] : DEV_ORIGINS });
  const boundPort = await server.listen(port, host);

  const url = `http://${host && host !== '0.0.0.0' && host !== '::' ? host : 'localhost'}:${boundPort}`;
  console.log(`[coup-3d] server listening on ${url}`);
  console.log(
    staticDir
      ? `[coup-3d] serving client from ${staticDir}`
      : '[coup-3d] no built client found — run `npm run dev` and open http://localhost:5173',
  );

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[coup-3d] ${signal} received, shutting down`);
    const force = setTimeout(() => process.exit(0), 3000);
    force.unref();
    server.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('[coup-3d] failed to start:', err);
  process.exit(1);
});

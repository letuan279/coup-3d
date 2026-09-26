/**
 * Plain `node:http` request handling: `GET /healthz`, and (when a built client exists) static
 * files from dist/client with SPA fallback, proper MIME types, cache headers and pre-compressed
 * (gzip / brotli, cached in memory) responses for text assets. Path-traversal safe.
 */
import { createReadStream, existsSync, statSync, type Stats } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.xml', '.webmanifest']);
/** Don't bother compressing tiny files; don't cache huge ones in memory. */
const COMPRESS_MIN_BYTES = 1024;
const COMPRESS_MAX_BYTES = 8 * 1024 * 1024;

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_SHORT = 'public, max-age=3600';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

export interface HttpHandlerOptions {
  /** Directory with the built client (index.html + assets/), or null to serve nothing but /healthz. */
  staticDir: string | null;
  /** Extra fields for the /healthz JSON. */
  health?: () => Record<string, unknown>;
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Where the built client lives, relative to the running module: the bundle
 * (dist/server/index.js) → dist/client; the sources run via tsx (server/*.ts) → dist/client.
 * `CLIENT_DIR` overrides. null when no built client is found.
 */
export function resolveStaticDir(moduleUrl: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const here = dirname(fileURLToPath(moduleUrl));
  // From the sources, `../client` is the Vite *source* root (it has an index.html too) — never serve it.
  const inBundle = basename(here) === 'server' && basename(dirname(here)) === 'dist';
  const dir = env.CLIENT_DIR ? resolve(env.CLIENT_DIR) : resolve(here, inBundle ? '../client' : '../dist/client');
  try {
    return existsSync(join(dir, 'index.html')) && statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

type Encoding = 'br' | 'gzip';

function pickEncoding(req: IncomingMessage): Encoding | null {
  const header = req.headers['accept-encoding'];
  const accept = (Array.isArray(header) ? header.join(',') : header ?? '').toLowerCase();
  if (/\bbr\b/.test(accept)) return 'br';
  if (/\bgzip\b/.test(accept)) return 'gzip';
  return null;
}

function etagOf(st: Stats): string {
  return `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
}

function sendText(res: ServerResponse, status: number, body: string, method: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(method === 'HEAD' ? undefined : body);
}

export function createHttpHandler(opts: HttpHandlerOptions): RequestHandler {
  const root = opts.staticDir ? resolve(opts.staticDir) : null;
  /** path|mtime|encoding → compressed bytes (the build output is immutable while running). */
  const compressed = new Map<string, Promise<Buffer>>();

  const compressedBody = (file: string, st: Stats, enc: Encoding): Promise<Buffer> => {
    const key = `${file}|${st.mtimeMs}|${enc}`;
    let p = compressed.get(key);
    if (!p) {
      p = readFile(file).then((buf) =>
        enc === 'br'
          ? brotliAsync(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 } })
          : gzipAsync(buf, { level: 7 }),
      );
      p.catch(() => compressed.delete(key));
      compressed.set(key, p);
    }
    return p;
  };

  async function serveFile(req: IncomingMessage, res: ServerResponse, file: string, st: Stats, urlPath: string) {
    const method = req.method ?? 'GET';
    const ext = extname(file).toLowerCase();
    const isIndex = file === join(root as string, 'index.html');
    const headers: Record<string, string | number> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': isIndex ? 'no-cache' : urlPath.startsWith('/assets/') ? CACHE_IMMUTABLE : CACHE_SHORT,
      'X-Content-Type-Options': 'nosniff',
      ETag: etagOf(st),
      'Last-Modified': st.mtime.toUTCString(),
    };
    const canCompress = COMPRESSIBLE.has(ext) && st.size >= COMPRESS_MIN_BYTES && st.size <= COMPRESS_MAX_BYTES;
    if (canCompress) headers.Vary = 'Accept-Encoding';

    if (req.headers['if-none-match'] === headers.ETag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    const enc = canCompress ? pickEncoding(req) : null;
    if (enc) {
      const body = await compressedBody(file, st, enc);
      res.writeHead(200, { ...headers, 'Content-Encoding': enc, 'Content-Length': body.length });
      res.end(method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  async function statFile(file: string): Promise<Stats | null> {
    try {
      const st = await stat(file);
      return st.isFile() ? st : null;
    } catch {
      return null;
    }
  }

  async function handleStatic(req: IncomingMessage, res: ServerResponse, rootDir: string, urlPath: string) {
    const method = req.method ?? 'GET';
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      sendText(res, 400, 'Bad request', method);
      return;
    }
    if (decoded.includes('\0') || decoded.includes('\\')) {
      sendText(res, 400, 'Bad request', method);
      return;
    }
    const segments = decoded.split('/').filter(Boolean);
    // No dotfiles / parent segments — resolve() below is the real guard, this keeps URLs sane.
    if (segments.some((s) => s.startsWith('.'))) {
      sendText(res, 404, 'Not found', method);
      return;
    }
    const file = resolve(rootDir, ...segments);
    if (file !== rootDir && !file.startsWith(rootDir + sep)) {
      sendText(res, 404, 'Not found', method);
      return;
    }

    const st = segments.length ? await statFile(file) : null;
    if (st) {
      await serveFile(req, res, file, st, urlPath);
      return;
    }
    // Missing asset-like paths are real 404s; everything else is a client-side route.
    if (segments.length && extname(segments[segments.length - 1])) {
      sendText(res, 404, 'Not found', method);
      return;
    }
    const index = join(rootDir, 'index.html');
    const indexStat = await statFile(index);
    if (!indexStat) {
      sendText(res, 404, 'Not found', method);
      return;
    }
    await serveFile(req, res, index, indexStat, '/index.html');
  }

  return (req, res) => {
    const method = req.method ?? 'GET';
    let urlPath: string;
    try {
      urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      sendText(res, 400, 'Bad request', method);
      return;
    }

    if (urlPath === '/healthz') {
      const body = JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), ...opts.health?.() });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      });
      res.end(method === 'HEAD' ? undefined : body);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Method not allowed', method);
      return;
    }
    if (!root) {
      sendText(res, 404, 'Coup 3D server: no built client found. Use `npm run dev` (http://localhost:5173) or `npm run build`.', method);
      return;
    }
    handleStatic(req, res, root, urlPath).catch(() => {
      if (!res.headersSent) sendText(res, 500, 'Internal error', method);
      else res.destroy();
    });
  };
}

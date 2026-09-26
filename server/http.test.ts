import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpHandler, resolveStaticDir } from './http';

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

function fetchRaw(port: number, path: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const INDEX = '<!doctype html><html><body>COUP-INDEX</body></html>';
const APP_JS = `console.log(${JSON.stringify('x'.repeat(4000))});`;
const SECRET = 'TOP-SECRET-OUTSIDE-ROOT';

let base: string;
let root: string;
let server: Server;
let port: number;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'coup-http-'));
  root = join(base, 'client');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), INDEX);
  writeFileSync(join(root, 'assets', 'app-abc123.js'), APP_JS);
  writeFileSync(join(root, 'assets', 'style-1.css'), 'body{color:red}');
  writeFileSync(join(root, 'assets', 'font.woff2'), Buffer.from([1, 2, 3, 4]));
  writeFileSync(join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(root, '.env'), 'SECRET=1');
  writeFileSync(join(base, 'secret.txt'), SECRET);
  server = createServer(createHttpHandler({ staticDir: root, health: () => ({ rooms: 7 }) }));
  port = await listen(server);
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(base, { recursive: true, force: true });
});

describe('static client hosting', () => {
  it('serves index.html at / with no-cache', async () => {
    const res = await fetchRaw(port, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body.toString()).toBe(INDEX);
  });

  it('serves hashed assets with the right MIME type and a long immutable cache', async () => {
    const js = await fetchRaw(port, '/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(js.body.toString()).toBe(APP_JS);
    expect((await fetchRaw(port, '/assets/style-1.css')).headers['content-type']).toBe('text/css; charset=utf-8');
    expect((await fetchRaw(port, '/assets/font.woff2')).headers['content-type']).toBe('font/woff2');
    const svg = await fetchRaw(port, '/favicon.svg');
    expect(svg.headers['content-type']).toBe('image/svg+xml');
    expect(svg.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('falls back to index.html for client routes but 404s missing files', async () => {
    const route = await fetchRaw(port, '/room/ABCDE?x=1');
    expect(route.status).toBe(200);
    expect(route.body.toString()).toBe(INDEX);
    expect(route.headers['cache-control']).toBe('no-cache');
    expect((await fetchRaw(port, '/assets/missing-123.js')).status).toBe(404);
  });

  it('never escapes the client directory or serves dotfiles', async () => {
    const attempts = [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/assets/..%2f..%2fsecret.txt',
      '/..%5csecret.txt',
      '/%252e%252e/secret.txt',
      '/.env',
      '/%00/index.html',
    ];
    for (const path of attempts) {
      const res = await fetchRaw(port, path);
      expect(res.body.toString()).not.toContain(SECRET);
      expect(res.body.toString()).not.toContain('SECRET=1');
      expect([200, 400, 404]).toContain(res.status);
      if (res.status === 200) expect(res.body.toString()).toBe(INDEX);
    }
  });

  it('supports HEAD, ETag revalidation and rejects other methods', async () => {
    const head = await fetchRaw(port, '/assets/app-abc123.js', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(Number(head.headers['content-length'])).toBe(Buffer.byteLength(APP_JS));
    const etag = String(head.headers.etag);
    const again = await fetchRaw(port, '/assets/app-abc123.js', { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
    expect((await fetchRaw(port, '/', { method: 'POST' })).status).toBe(405);
  });

  it('compresses text assets (brotli / gzip) and caches the result', async () => {
    const gz = await fetchRaw(port, '/assets/app-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gz.headers.vary).toBe('Accept-Encoding');
    expect(gunzipSync(gz.body).toString()).toBe(APP_JS);
    const br = await fetchRaw(port, '/assets/app-abc123.js', { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(br.body).toString()).toBe(APP_JS);
    const small = await fetchRaw(port, '/assets/style-1.css', { headers: { 'accept-encoding': 'gzip' } });
    expect(small.headers['content-encoding']).toBeUndefined();
  });

  it('answers /healthz with JSON', async () => {
    const res = await fetchRaw(port, '/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString())).toMatchObject({ ok: true, rooms: 7 });
  });
});

describe('without a built client', () => {
  it('serves only /healthz', async () => {
    const bare = createServer(createHttpHandler({ staticDir: null }));
    const p = await listen(bare);
    try {
      expect((await fetchRaw(p, '/')).status).toBe(404);
      expect((await fetchRaw(p, '/healthz')).status).toBe(200);
    } finally {
      await new Promise((r) => bare.close(r));
    }
  });
});

describe('resolveStaticDir', () => {
  it('finds dist/client from the bundle and from the sources, or honours CLIENT_DIR', () => {
    const proj = mkdtempSync(join(tmpdir(), 'coup-proj-'));
    try {
      const client = join(proj, 'dist', 'client');
      mkdirSync(client, { recursive: true });
      mkdirSync(join(proj, 'dist', 'server'), { recursive: true });
      mkdirSync(join(proj, 'server'), { recursive: true });
      // The Vite source root also has an index.html — it must never be served.
      mkdirSync(join(proj, 'client'), { recursive: true });
      writeFileSync(join(proj, 'client', 'index.html'), '<!-- vite source -->');
      expect(resolveStaticDir(pathToFileURL(join(proj, 'server', 'index.ts')).href, {})).toBeNull();
      expect(resolveStaticDir(pathToFileURL(join(proj, 'dist', 'server', 'index.js')).href, {})).toBeNull();
      writeFileSync(join(client, 'index.html'), INDEX);
      expect(resolveStaticDir(pathToFileURL(join(proj, 'dist', 'server', 'index.js')).href, {})).toBe(client);
      expect(resolveStaticDir(pathToFileURL(join(proj, 'server', 'index.ts')).href, {})).toBe(client);
      expect(resolveStaticDir(pathToFileURL(join(proj, 'server', 'index.ts')).href, { CLIENT_DIR: root })).toBe(root);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});

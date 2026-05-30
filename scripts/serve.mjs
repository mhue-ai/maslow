#!/usr/bin/env node
/**
 * Minimal, dependency-free static file server for the built app (dist/).
 *
 * Used by the systemd service on a Raspberry Pi so the Pi can serve Maslow CNC
 * Studio with nothing but Node — no npm packages, works fully offline. Serves
 * dist/ and falls back to index.html (the app is a single page).
 *
 *   PORT  — listen port (default 8080)
 *   HOST  — bind address (default 0.0.0.0, so other devices on the LAN reach it)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

async function resolveFile(urlPath) {
  // Strip query/hash, decode, and prevent path traversal outside ROOT.
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) filePath = ROOT; // traversal guard

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, 'index.html');
    await stat(filePath);
    return filePath;
  } catch {
    // SPA fallback — single page, so unknown paths serve index.html.
    return join(ROOT, 'index.html');
  }
}

const server = createServer(async (req, res) => {
  try {
    const filePath = await resolveFile(req.url || '/');
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    // Hashed asset filenames can cache hard; index.html should not.
    const cache = filePath.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.on('error', (err) => {
  console.error(`[maslow-studio] failed to start: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[maslow-studio] serving ${ROOT} on http://${HOST}:${PORT}`);
});

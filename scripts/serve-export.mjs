// Test-only HTTP server for the real static export, including subpath hosting.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve('out');
const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(`${prefix}/`)) throw new Error('Outside mount');
    let path = resolve(root, `.${pathname.slice(prefix.length)}`);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Outside root');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(3199, '127.0.0.1');

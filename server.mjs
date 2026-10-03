import http from 'node:http';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await fs.realpath(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || '4188');
const listenPort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 4188;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(text);
}

function isWithinRoot(candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveRequestPath(requestUrl) {
  // Reject encoded traversal markers before URL parsing normalizes dot segments.
  if (/%(?:2e|2f|5c)/i.test(requestUrl)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }

  // URL paths use '/', but accepting '\\' here would allow Windows traversal.
  pathname = pathname.replaceAll('\\', '/');
  if (pathname.includes('\0') || pathname.includes(':')) return null;
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, relativePath);
  if (!isWithinRoot(candidate)) return null;
  return candidate;
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  if (request.url === '/__drive_mad_health') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ app: 'drive-mad-level-1-recreation' }));
    return;
  }

  const filePath = resolveRequestPath(request.url || '/');
  if (!filePath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const realPath = await fs.realpath(filePath);
    if (!isWithinRoot(realPath)) {
      sendText(response, 403, 'Forbidden');
      return;
    }
    const info = await fs.stat(realPath);
    if (!info.isFile()) {
      sendText(response, 404, 'Not Found');
      return;
    }
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    let start = 0;
    let end = info.size - 1;
    const range = request.method === 'GET' ? request.headers.range : null;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        response.end();
        return;
      }
    }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': contentType,
      'Content-Length': Math.max(0, end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(realPath, { start, ...(info.size ? { end } : {}) });
    stream.on('error', error => response.destroy(error));
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      sendText(response, 404, 'Not Found');
    } else {
      console.error(error);
      sendText(response, 500, 'Internal Server Error');
    }
  }
});

server.on('error', (error) => {
  console.error(`无法监听 127.0.0.1:${listenPort}`, error.message);
  process.exitCode = 1;
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`Drive Mad 第一关复刻已启动：http://127.0.0.1:${listenPort}`);
});

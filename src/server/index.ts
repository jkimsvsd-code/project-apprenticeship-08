import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { createApp } from './app.js';
import { loadConfig, type Config } from './config/env.js';
import { Store } from './storage/store.js';

export async function startServer(config: Config = loadConfig()) {
  const store = new Store(config.databasePath);
  const app = createApp(config, store);
  app.use((req, res, next) => {
    // Development tooling must never expose runtime databases or server-only files.
    if (/^\/(?:runtime|docs|evidence|tests|scripts|src\/server|dist\/server)(?:\/|$)/.test(req.path)) {
      res.set('Cache-Control', 'no-store').status(403).type('text').send('공개하지 않는 경로입니다.'); return;
    }
    next();
  });
  const server = http.createServer({ maxHeaderSize: 16384 }, app);
  let closeFrontend = async () => {};
  if (!config.production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, ws: { server } }, appType: 'custom' });
    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html')) { next(); return; }
      try {
        const html = await vite.transformIndexHtml(req.originalUrl, await readFile(path.resolve('index.html'), 'utf8'));
        res.set('Cache-Control', 'no-store').type('html').send(html);
      } catch (error) { next(error); }
    });
    closeFrontend = () => vite.close();
  } else {
    const client = path.resolve('dist/client');
    app.use('/assets', express.static(path.join(client, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(client, { index: false, maxAge: 0 }));
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html')) { next(); return; }
      res.set('Cache-Control', 'no-store').sendFile(path.join(client, 'index.html'));
    });
  }
  app.use((_req, res) => res.status(404).type('text').send('페이지를 찾을 수 없습니다.'));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.production ? '0.0.0.0' : '127.0.0.1', () => resolve());
    });
  } catch (error) { await closeFrontend(); store.close(); throw error; }
  console.log(`Local: ${config.origin}`);
  const cleanupTimer = setInterval(() => store.prune(), 60_000).unref();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(cleanupTimer);
    await closeFrontend();
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
  };
  return { server, store, close };
}

if (process.argv[1] && /(?:^|[/\\])index\.(?:ts|js)$/.test(process.argv[1])) {
  startServer().then(running => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void running.close().then(() => process.exit(0)); });
  }).catch(error => { console.error(error instanceof Error ? error.message : '시작 실패'); process.exitCode = 1; });
}

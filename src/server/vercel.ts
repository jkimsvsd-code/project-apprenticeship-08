import express from 'express';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { PostgresStore } from './storage/postgres.js';
import { createDatabasePool } from './storage/pool.js';

// Vercel Express entry point. No local DB files, migrations, bootstrap endpoints or test hooks.
const app = express();
const config = loadConfig({ ...process.env, NODE_ENV: 'production' });
const store = new PostgresStore(createDatabasePool());
app.use(createApp(config, store));
app.use((req, res, next) => {
  if (/^\/(?:runtime|docs|evidence|tests|scripts|src|db)(?:\/|$)/.test(req.path)) {
    res.status(403).type('text').send('공개하지 않는 경로입니다.'); return;
  }
  next();
});
// Assets are copied to public/ at build time and served by Vercel's CDN.
// Only the public, data-free SPA shell is returned for direct client-side routes.
app.get('/{*path}', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(path.resolve('dist/client/index.html')));
export default app;

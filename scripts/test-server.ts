import path from 'node:path';
import { rmSync } from 'node:fs';
import { loadConfig } from '../src/server/config/env.js';
import { startServer } from '../src/server/index.js';

// Only this dedicated test directory is reset; the normal runtime/app.sqlite is untouched.
const directory = path.resolve('runtime/e2e');
rmSync(directory, { recursive: true, force: true });
const config = loadConfig({ APP_ORIGIN: 'http://localhost:4318', PORT: '4318', DATABASE_PATH: path.join(directory, 'app.sqlite') });
const running = await startServer({ ...config, authRateLimit: 1000 });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void running.close().then(() => process.exit(0)); });

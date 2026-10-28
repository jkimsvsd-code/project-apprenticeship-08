import { cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// These two paths are build-owned and ignored by Git. Source images/favicon are preserved.
rmSync('public/assets', { recursive: true, force: true });
rmSync('public/index.html', { force: true });
const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
cpSync('dist/client', 'public', { recursive: true });
console.log('Prepared public/ SPA assets for the Vercel CDN.');

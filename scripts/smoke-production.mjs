import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const directory = mkdtempSync(path.join(tmpdir(), 'a08-production-'));
const port = 4320;
const publicOrigin = `https://localhost:${port}`;
const internalOrigin = `http://localhost:${port}`;
const env = { ...process.env, NODE_ENV: 'production', APP_ORIGIN: publicOrigin, WEBAUTHN_RP_ID: 'localhost', PORT: String(port), DATABASE_PATH: path.join(directory, 'app.sqlite') };
const child = spawn(process.execPath, ['--env-file-if-exists=.env', '--import', './scripts/production.mjs', 'dist/server/server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let diagnostics = '';
child.stdout.on('data', chunk => { diagnostics += chunk; });
child.stderr.on('data', chunk => { diagnostics += chunk; });
const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('운영 서버가 시작되지 않았습니다.');
    try { ready = (await fetch(internalOrigin + '/api/health')).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, '운영 서버 준비 시간 초과');
  const page = await fetch(internalOrigin + '/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(!html.includes('/@vite/client') && !html.includes('/src/client/'));
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/);
  assert.ok(asset, '운영 JavaScript asset 없음');
  const js = await fetch(internalOrigin + asset[1]);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(internalOrigin + '/api/private/items')).status, 401);
  assert.equal((await fetch(internalOrigin + '/runtime/app.sqlite')).status, 403);
  assert.equal((await fetch(internalOrigin + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.ok(!page.headers.get('content-security-policy').includes("'unsafe-inline'"));

  // The compiled management CLI works without tsx or any development-only imports.
  const cli = spawn(process.execPath, ['dist/server/server/auth/bootstrap-cli.js', '--account', 'production-smoke', '--name', '가상 운영 검사'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  cli.stdout.on('data', chunk => { output += chunk; });
  const code = await new Promise(resolve => cli.once('exit', resolve));
  assert.equal(code, 0);
  const token = output.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(token, '초기 등록 링크 발급 실패');
  const db = new DatabaseSync(env.DATABASE_PATH);
  try {
    const row = db.prepare('SELECT hash FROM bootstrap_tokens WHERE user_id = ?').get('production-smoke');
    assert.equal(row.hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  } finally { db.close(); }
  const exchange = await fetch(internalOrigin + '/api/setup/exchange', { method: 'POST', headers: { Origin: publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(exchange.status, 200);
  const cookie = exchange.headers.getSetCookie().join(';');
  assert.match(cookie, /__Host-a08_enrollment/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  console.log('PASS: compiled production HTML/assets/API/CSP, denied private path, Origin check, compiled bootstrap CLI, hashed token, Secure/HttpOnly/SameSite cookie.');
  console.log('TLS termination and public HTTPS reachability were not exercised (internal HTTP smoke only).');
} catch (error) {
  console.error(error instanceof Error ? error.message : '운영 스모크 검사 실패');
  // Server startup does not log credentials; never print the CLI output or HTTP cookie.
  console.error(diagnostics);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  await exited; clearTimeout(timer);
  rmSync(directory, { recursive: true, force: true });
}

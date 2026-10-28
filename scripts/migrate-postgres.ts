import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifiedDatabaseUrl } from '../src/server/storage/pool.js';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
if (!url || new URL(url).hostname.includes('-pooler')) throw new Error('마이그레이션에는 공급자가 발급한 직접 연결 환경변수가 필요합니다.');
const pool = new Pool({ connectionString: verifiedDatabaseUrl(url), max: 1, connectionTimeoutMillis: 15_000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('a08:schema'))");
  await client.query('CREATE SCHEMA IF NOT EXISTS a08; REVOKE ALL ON SCHEMA a08 FROM PUBLIC; CREATE TABLE IF NOT EXISTS a08.schema_migrations(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const name of readdirSync('db/migrations').filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(`db/migrations/${name}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const { rows } = await client.query('SELECT checksum FROM a08.schema_migrations WHERE id=$1', [name]);
    if (rows[0]) { if (rows[0].checksum !== checksum) throw new Error('이미 적용한 마이그레이션의 체크섬이 변경되었습니다.'); continue; }
    // Rehearse the exact SQL inside a savepoint; no seed/user/credential data is created.
    await client.query('SAVEPOINT migration_rehearsal');
    await client.query(sql);
    await client.query('ROLLBACK TO SAVEPOINT migration_rehearsal');
    await client.query('RELEASE SAVEPOINT migration_rehearsal');
    await client.query(sql);
    await client.query('INSERT INTO a08.schema_migrations(id,checksum) VALUES ($1,$2)', [name, checksum]);
    console.log(`Applied schema migration: ${name}`);
  }
  await client.query('COMMIT');
  console.log('PASS: migration rehearsal and application; no user data seeded.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', (error as { code?: string }).code ?? 'check schema');
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }

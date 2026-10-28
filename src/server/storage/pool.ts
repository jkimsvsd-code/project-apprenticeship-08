import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

export function verifiedDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL 연결 주소가 필요합니다.');
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}
export function createDatabasePool(value = process.env.DATABASE_URL): Pool {
  if (!value) throw new Error('DATABASE_URL이 설정되지 않았습니다.');
  const pool = new Pool({ connectionString: verifiedDatabaseUrl(value), max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 15000 });
  pool.on('error', () => console.error('Database pool connection error'));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

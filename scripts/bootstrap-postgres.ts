import { parseArgs } from 'node:util';
import { loadConfig } from '../src/server/config/env.js';
import { PostgresStore } from '../src/server/storage/postgres.js';
import { createDatabasePool } from '../src/server/storage/pool.js';

const { values } = parseArgs({ options: { account: { type: 'string', default: 'owner' }, name: { type: 'string', default: '가상 사용자' } } });
if (!process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('배포의 고정 HTTPS APP_ORIGIN이 필요합니다.');
const config = loadConfig({ ...process.env, NODE_ENV: 'production' });
const store = new PostgresStore(createDatabasePool());
try {
  const token = await store.issueBootstrap(values.account!, values.name!);
  console.log('배포 소유자 초기 등록 링크 (15분·일회 교환). 공개·커밋·캡처 금지.');
  console.log(`${config.origin}/setup#token=${token}`);
} catch (error) {
  console.error(error instanceof Error && error.name === 'AppError' ? error.message : '초기 등록 링크 발급을 확인하지 못했습니다. 계정 상태와 연결을 확인하세요.');
  process.exitCode = 1;
} finally { await store.close(); }

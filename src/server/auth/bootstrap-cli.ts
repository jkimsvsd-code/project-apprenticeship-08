import { parseArgs } from 'node:util';
import { loadConfig } from '../config/env.js';
import { Store } from '../storage/store.js';

export function runBootstrap() {
  const { values } = parseArgs({ options: { account: { type: 'string', default: 'owner' }, name: { type: 'string', default: '가상 사용자' } } });
  const config = loadConfig();
  const store = new Store(config.databasePath);
  try {
    const token = store.issueBootstrap(values.account!, values.name!);
    console.log('소유자 초기 등록 링크 (15분, 1회 교환). 이 출력은 공개하거나 캡처하지 마세요.');
    console.log(`${config.origin}/setup#token=${token}`);
    console.log('이미 등록한 계정에는 추가 발급하지 않습니다. 기존 패스키로 로그인해 추가하세요.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : '발급 실패');
    process.exitCode = 1;
  } finally { store.close(); }
}

if (process.argv[1] && /(?:^|[/\\])bootstrap-cli\.js$/.test(process.argv[1])) runBootstrap();

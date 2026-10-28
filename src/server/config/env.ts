import path from 'node:path';

export interface Config {
  origin: string;
  rpId: string;
  rpName: string;
  port: number;
  databasePath: string;
  challengeTtl: number;
  sessionTtl: number;
  enrollmentTtl: number;
  production: boolean;
  secureCookies: boolean;
  authRateLimit: number;
}

function seconds(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback * 1000;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('환경변수의 시간 범위가 올바르지 않습니다.');
  return n * 1000;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origin = env.APP_ORIGIN ?? 'http://localhost:3000';
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password) throw new Error('APP_ORIGIN에는 경로·끝 슬래시 없는 Origin을 지정하세요.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('localhost 이외에는 HTTPS가 필요합니다.');
  const production = env.NODE_ENV === 'production';
  if (production && url.protocol !== 'https:') throw new Error('운영 APP_ORIGIN은 HTTPS여야 합니다.');
  const rpId = env.WEBAUTHN_RP_ID ?? url.hostname;
  if (rpId !== url.hostname) throw new Error('이 앱은 WEBAUTHN_RP_ID와 APP_ORIGIN 호스트를 동일하게 사용합니다.');
  const port = Number(env.PORT ?? (url.port || (url.protocol === 'https:' ? '3000' : '80')));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT가 올바르지 않습니다.');
  return {
    origin, rpId, rpName: env.WEBAUTHN_RP_NAME ?? 'J · 나만의 공간', port,
    databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(env.DATABASE_PATH ?? 'runtime/app.sqlite'),
    challengeTtl: seconds(env.CHALLENGE_TTL_SECONDS, 300, 30, 600),
    sessionTtl: seconds(env.SESSION_TTL_SECONDS, 3600, 60, 86400),
    enrollmentTtl: 15 * 60 * 1000,
    production, secureCookies: url.protocol === 'https:', authRateLimit: 60,
  };
}

import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Config } from './config/env.js';
import type { DataStore } from './storage/contracts.js';
import { WebAuthnService } from './auth/webauthn.js';
import { AppError } from './auth/errors.js';
import { hashToken, randomToken } from './auth/tokens.js';
import { requireSession } from './authorization/access.js';
import { providers } from '../shared/contracts.js';
import { getPrivateItem, listPrivateItems } from './private-data/service.js';

const idSchema = z.string().uuid();
const encoded = z.string().min(1).max(16000).regex(/^[A-Za-z0-9_-]+$/);
const credentialSchema = z.object({
  id: encoded.max(2048), rawId: encoded.max(2048), type: z.literal('public-key'),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  response: z.object({ clientDataJSON: encoded }).passthrough(),
}).passthrough().refine(value => value.id === value.rawId);

export function cookieNames(config: Config) {
  const prefix = config.secureCookies ? '__Host-a08_' : 'a08_';
  return { session: `${prefix}session`, flow: `${prefix}flow`, enrollment: `${prefix}enrollment` };
}

export function createApp(config: Config, store: DataStore) {
  const app = express();
  const auth = new WebAuthnService(store, config);
  const names = cookieNames(config);
  const cookieOptions = { httpOnly: true, secure: config.secureCookies, sameSite: 'strict' as const, path: '/' };
  const readHash = (req: Request, name: string): string | undefined => {
    const value: unknown = req.cookies?.[name];
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? hashToken(value) : undefined;
  };
  const session = (req: Request) => store.getSession(readHash(req, names.session));
  const enrollment = (req: Request) => store.getEnrollment(readHash(req, names.enrollment));
  const flow = (req: Request, res: Response) => {
    const existing = readHash(req, names.flow);
    if (existing) return existing;
    const token = randomToken();
    res.cookie(names.flow, token, { ...cookieOptions, maxAge: config.enrollmentTtl });
    return hashToken(token);
  };
  const setSession = async (req: Request, res: Response, result: { token: string; expiresAt: number }) => {
    await store.revokeSession(readHash(req, names.session));
    res.cookie(names.session, result.token, { ...cookieOptions, maxAge: Math.max(0, result.expiresAt - Date.now()) });
  };
  app.disable('x-powered-by');
  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.use(helmet({
    strictTransportSecurity: config.secureCookies ? undefined : false,
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: config.production ? ["'self'"] : ["'self'", "'unsafe-inline'"],
      styleSrc: config.production ? ["'self'"] : ["'self'", "'unsafe-inline'"],
      connectSrc: config.production ? ["'self'"] : ["'self'", 'ws://localhost:*', 'ws://127.0.0.1:*'],
      imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      formAction: ["'self'"], baseUri: ["'self'"], upgradeInsecureRequests: config.secureCookies ? [] : null,
    } },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Vary', 'Cookie'); next(); });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') !== config.origin || req.get('sec-fetch-site') === 'cross-site') {
        throw new AppError(403, 'ORIGIN_REJECTED', '요청 출처를 확인할 수 없습니다. 원래 페이지에서 다시 시도하세요.');
      }
      if (!req.is('application/json')) throw new AppError(415, 'JSON_REQUIRED', 'JSON 요청이 필요합니다.');
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: config.authRateLimit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: '시도가 많습니다. 잠시 후 다시 시도해 주세요.' } },
  });
  app.use('/api/auth', limiter);
  app.use('/api/setup', limiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/session', async (req, res) => {
    const hash = readHash(req, names.session);
    const current = await store.getSession(hash);
    if (!current) {
      // A cross-site top-level GET may omit a SameSite=Strict cookie. It must not log the user out.
      if (hash) res.clearCookie(names.session, cookieOptions);
      res.json({ user: null }); return;
    }
    res.json({ user: { id: current.user.id, displayName: current.user.displayName }, expiresAt: current.expiresAt });
  });

  app.post('/api/setup/exchange', async (req, res) => {
    if (await session(req)) throw new AppError(409, 'ALREADY_SIGNED_IN', '이미 로그인되어 있습니다. 패스키 관리에서 추가하세요.');
    const { token } = z.object({ token: z.string().length(43).regex(/^[A-Za-z0-9_-]+$/) }).strict().parse(req.body);
    const result = await store.exchangeBootstrap(token, config.enrollmentTtl);
    res.cookie(names.enrollment, result.token, { ...cookieOptions, maxAge: config.enrollmentTtl });
    res.json({ displayName: result.enrollment.displayName, expiresAt: result.enrollment.expiresAt });
  });
  app.get('/api/setup', async (req, res) => {
    const current = await enrollment(req);
    if (!current) throw new AppError(401, 'SETUP_REQUIRED', '유효한 초기 등록 링크가 필요합니다. 관리자 도구에서 새 링크를 발급하세요.');
    res.json({ displayName: current.displayName, expiresAt: current.expiresAt });
  });

  app.post('/api/auth/registration/options', async (req, res) => {
    res.json(await auth.registrationOptions(flow(req, res), await session(req), await enrollment(req)));
  });
  app.post('/api/auth/registration/verify', async (req, res) => {
    const input = z.object({
      challengeId: idSchema, response: credentialSchema,
      name: z.string().trim().min(1).max(40), provider: z.enum(providers),
    }).strict().parse(req.body);
    const flowHash = readHash(req, names.flow);
    if (!flowHash) throw new AppError(400, 'FLOW_REQUIRED', '등록을 새로 시작해 주세요.');
    const result = await auth.register({ ...input, response: input.response as unknown as RegistrationResponseJSON }, flowHash, await session(req), await enrollment(req));
    if (result) await setSession(req, res, result);
    res.clearCookie(names.enrollment, cookieOptions);
    res.status(201).json({ verified: true });
  });
  app.post('/api/auth/authentication/options', async (req, res) => {
    res.json(await auth.authenticationOptions(flow(req, res)));
  });
  app.post('/api/auth/authentication/verify', async (req, res) => {
    const input = z.object({ challengeId: idSchema, response: credentialSchema }).strict().parse(req.body);
    const flowHash = readHash(req, names.flow);
    if (!flowHash) throw new AppError(400, 'FLOW_REQUIRED', '로그인을 새로 시작해 주세요.');
    const result = await auth.authenticate({ ...input, response: input.response as unknown as AuthenticationResponseJSON }, flowHash);
    await setSession(req, res, result);
    res.json({ verified: true });
  });
  app.post('/api/auth/cancel', async (req, res) => {
    const { challengeId } = z.object({ challengeId: idSchema }).strict().parse(req.body);
    const flowHash = readHash(req, names.flow);
    if (flowHash) await store.cancelChallenge(challengeId, flowHash);
    res.status(204).end();
  });
  app.post('/api/auth/logout', async (req, res) => {
    await store.logout({ sessionHash: readHash(req, names.session), enrollmentHash: readHash(req, names.enrollment), flowHash: readHash(req, names.flow) });
    for (const name of Object.values(names)) res.clearCookie(name, cookieOptions);
    res.status(204).end();
  });
  app.get('/api/passkeys', async (req, res) => res.json({ passkeys: await store.passkeys(requireSession(await session(req))) }));
  app.delete('/api/passkeys/:id', async (req, res) => {
    const current = requireSession(await session(req));
    const id = encoded.max(2048).parse(req.params.id);
    await store.deleteCredential(current.user.id, id);
    const sessionRevoked = !await store.getSession(current.hash);
    if (sessionRevoked) res.clearCookie(names.session, cookieOptions);
    res.json({ deleted: true, sessionRevoked });
  });
  app.get('/api/private/items', async (req, res) => {
    // Query/body account identifiers never grant access; the session determines the owner.
    res.json({ items: await listPrivateItems(store, await session(req)) });
  });
  app.get('/api/private/items/:id', async (req, res) => {
    res.json({ item: await getPrivateItem(store, await session(req), z.string().min(1).max(200).parse(req.params.id)) });
  });
  app.use('/api', () => { throw new AppError(404, 'NOT_FOUND', '요청한 기능을 찾을 수 없습니다.'); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: '입력값을 확인하고 다시 시도해 주세요.' } }); return; }
    if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    const typed = error as { type?: string; status?: number };
    if (typed?.type === 'entity.too.large') { res.status(413).json({ error: { code: 'TOO_LARGE', message: '요청 크기가 너무 큽니다.' } }); return; }
    if (error instanceof SyntaxError && typed.status === 400) { res.status(400).json({ error: { code: 'INVALID_JSON', message: '요청 형식이 올바르지 않습니다.' } }); return; }
    // Do not log request bodies, credentials, cookies, or bootstrap links.
    console.error('서버 처리 오류:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' } });
  });
  return app;
}

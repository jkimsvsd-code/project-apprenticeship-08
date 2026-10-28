# 실제 폴더 구조

React·Express·SimpleWebAuthn, 로컬 SQLite / 운영 Neon PostgreSQL, 배포·검증·제출 문서를 포함합니다.
공개 소스·가공한 증거만 표시합니다. node_modules·dist·runtime·public 생성물·로컬 환경변수·test-results 및 .gitkeep은 생략했습니다.

```text
project-apprenticeship-08/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── bug_report.yml
│   ├── workflows/
│   │   └── ci.yml
│   └── pull_request_template.md
├── db/
│   └── migrations/
│       └── 001_passkey.sql
├── docs/
│   ├── baseline/
│   │   └── assignment01/
│   │       ├── README.md
│   │       ├── index.html
│   │       └── styles.css
│   ├── architecture.md
│   ├── authentication-report.md
│   ├── final-audit.md
│   ├── hosting.md
│   ├── public-release.md
│   ├── requirements.md
│   ├── stack.md
│   ├── structure.md
│   ├── submission.md
│   ├── ux.md
│   ├── verification-plan.md
│   └── verification-results.md
├── evidence/
│   ├── authentication/
│   │   └── verified-authentication.json
│   ├── authorization/
│   │   ├── anonymous-page.html
│   │   └── verified-isolation.json
│   ├── deployment/
│   │   ├── https-verification.json
│   │   ├── owner-registration-status.json
│   │   ├── postgres-check.json
│   │   ├── private-https.png
│   │   ├── public-https.png
│   │   ├── storage-memo-https.png
│   │   ├── ux-environment-checks.json
│   │   ├── ux-mobile-https.png
│   │   ├── ux-verification.json
│   │   └── two-passkeys-https.png
│   ├── passkey-lifecycle/
│   │   ├── two-passkeys.png
│   │   └── verified-revocation.json
│   ├── registration/
│   │   ├── cancellation.json
│   │   └── verified-registration.json
│   ├── ux/
│   │   ├── passkeys-mobile.png
│   │   ├── private-desktop.png
│   │   ├── public-desktop.png
│   │   ├── public-mobile.png
│   │   ├── storage-memo-desktop.png
│   │   ├── storage-memo-mobile.png
│   │   ├── verified-storage-memo.json
│   │   └── verified-ux.json
│   └── README.md
├── public/
│   └── favicon.svg
├── scripts/
│   ├── README.md
│   ├── bootstrap-postgres.ts
│   ├── bootstrap.ts
│   ├── check-postgres.ts
│   ├── migrate-postgres.ts
│   ├── prepare-vercel.mjs
│   ├── production.mjs
│   ├── smoke-production.mjs
│   ├── test-server.ts
│   ├── verify-deployment-ux.ts
│   └── verify-deployment.ts
├── src/
│   ├── client/
│   │   ├── passkeys/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── PasskeysPage.tsx
│   │   │   ├── RegistrationForm.tsx
│   │   │   ├── SetupPage.tsx
│   │   │   └── useCeremony.ts
│   │   ├── private-space/
│   │   │   └── VaultPage.tsx
│   │   ├── public-profile/
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── content.html
│   │   │   └── profile.css
│   │   ├── shared/
│   │   │   ├── api.ts
│   │   │   ├── components.tsx
│   │   │   └── session.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── server/
│   │   ├── auth/
│   │   │   ├── bootstrap-cli.ts
│   │   │   ├── errors.ts
│   │   │   ├── tokens.ts
│   │   │   └── webauthn.ts
│   │   ├── authorization/
│   │   │   └── access.ts
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── private-data/
│   │   │   └── service.ts
│   │   ├── storage/
│   │   │   ├── contracts.ts
│   │   │   ├── pool.ts
│   │   │   ├── postgres.ts
│   │   │   └── store.ts
│   │   ├── app.ts
│   │   ├── index.ts
│   │   └── vercel.ts
│   └── shared/
│       └── contracts.ts
├── tests/
│   ├── e2e/
│   │   └── passkeys.spec.ts
│   ├── fixtures/
│   │   ├── accounts.json
│   │   └── private-items.json
│   ├── integration/
│   │   └── api.test.ts
│   ├── unit/
│   │   ├── policies.test.ts
│   │   └── storage.test.ts
│   └── helpers.ts
├── .dockerignore
├── .editorconfig
├── .env.example
├── .gitignore
├── .nvmrc
├── .vercelignore
├── Dockerfile
├── README.md
├── SECURITY.md
├── index.html
├── package-lock.json
├── package.json
├── playwright.config.ts
├── server.mjs
├── tsconfig.json
├── tsconfig.server.json
├── vercel.json
└── vite.config.ts
```

## 역할

| 경로 | 역할 |
| --- | --- |
| src/client/public-profile | 과제1 원문과 새 개인 공간 진입점 |
| src/client/passkeys | 로그인·첫 등록·추가 등록·삭제 UI와 인증 진행 제어 |
| src/client/private-space | 서버에서 받은 본인 가상 자료 표시 |
| src/client/shared | 네트워크·세션·환경 안내·대화상자·접근성 |
| src/server/auth | 실제 WebAuthn 검증·초기 등록 CLI·토큰·오류 |
| src/server/authorization | 세션 필수 검사 |
| src/server/private-data | 세션 사용자에 따른 본인 자료 조회 |
| src/server/storage | SQLite·PostgreSQL 구현·공개키·질문·세션·소유권·삭제 트랜잭션 |
| src/server/config | HTTPS·Origin·RP ID·저장 경로·수명 설정 |
| tests | Node 단위·HTTP 통합·실제 서명 E2E 및 가상 예시 |
| evidence | 쿠키·세션·토큰·개인키를 제외한 가상 인증기 증거 |
| docs | 선정 근거·설계·요구사항·UX·검증·제출·원본 출처 |
| scripts | 로컬 관리·운영 시작·전용 테스트 서버·운영 스모크 검사 |
| .github | CI·PR·버그 신고 틀 |

GitHub public과 Vercel HTTPS에 게시했습니다. 운영 검증 기록은 evidence/deployment/에 있습니다. 물리 패스키·저장 제공자 검증은 별도입니다.

운영 진입점은 server.mjs → src/server/vercel.ts이며 db/migrations/는 PostgreSQL 스키마를 관리합니다.

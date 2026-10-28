# 과제8 · 패스키로 보호하는 나만의 공간

[과제1의 J 소개](https://github.com/jkimsvsd-code/project-apprenticeship-01)를 보존하고, 패스키로만 여는 개인 공간을 추가했습니다.
공개 소개는 누구나 볼 수 있고, 비공개 자료는 서버가 인증·소유권을 확인한 뒤에만 반환합니다.

## 구현 상태

- 등록·로그인·로그아웃, 서버 세션 폐기, 자료 격리, 패스키 목록·추가·삭제를 구현했습니다.
- 필수 기준 47개를 추적하고 승인된 추가 UX U1–U6을 반영했습니다.
- 과제1의 본문·경험 상세 3개를 원문 보존했으며 자동 비교 검사가 있습니다.
- 개인 공간과 검증 계정의 자료는 모두 가상입니다. 공개 소개의 경험은 원래 공개한 내용을 유지했습니다.
- 실제 WebAuthn 검증 라이브러리와 Chromium 가상 인증기로 성공·거절 흐름을 검증합니다. 검증기를 mock하지 않습니다.
- 실제 지문·얼굴·물리 보안 키, 저장 제공자 동기화, Safari·모바일 실기기 검증은 별도 필요합니다.
- public 소스 게시와 GitHub Actions 검증을 완료했습니다. HTTPS 배포와 운영 검증을 진행합니다. [배포 안내](docs/hosting.md)와 [공개 점검](docs/public-release.md)을 확인하세요.

## 기술 스택

Node.js 24 · TypeScript · React · Vite · Express · SimpleWebAuthn · 로컬 SQLite / 배포 PostgreSQL(Neon) · Playwright · axe-core.
정확한 버전은 package-lock.json에 고정했습니다. [선정 근거와 운영 제약](docs/stack.md)을 참고하세요.

## 로컬 실행

Node.js 24와 npm이 필요합니다. 기본 주소는 http://localhost:3000 입니다.

```sh
nvm use
npm ci
cp .env.example .env
npm run dev
```

Windows에서는 `.env.example`을 `.env`로 복사하고 Node.js 24에서 같은 npm 명령을 실행합니다.
공개 소개·잠긴 화면은 초기 설정 없이 볼 수 있습니다. 서비스 비밀번호·공개 회원가입은 없습니다.

## 소유자 첫 패스키

서버가 실행 중인 상태에서 별도 터미널로 다음을 실행합니다.

```sh
npm run bootstrap -- --account owner --name "가상 사용자"
```

관리 도구가 표시한 `/setup#token=…` 링크를 같은 브라우저에서 엽니다. 링크는 15분 동안 한 번 교환할 수 있습니다.
링크 원문은 공개하거나 캡처하지 마세요. URL fragment를 사용하고 페이지는 즉시 주소에서 제거합니다.
처음 등록을 완료해야 계정·공개키·가상 자료 3개가 저장됩니다. 취소한 등록은 계정·패스키로 확정하지 않습니다.
등록한 계정에는 초기 링크를 재발급하지 않습니다. 로그인 후 패스키 관리에서 두 번째 패스키를 추가하세요.
링크 교환 후 취소했다면 같은 브라우저의 `/setup`에서 유효시간 안에 다시 시도할 수 있습니다.

SQLite 파일은 `runtime/app.sqlite`에 저장되며 Git에서 제외합니다. 원본을 잃으면 공개키·자료도 잃으므로 운영 시 영속 디스크와 백업이 필요합니다.

## 검증

```sh
npm run check
npm run test:production
npx playwright install chromium
npm run test:e2e
```

이미 설치된 Chrome을 사용할 경우 macOS/Linux에서 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`로 실행할 수 있습니다.
Windows PowerShell에서는 `$env:PLAYWRIGHT_CHANNEL='chrome'` 설정 후 npm 명령을 실행합니다.
E2E 전용 서버는 localhost:4318을 사용하고 `runtime/e2e/`만 초기화합니다. 일반 로컬 DB를 초기화하지 않습니다.
최종 로컬 결과: 단위·HTTP 10개, 브라우저 시나리오 3개, 형 검사·빌드·운영 진입점 스모크 검사 통과.
테스트용 가상 인증기 개인키는 테스트·브라우저 메모리에서만 다루며 공개 증거에는 저장하지 않습니다.
스크린샷·요청·응답은 `evidence/`에 갱신됩니다. 물리 기기의 확인 결과로 해석하지 않습니다.

## HTTPS 배포

소스: https://github.com/jkimsvsd-code/project-apprenticeship-08

고정 운영 주소: https://project-apprenticeship-08.vercel.app (현재 배포 검증 진행 중)

배포는 Vercel + Neon 영속 PostgreSQL을 사용합니다. 설정·관리·재배포는 [배포 안내](docs/hosting.md)를 확인하세요.

## 화면과 API

| 화면 | 역할 |
| --- | --- |
| `/` | 과제1 공개 소개와 잠긴 공간 진입점 |
| `/vault` | 잠금 안내 또는 본인 가상 자료 3개 |
| `/login` | 패스키 로그인과 안전한 원래 목적지 복귀 |
| `/passkeys` | 패스키 이름·등록일·저장 위치, 추가·삭제 |
| `/setup` | 서버 관리자가 발급한 첫 등록 링크의 진입점 |

API는 [설계](docs/architecture.md), 실제 소스는 `src/server/app.ts`에서 확인합니다.

## 문서

- [선정한 스택](docs/stack.md) / [실제 폴더 트리](docs/structure.md)
- [요구사항 추적표](docs/requirements.md) / [U1–U6](docs/ux.md)
- [인증 구현 설명서 6항목](docs/authentication-report.md)
- [검증 계획](docs/verification-plan.md) / [검증 결과와 한계](docs/verification-results.md)
- [제출 안내·확인 방법 4줄·AI 판단 3줄](docs/submission.md)
- [공개·배포 점검](docs/public-release.md) / [증거 보관](evidence/README.md)
- [과제1 원본 출처](docs/baseline/assignment01/README.md)

라이선스는 아직 선택하지 않았습니다. GitHub 게시·배포 전에 원본 자산의 공개 범위와 라이선스를 최종 확인합니다.

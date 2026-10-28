# 로컬·운영 관리 도구

- `npm run bootstrap -- --account owner --name "가상 사용자"`: 15분·일회 교환 초기 링크를 발급합니다. 이미 등록한 계정의 공개키를 교체하거나 인증을 우회하지 않습니다.
- `npm run test:production`: 빌드 후 임시 DB·내부 HTTP에서 운영 진입점과 컴파일된 관리 CLI를 검사하고 정리합니다. TLS 종료는 확인하지 않습니다.
- `scripts/production.mjs`: `npm start`의 NODE_ENV=production을 설정합니다.
- `scripts/test-server.ts`: E2E 전용 localhost:4318 서버. `runtime/e2e/`만 초기화하며 일반 DB는 건드리지 않습니다.

초기 링크는 로컬 관리 권한으로만 생성하며 공개 발급 API가 없습니다.
취소 후 계정이 확정되지 않았다면 링크를 새로 발급해 기존 등록 준비를 대체할 수 있습니다.
등록된 계정의 모든 키를 잃은 경우 이 도구로 복구하지 않습니다.
가상 비공개 항목 3개는 첫 등록 완료 트랜잭션에서 생성합니다.
`tests/fixtures/`는 가상 데이터 예시이며 이 파일을 앱의 정적 번들에 넣지 않습니다.

## Vercel + Neon

운영 환경변수는 Git에서 제외한 .env.production.local에만 보관합니다.

- `npm run db:migrate:postgres`: 직접 연결로 롤백 예행 후 체크섬과 함께 스키마 적용.
- `npm run bootstrap:postgres -- --account owner --name "가상 사용자"`: 실제 HTTPS Origin의 15분 일회 등록 링크. 출력은 비밀값이므로 공개 로그에 저장하지 않습니다.
- `npm run test:postgres`: 새 가상 계정만 사용해 원자적 질문 소비·키 삭제·계정 격리·로그아웃 검증 후 정리.
- `PLAYWRIGHT_CHANNEL=chrome node --env-file=.env.production.local --import tsx scripts/verify-deployment.ts`: 운영 HTTPS에서 진짜 WebAuthn 등록·로그인·삭제·접근 제한 확인. CDP 개인키는 메모리에서만 사용하고 공개 증거에 기록하지 않습니다.
- `npm run vercel-build`: CLI 업로드 전에 실행해 public/ 생성물을 준비합니다. Git에는 생성물을 올리지 않습니다.

재배포 명령과 Origin·RP ID 정책은 [배포 안내](../docs/hosting.md)를 참고하세요.

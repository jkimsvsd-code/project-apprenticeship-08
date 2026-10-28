# 로컬 관리 도구

- `npm run bootstrap -- --account owner --name "가상 사용자"`: 15분·일회 교환 초기 링크를 발급합니다. 이미 등록한 계정의 공개키를 교체하거나 인증을 우회하지 않습니다.
- `npm run test:production`: 빌드 후 임시 DB·내부 HTTP에서 운영 진입점과 컴파일된 관리 CLI를 검사하고 정리합니다. TLS 종료는 확인하지 않습니다.
- `scripts/production.mjs`: `npm start`의 NODE_ENV=production을 설정합니다.
- `scripts/test-server.ts`: E2E 전용 localhost:4318 서버. `runtime/e2e/`만 초기화하며 일반 DB는 건드리지 않습니다.

초기 링크는 로컬 관리 권한으로만 생성하며 공개 발급 API가 없습니다.
취소 후 계정이 확정되지 않았다면 링크를 새로 발급해 기존 등록 준비를 대체할 수 있습니다.
등록된 계정의 모든 키를 잃은 경우 이 도구로 복구하지 않습니다.
가상 비공개 항목 3개는 첫 등록 완료 트랜잭션에서 생성합니다.
`tests/fixtures/`는 가상 데이터 예시이며 이 파일을 앱의 정적 번들에 넣지 않습니다.

# HTTPS 배포

- 소스: https://github.com/jkimsvsd-code/project-apprenticeship-08
- 고정 운영 Origin: https://project-apprenticeship-08.vercel.app
- 호스팅: Vercel Express / Node.js 24 / Singapore(sin1)
- 영속 DB: Vercel Marketplace Neon Free(free_v3), Singapore. 별도의 Neon Auth·Data API는 활성화하지 않습니다.

현재 문서 작성 시점은 배포 준비 단계입니다. 실제 배포 결과는 evidence/deployment/와 최종 검증 결과에 기록합니다.

## 저장·권한 경계

server.ts는 배포 진입점이고, src/server/storage/postgres.ts가 PostgreSQL을 사용합니다.
로컬 npm run dev는 기존 SQLite를 유지합니다. 두 구현은 DataStore 계약과 같은 WebAuthn 검증·서버 권한 검사를 사용합니다.
배포 서버의 임시 파일이나 프로세스 메모리에 공개키·질문·세션·자료를 저장하지 않습니다.
DB 연결값은 Vercel production에만 연결하고 프런트엔드 변수로 내보내지 않습니다.
PostgreSQL의 a08 스키마는 PUBLIC 권한을 제거하고 모든 앱 질의를 파라미터로 바인딩합니다.
원자적 DELETE RETURNING과 사용자별 트랜잭션 잠금으로 질문 재사용·마지막 키 동시 삭제를 막습니다.

## 재배포

Vercel CLI로 이 저장소의 연결 대상을 확인한 후 배포합니다. 일반 로컬 실행에는 이 설정이 필요 없습니다.

```sh
vercel project inspect --non-interactive
vercel deploy --prod
```

npm run vercel-build는 Vite·서버 검사를 실행하고 공개 빌드 자산만 public/에 복사합니다.
public/assets와 public/index.html은 생성물이므로 Git에서 제외합니다. Express가 처리할 SPA 직접 경로에는 데이터 없는 index.html만 반환합니다.
NODE_ENV=production, APP_ORIGIN과 WEBAUTHN_RP_ID는 고정 운영 도메인을 사용합니다.
임시 preview 주소로 등록한 키는 운영 도메인의 키와 다르므로 혼용하지 않습니다.

## 스키마·관리 명령

DB 관리 명령은 Git에서 제외한 .env.production.local을 사용합니다. 연결값·초기 등록 링크를 제출물이나 이슈에 넣지 않습니다.

```sh
npm run db:migrate:postgres
npm run test:postgres
npm run bootstrap:postgres -- --account owner --name "가상 사용자"
```

마이그레이션은 공급자가 발급한 직접 연결로 롤백 예행 후 적용하고 체크섬을 기록합니다. 적용된 SQL은 수정하지 않고 후속 파일을 추가합니다.
관리 CLI는 이미 등록한 계정의 키를 교체하지 않습니다. 모든 키 상실 시 자동 복구가 없다는 기존 정책을 유지합니다.
테스트 계정은 검증 실행별 고유 ID를 사용하고 끝난 뒤 해당 ID의 행만 정리합니다. 실제 소유자 계정과 전체 DB를 초기화하지 않습니다.

## 확인 범위

클라우드의 인증·권한 검증은 실제 HTTPS와 실제 PostgreSQL에 대해 Chromium 가상 인증기로 실행합니다.
검증기나 서버 DB를 mock하지 않습니다. 물리 기기·지문·얼굴·실제 패스키 저장 제공자의 검증은 별도 필요합니다.
요청 횟수 제한은 아직 프로세스 메모리이므로 여러 함수 인스턴스를 가로지르는 강제 전역 제한은 보장하지 않습니다.

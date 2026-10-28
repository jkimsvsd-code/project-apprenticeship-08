# 로컬·HTTPS 운영 검증 결과

검증 환경: Node.js 24, macOS, 설치된 Chrome의 CDP 가상 인증기. 실행일: 2026-10-28 (Asia/Seoul).
실제 기기·지문·얼굴·물리 보안 키를 확인한 기록이 아닙니다. 서명 검증 함수는 실제 SimpleWebAuthn을 사용합니다.

## 사용자 흐름

공개 소개 → 초기 등록/패스키 로그인 → 서버 질문·서명·세션 확인 → 로컬 SQLite / 운영 PostgreSQL의 본인 자료만 반환 → 개인 공간 표시 → 로그아웃·패스키 삭제 후 재요청 거절.

| 경계 | 확인한 내용 | 증거 |
| --- | --- | --- |
| 공개 화면 | 과제1 본문 일치, details 3개, 등록 없는 첫 화면 | tests/unit/policies.test.ts, evidence/ux/public-desktop.png |
| 등록 | 서로 다른 질문, 실제 attestation 검증, 공개키 저장, 취소 시 계정·키 미확정 | evidence/registration/ |
| 로그인 | 실제 서명 성공, 잘못된 서명·질문 재사용 거절, UV 필수 | evidence/authentication/ |
| 세션 | HttpOnly·SameSite, 서버 폐기, 로그아웃 이전 값 재사용 거절 | tests/integration/api.test.ts, evidence/authentication/ |
| 자료 | 미인증 401, 양방향 타인 접근 403, 계정값 변조 시 본인 자료만, 전후 건수 동일 | evidence/authorization/ |
| 패스키 | 2개 등록, 1개 삭제, 삭제 키 거절·남은 키 성공, 마지막 키 차단 | evidence/passkey-lifecycle/ |
| UX | U1–U6, 320·375px 넘침 없음, 대화상자 포커스·Escape·복귀, 자동 WCAG 검사 | evidence/ux/ |

최종 실행: 아래 명령이 모두 통과했습니다. JSON 증거에는 실행 시각과 소스·테스트·lockfile의 SHA-256 요약을 포함합니다.
운영 검증은 소스 커밋 `15acf07168f73803044da11683d97b75f597e8f1`와 Vercel 배포 `dpl_2mAULuZkFqLuvWXEvZE8om7oJuAE`를 기록합니다. 이후 문서·증거 커밋은 운영 코드 변경을 포함하지 않습니다.

## 명령과 현재 결과

- `npm run check`: 단위·HTTP 통합 테스트 10개 통과, TypeScript 형 검사 및 Vite·서버 빌드 성공.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 브라우저 시나리오 3개 모두 통과. 주요 화면 axe WCAG A/AA 위반 0건. 실기기 수동 검사 결과는 아님.
- `npm run test:production`: npm start와 같은 운영 진입점, 운영 HTML·immutable 자산·API·CSP·컴파일된 초기 등록 CLI·해시 저장·Secure/HttpOnly/SameSite 쿠키 검사 통과. 내부 HTTP 스모크 검사이며, 외부 TLS는 아래 운영 검증으로 별도 확인.
- GitHub Actions: 원격 실행 통과. [실행 기록](https://github.com/jkimsvsd-code/project-apprenticeship-08/actions/runs/40640876414).
- Docker 이미지: 정의했으나 Docker 빌드는 실행하지 않음.

## 남은 실제 환경 검증

- 물리 인증기 2개 또는 독립된 실제 패스키 저장 위치로 등록·삭제·잔여 키 로그인 확인.
- 패스키 실제 저장 제공자와 동기화·복구 특성 확인.
- Safari·Firefox·실제 iOS/Android와 스크린리더 수동 확인.
- Neon 백업·복구 정책 확인 및 실제 복원 훈련.
- 사용자 판단 문구 보완과 과제 최종 제출.

## 실제 HTTPS 운영 검증

운영 주소 https://project-apprenticeship-08.vercel.app 에서 2026-10-28 실행했습니다. TLS 검증을 끄거나 Vercel 인증 우회 헤더를 사용하지 않았습니다. 공개 첫 화면과 JS·CSS는 인증 없이 200입니다.
실제 Chrome CDP 가상 인증기가 생성한 WebAuthn 서명을 실제 서버·Neon DB로 검증했습니다. 저장소나 서명 검증을 mock하지 않았습니다.

| 동작 | 실제 결과 |
| --- | --- |
| 패스키 등록 | A에 서로 다른 키 2개, B에 1개 등록 201; 공개키 DB 저장 |
| 패스키 로그인 | 올바른 서명 200, 변조 서명·소비한 질문 400 |
| 패스키 삭제 | 예비 키 삭제 200; 삭제된 키 로그인 400; 남은 키 로그인 200; 마지막 키 삭제 409 |
| 비공개 자료 | 미인증 401; 각 계정 본인 자료 3개 200; A→B·B→A 403 |
| 계정값 변조 | 서버 세션 사용자의 자료만 반환; 자료 건수 3·3 유지 |
| 세션·출처 | Secure·HttpOnly·SameSite=Strict·__Host- 쿠키; 로그아웃 이전 쿠키 401; 잘못된 Origin 403 |
| 영속 저장소 | 동일 Neon DB로 공개키·질문·세션 처리; DB 동시 질문 소비·키 삭제 검증도 통과 |
| 정리 | 생성한 테스트 계정·공개키·자료만 삭제, 소유자 자료 초기화 없음 |

[요청·응답·공개키 JSON](../evidence/deployment/https-verification.json), [실제 PostgreSQL 동시성 검사](../evidence/deployment/postgres-check.json), [운영 화면](../evidence/deployment/public-https.png).
쿠키·세션 원문·초기 링크·개인키는 증거에서 제외했습니다. 초기 배포의 JS/CSS 누락은 수정 후 전체 시나리오를 다시 통과했습니다.

## 저장소 메모와 두 번째 등록 안내 수정

저장 위치 선택처럼 보이던 드롭다운을 ‘저장소 메모 남기기 (선택)’ 안으로 옮기고 메모·실제 인증기 선택을 구분했습니다. 목록도 사용자 메모로 표시합니다.
두 번째 등록의 3단계와 QR·동기화된 기존 키·지원 저장소가 없는 환경의 다음 행동을 안내합니다.

기존 CDP 인증기를 유지하고 메모만 Google·iCloud로 바꿔도 실제 중복 등록은 거절되며 저장 키 수는 1개로 유지되는 것을 확인했습니다. 다른 CDP 인증기로 바꾸면 두 번째 등록이 성공합니다. [회귀 증거](../evidence/ux/verified-storage-memo.json).
펼친 안내·메모 폼은 320/375px 넘침 및 axe WCAG 위반 0건을 확인했습니다. 이 테스트의 Google·iCloud 값은 사용자 메모일 뿐, 실제 제공자를 사용했다는 의미가 아닙니다.

동일한 메모 변경·실제 중복 거절·별도 키 등록을 운영 HTTPS에서도 통과했습니다. [운영 화면](../evidence/deployment/storage-memo-https.png)과 [운영 JSON의 storageMemo 항목](../evidence/deployment/https-verification.json)을 확인하세요.

## 관리자 검토 진입

공개 페이지의 ‘내용 검토 - 관리자 전용’ 버튼은 미로그인 시 `/login?next=%2Fvault`로 바로 이동하고 실제 WebAuthn 로그인 성공 후 본인 자료 3개를 표시합니다. 유효한 세션이 있으면 `/vault`로 직접 이동합니다. 실제 HTTPS에서 두 흐름을 확인했으며 운영 JSON의 adminEntry 항목에 기록했습니다.

## 최종 제출 점검

최신 47개 기준과 U1–U6의 대조 결과는 [최종 점검](final-audit.md)을 기준으로 봅니다. 이번 운영 UX 점검은 [JSON](../evidence/deployment/ux-verification.json)에 있으며, 실제 소유자 계정은 읽기 전용 확인 시 키 1개·가상 자료 3개였습니다. C26 실제 저장 제공자와 물리 예비 키 검증, 최종 제출은 별도입니다.

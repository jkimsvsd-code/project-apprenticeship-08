# 로컬 검증 결과

검증 환경: Node.js 24, macOS, 설치된 Chrome의 CDP 가상 인증기. 실행일: 2026-10-28 (Asia/Seoul).
실제 기기·지문·얼굴·물리 보안 키를 확인한 기록이 아닙니다. 서명 검증 함수는 실제 SimpleWebAuthn을 사용합니다.

## 사용자 흐름

공개 소개 → 초기 등록/패스키 로그인 → 서버 질문·서명·세션 확인 → SQLite의 본인 자료만 반환 → 개인 공간 표시 → 로그아웃·패스키 삭제 후 재요청 거절.

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
Git 저장소가 아직 초기화되지 않았으므로 커밋 SHA를 만들어 적지 않습니다.

## 명령과 현재 결과

- `npm run check`: 단위·HTTP 통합 테스트 10개 통과, TypeScript 형 검사 및 Vite·서버 빌드 성공.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 브라우저 시나리오 3개 모두 통과. 주요 화면 axe WCAG A/AA 위반 0건. 실기기 수동 검사 결과는 아님.
- `npm run test:production`: npm start와 같은 운영 진입점, 운영 HTML·immutable 자산·API·CSP·컴파일된 초기 등록 CLI·해시 저장·Secure/HttpOnly/SameSite 쿠키 검사 통과. 내부 HTTP로 확인했으며 외부 TLS는 미검증.
- GitHub Actions workflow: 작성했으나 원격에서 실행하지 않음.
- Docker 이미지: 정의했으나 Docker 빌드는 실행하지 않음.

## 남은 실제 환경 검증

- 물리 인증기 2개 또는 독립된 실제 패스키 저장 위치로 등록·삭제·잔여 키 로그인 확인.
- 패스키 실제 저장 제공자와 동기화·복구 특성 확인.
- Safari·Firefox·실제 iOS/Android와 스크린리더 수동 확인.
- 고정된 HTTPS Origin/RP ID, 운영 Secure 쿠키, 영속 디스크·백업 점검.
- public 결과물·소스 URL의 시크릿 창 검증과 최종 제출.

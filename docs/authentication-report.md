# 인증 구현 설명서

로컬 및 실제 HTTPS 배포의 자동 검증 기록입니다. 물리 기기 검증과 과제 최종 제출은 별도입니다.

## ① 무엇으로 붙였나

라이브러리 방식입니다. SimpleWebAuthn server 14.0.3 / browser 14.0.0으로 WebAuthn을 처리합니다.
React·TypeScript·Vite 화면, Express 서버, 로컬 Node.js 24 SQLite와 배포 Neon PostgreSQL을 사용합니다. 배포 진입점은 server.mjs → src/server/vercel.ts, 영속 저장 구현은 src/server/storage/postgres.ts입니다. 전체 고정 버전은 package-lock.json에 있습니다.
서비스 서버에는 credential ID, 공개키, 카운터, 소유자, 이름·등록일·사용자가 기록한 저장 위치를 저장합니다.
개인키나 지문·얼굴 정보는 서비스에 전송하지 않습니다.

자동 검증의 저장 위치는 Chromium 소프트웨어 가상 인증기입니다. 실제 Google 비밀번호 관리자·iCloud·기기·보안 키는 아직 확인하지 않았습니다.
화면의 저장 위치는 사용자가 실제 선택을 확인해 적는 메타데이터이며 서버가 자동으로 확인한 제공자 증명이 아닙니다.
[등록 요청·응답과 저장 공개키](../evidence/registration/verified-registration.json), [등록 취소 기록](../evidence/registration/cancellation.json)을 참고하세요.

## ② 왜 그걸 골랐나

공개키 검증을 직접 작성하지 않으면서 일회성 질문·서버 세션·계정 격리·삭제를 소스와 DB에서 추적할 수 있기 때문입니다.
추가 서비스 계정 없이 Node.js 24에서 재현하고, SQLite 트랜잭션으로 질문 소비와 마지막 패스키 삭제의 경합을 처리합니다.
Vercel 운영에서는 영속 Neon PostgreSQL과 사용자별 트랜잭션 잠금을 적용해 여러 함수 인스턴스가 같은 질문·세션·공개키를 공유합니다. [선정 근거](stack.md)에 대안을 정리했습니다.

## ③ 어디를 어떻게 고쳤나

| 흐름 | 클라이언트 → API → 서버 검증·저장 |
| --- | --- |
| 첫 등록 | SetupPage.tsx → POST /api/setup/exchange → Store.exchangeBootstrap → registration/options·verify → WebAuthnService.register → Store.registerCredential |
| 추가 등록 | RegistrationForm.tsx·useCeremony.ts → POST /api/auth/registration/options·verify → 세션·Origin·RP ID·질문·UV 검증 → credential 저장 |
| 로그인 | LoginPage.tsx·useCeremony.ts → POST /api/auth/authentication/options·verify → WebAuthnService.authenticate → Store.completeLogin → HttpOnly 쿠키 |
| 로그아웃 | shared/session.tsx → POST /api/auth/logout → Store.logout → 쿠키·등록 질문·클라이언트 자료 정리 |
| 비공개 조회 | VaultPage.tsx → GET /api/private/items[/:id] → private-data/service.ts → requireSession → Store.items/item의 소유권 제한 |
| 삭제 | PasskeysPage.tsx → DELETE /api/passkeys/:id → Store.deleteCredential → 소유권·마지막 키 검사 → 해당 키의 세션 폐기 |

실제 파일: [API](../src/server/app.ts), [WebAuthn 검증](../src/server/auth/webauthn.ts), [저장·질문·세션·소유권](../src/server/storage/store.ts), [접근 제한](../src/server/authorization/access.ts), [자료 조회](../src/server/private-data/service.ts).
화면 파일은 `src/client/passkeys/`, `src/client/private-space/`, `src/client/shared/`에 있습니다.
초기 링크는 [서버 관리 CLI](../src/server/auth/bootstrap-cli.ts)가 생성하며 공개 발급 API는 없습니다.

## ④ 안 열리는 것을 확인한 기록

| 확인 | 성공 요청 | 거절 요청 | 공개 증거 |
| --- | --- | --- | --- |
| 로그인 없이 열기 | 로그인한 본인 자료 200 | 미인증 자료 요청 401 | [계정 격리](../evidence/authorization/verified-isolation.json), [미인증 HTML](../evidence/authorization/anonymous-page.html) |
| 남의 패스키로 열기 | A·B가 자기 자료 200 | A→B·B→A 모두 403, 자료 건수 동일 | [계정 격리](../evidence/authorization/verified-isolation.json) |
| 이미 쓴 질문 재사용 | 새로운 질문·서명으로 200 | 이미 소비한 질문·응답으로 400 | [인증](../evidence/authentication/verified-authentication.json) |
| 패스키 삭제 뒤 로그인 | 남은 패스키로 200 | 삭제된 패스키로 400 | [폐기](../evidence/passkey-lifecycle/verified-revocation.json) |

추가로 잘못된 서명 400, 외부 Origin 403, 로그아웃 이전 세션의 재사용 401, 요청의 계정값을 바꿔도 본인 자료만 반환하는 것을 확인합니다.
세션은 암호학적 난수 토큰의 해시를 서버에 보관하며 쿠키 원문을 로그·제출물에 넣지 않습니다. 운영 쿠키는 Secure·HttpOnly·SameSite=Strict·Path=/와 __Host- 접두사를 사용합니다.
[전체 검증 결과와 실제 기기 검증의 한계](verification-results.md)를 함께 읽어야 합니다.

## ⑤ AI와 나

- AI에게 맡긴 일: 스택 선정 근거 정리, 기존 소개 보존, 인증·자료 격리·U1–U6 구현, 테스트·증거·문서 작성.
- 내가 직접 판단한 일: 사용자가 필수 요구사항과 U1–U6 및 기본 설계 정책을 승인하고 과제1 원본 저장소를 지정함. 그 외 판단은 사용자 최종 보완 필요.
- AI 제안을 따르지 않은 일 또는 없었던 이유: 사용자 작성 필요. AI가 사용자의 판단을 만들어 넣지 않습니다.

## ⑥ 아직 못 막은 것

1. 모든 패스키·제공자 계정에 접근할 수 없을 때 복구할 독립적인 수단이 없습니다. 마지막 키 삭제 차단으로 기기 분실까지 해결하지는 못합니다.
2. SQLite·PostgreSQL의 공개키·자료는 애플리케이션 수준에서 암호화하지 않습니다. 호스트의 관리자·백업 접근까지 막는 설계가 아니므로 가상 자료만 사용합니다.
3. 요청 횟수 제한은 단일 프로세스 메모리입니다. 다중 인스턴스·서버 재시작을 가로지르는 공격 제한에는 공유 저장소가 필요합니다.
4. 소유자의 기기·브라우저 자체가 장악되거나 서버 관리 권한이 유출된 상황까지 방어하지는 못합니다.

실제 HTTPS 운영의 성공·거절 요청과 저장 공개키는 [운영 검증 기록](../evidence/deployment/https-verification.json)에 있습니다. 물리 기기·저장 제공자·백업 복원은 검증하지 않았습니다.

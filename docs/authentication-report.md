# 인증 구현 설명서

결과물: https://project-apprenticeship-08.vercel.app\
소스: https://github.com/jkimsvsd-code/project-apprenticeship-08\
최종 운영 검증: 2026-10-28T06:26:33.371Z (UTC, 한국 시각은 +09:00). 배포 코드 `15acf07168f73803044da11683d97b75f597e8f1`, 배포 ID `dpl_2mAULuZkFqLuvWXEvZE8om7oJuAE`.

실제 HTTPS와 영속 PostgreSQL에서 실행한 기록입니다. 자동 인증기는 Chromium CDP 소프트웨어 인증기이고, 물리 기기·Google/iCloud 저장 제공자 확인은 별도입니다. [최종 점검표](final-audit.md).

## ① 무엇으로 붙였나

**라이브러리 방식**으로 SimpleWebAuthn server 14.0.3 / browser 14.0.0을 사용했습니다. 서명 검증을 직접 만들거나 항상 통과하는 모의 검증기를 쓰지 않았습니다. React·TypeScript·Vite, Express·Node.js 24, 로컬 SQLite / 배포 Neon PostgreSQL을 사용합니다. Vercel은 호스팅이며 Neon은 저장소입니다. Supabase Auth·Neon Auth 같은 별도 인증 서비스는 사용하지 않습니다.

서버는 credential ID·COSE 공개키·서명 카운터·소유자·이름·등록일·사용자 메모를 저장합니다. 다음은 이번 HTTPS 검증에서 DB에 저장하고 읽은 가상 계정 공개키 한 개입니다.

```text
pQECAyYgASFYIFF3329w+1Y38GDNChpLBypNSQwudPoT2g5F6NbrPSmFIlggmQv36Xlc68g0vundKHy13h6Ll7lfuDk+u/rHu1JUXEI=
```

이 Base64 값은 **서명 확인에 쓰는 공개키를 인코딩한 값이며 비밀번호가 아닙니다.** 개인키와 지문·얼굴 정보는 서비스 서버에 전송·저장하지 않습니다. 등록 요청 본문의 전체 구조는 [운영 JSON](../evidence/deployment/https-verification.json)의 `records[2].request`, 저장 값은 `storedPublicKeys`에서 확인합니다. 개인키가 없다는 검사도 수행합니다.

자동 검증의 저장 위치는 **A 계정의 독립된 Chrome CDP 소프트웨어 인증기 2개와 B 계정의 별도 인증기 1개**입니다. 검증 종료 시 브라우저와 테스트 계정을 정리했습니다. 사용자는 첫 키를 ‘iPhone 자체’에 저장했다고 보고했습니다. 실제 저장 제공자가 iCloud·Google 중 무엇인지는 서비스가 확인할 수 없으며 미확인입니다(C26). ‘저장소 메모’는 사용자가 적는 기록이고 실제 저장소 선택 설정이나 제공자 증명이 아닙니다.


### 실제 등록 방식 선택

‘패스키 등록 방식’은 저장소 메모와 다릅니다. 선택값은 서버가 발급하는 실제 WebAuthn 옵션에 적용됩니다.

| 방식 | 브라우저 요청 |
| --- | --- |
| 이 기기의 저장소 | platform + client-device |
| 다른 기기(QR) | cross-platform + hybrid |
| USB·NFC 보안 키 | cross-platform + security-key |
| 브라우저에서 선택 | 제공자/기기 선택을 브라우저 기본 동작에 맡김 |

Google·iCloud 같은 회사별 저장소를 지정하는 WebAuthn API는 없습니다. 최종 제공자는 지원 브라우저·OS의 인증 창에서 사용자가 선택하며, hints는 경로를 제안하는 값입니다. 기존 키 제외·사용자 확인(UV)·실제 서명 검증은 유지합니다.

사용자는 첫 키를 ‘iPhone 자체’에 저장했다고 알려주었습니다. 실제 제공자가 iCloud인지 다른 관리자인지 확인된 것은 아닙니다. iPhone에서 Google에 별도 키를 추가하려면 iOS 17 이상과 Chrome의 Google 계정/자동완성 제공자 설정을 준비하고, 그 브라우저에서 기존 키로 로그인한 뒤 ‘이 기기의 저장소’로 추가합니다. 인증 창에 Google 제공자가 보이는지와 최종 저장된 사이트 항목을 직접 확인해야 합니다. 기존 키는 삭제하지 않습니다.

근거: [Google의 iOS·macOS 지원 환경](https://developers.google.com/identity/passkeys/supported-environments), [WebAuthn hints](https://www.w3.org/TR/webauthn-3/#enum-hints), [SimpleWebAuthn 등록 옵션](https://simplewebauthn.dev/docs/packages/server).

## ② 왜 그걸 골랐나

검증된 WebAuthn 라이브러리로 질문·Origin·RP ID·서명·사용자 확인(UV)을 검사하면서 계정 격리·질문의 일회성·세션 폐기·삭제를 소스와 DB로 추적하기 위해 선택했습니다.
로컬은 Node.js 내장 SQLite로 재현하고, Vercel 운영은 Neon PostgreSQL로 여러 함수가 같은 공개키·질문·세션을 공유합니다. DB 질의는 파라미터를 바인딩하고, TLS 인증서를 확인하는 pg Pool과 Vercel attachDatabasePool을 사용합니다.
PostgreSQL의 원자적 DELETE RETURNING으로 질문을 한 번만 소비하고, 사용자별 트랜잭션 잠금과 재검사로 로그인 완료·키 삭제·마지막 키 동시 삭제를 처리합니다. [DB 동시성 증거](../evidence/deployment/postgres-check.json), [스택 근거](stack.md).

## ③ 어디를 어떻게 고쳤나

| 흐름 | 화면 → API → 검증·저장 |
| --- | --- |
| 공개 진입 | [ProfilePage](../src/client/public-profile/ProfilePage.tsx)의 관리자 버튼 → 미로그인 `/login?next=%2Fvault`, 로그인 상태 `/vault` |
| 첫 등록 | [SetupPage](../src/client/passkeys/SetupPage.tsx) → POST `/api/setup/exchange` → `exchangeBootstrap` → 일회 등록 준비 쿠키 |
| 등록·추가 | [RegistrationForm](../src/client/passkeys/RegistrationForm.tsx)·[useCeremony](../src/client/passkeys/useCeremony.ts) → POST `/api/auth/registration/options`, `/verify` → `WebAuthnService.register` → `registerCredential` |
| 로그인 | [LoginPage](../src/client/passkeys/LoginPage.tsx) → POST `/api/auth/authentication/options`, `/verify` → `WebAuthnService.authenticate` → `completeLogin` → 서버 세션 → 허용된 목적지 |
| 로그아웃 | [session](../src/client/shared/session.tsx) → POST `/api/auth/logout` → `logout` → 서버 세션·질문 폐기와 쿠키 제거·개인 UI 비우기 |
| 비공개 조회 | [VaultPage](../src/client/private-space/VaultPage.tsx) → GET `/api/private/items[/:id]` → [private-data/service](../src/server/private-data/service.ts) → [requireSession](../src/server/authorization/access.ts) → `items/item`의 소유권 제한 |
| 패스키 삭제 | [PasskeysPage](../src/client/passkeys/PasskeysPage.tsx) → DELETE `/api/passkeys/:id` → `deleteCredential` → 본인·마지막 키 검사 → 해당 키의 세션 연쇄 폐기 |

실제 공통 [API](../src/server/app.ts), [WebAuthn 검증](../src/server/auth/webauthn.ts), 운영 [PostgresStore](../src/server/storage/postgres.ts), 로컬 [Store](../src/server/storage/store.ts)를 확인할 수 있습니다. 운영 진입점은 `server.mjs` → [src/server/vercel.ts](../src/server/vercel.ts)입니다.

초기 소유자 링크는 [운영 관리 CLI](../scripts/bootstrap-postgres.ts) 또는 [로컬 CLI](../src/server/auth/bootstrap-cli.ts)에서만 발급합니다. 15분·일회 교환이며 등록 완료 전에는 계정·키·자료를 확정하지 않습니다. 취소한 임시 등록 준비의 해시는 만료 관리합니다. 공개 회원가입·초기 링크 발급 API는 없습니다.

질문은 기본 300초, 세션은 3600초입니다. 운영은 Origin `https://project-apprenticeship-08.vercel.app`, RP ID `project-apprenticeship-08.vercel.app`로 고정하고 UV를 요구합니다. 세션·초기 링크·등록 준비 값은 해시만 DB에 저장합니다. 쿠키는 `__Host-`·Secure·HttpOnly·SameSite=Strict·Path=/입니다. 세션 토큰의 해시로 서버에서 사용자를 식별하며 요청의 userId를 권한 근거로 사용하지 않습니다.

## ④ 안 열리는 것을 확인한 기록

아래 인덱스는 [이번 운영 JSON의 records](../evidence/deployment/https-verification.json)에 대응합니다. 각 기록에 실제 메서드·경로·공개 가능한 요청·응답 본문이 있습니다. 쿠키·세션·토큰·개인키 원문은 제외했습니다. A·B는 실제 운영 서버에 각각 패스키를 등록한 **가상 검증 계정**입니다.

| 필수 확인 | 성공한 요청·응답 | 거절된 요청·응답 |
| --- | --- | --- |
| 로그인 없이 자료 열기 | A의 GET `/api/private/items` → 200, 본인 3개 (`records[7]`) | 같은 목록의 미인증 GET → 401 `AUTH_REQUIRED` (`records[0]`) |
| 남의 패스키로 자료 열기 | A·B가 각자 본인 목록 GET → 200 (`records[7–8]`) | A→B 항목 GET·B→A 항목 GET → 각각 403 `FORBIDDEN` (`records[9–10]`) |
| 사용한 질문 재사용 | 새 질문·유효 서명 POST `/api/auth/authentication/verify` → 200 (`records[14]`) | 같은 본문 재전송 → 400 `INVALID_CEREMONY` (`records[15]`) |
| 패스키 삭제 뒤 로그인 | 남은 키의 POST `/api/auth/authentication/verify` → 200 (`records[28]`) | 삭제한 키의 같은 인증 API → 400 `INVALID_CEREMONY` (`records[26]`) |

등록 질문의 서로 다른 실제 값(C20):

```text
첫 등록: BouSDuceDYxBIW48D3hy1htISg4qmfVm3Dcfpa1Eys8
추가 등록: GIpH8RfJE8j_MkQiDSe6huo_J99Fjk-WlHPU-Y6Jv8g
```

로그인 질문의 서로 다른 실제 값(C28):

```text
첫 로그인: Ito-GBgZeyKMDSOS1Bq5HjvcGWvbRSs-rC4pa2C-X74
다음 로그인: VHyOOaA56XZULnDG50osxlBysYfmep8DDvets3Gu-bk
```

추가 거절·변조 검사:

- 유효 서명 200과 서명 마지막 바이트를 변조한 인증 400을 비교했습니다 (`records[14]`, `records[19]`).
- 로그아웃한 이전 쿠키로 같은 자료 GET을 재요청하면 401입니다 (`records[12]` 등). 원본 쿠키는 검사 중 메모리에서만 사용하고 공개하지 않습니다.
- GET `/api/private/items?userId=B`로 바꿔도 A의 세션 자료만 반환합니다 (`records[11]`). A↔B 거절 전후 각 자료 수는 3·3으로 같습니다 (`accountCounts`).
- 외부 Origin의 로그아웃은 403 (`records[16]`), 마지막 키 삭제는 409 (`records[23]`)입니다.
- 두 키 목록·예비 키 삭제·삭제 키 거절·잔여 키 성공을 검증했고, 실행 후 테스트 계정·키·자료만 삭제했습니다. 실제 소유자 키·자료는 수정하지 않았습니다.

[로컬 취소·시간 초과](../evidence/registration/cancellation.json), [저장소 메모 회귀](../evidence/ux/verified-storage-memo.json), [운영 U1–U6](../evidence/deployment/ux-verification.json)도 함께 확인할 수 있습니다. 시간 초과와 미지원 환경의 UI 분기는 검증기에서 브라우저 시계·지원 플래그를 제어해 확인하며 실제 장치 고장을 재현했다고 주장하지 않습니다.

## ⑤ AI와 나

AI에게 맡긴 일: 스택 비교, 과제1 소개 보존, 패스키·세션·자료 격리·U1–U6 구현, 테스트·배포·공개 검증 기록과 문서 정리.\
내가 직접 판단한 일: 필수 요구사항·U1–U6과 기본 정책 승인, 과제1 원본 지정, GitHub public·HTTPS 공개, 관리자 전용 버튼과 로그인 후 자료 진입 방식 결정.\
AI 제안을 따르지 않은 일: 저장 위치가 실제 선택 설정처럼 보이던 초안을 기록용 메모로 바꾸도록 요청했고, 개인 공간 홍보·메뉴 대신 관리자 전용 버튼만 남기도록 수정 요청함.

사용자의 실제 판단을 추정해 추가하지 않고 대화에서 확인한 승인·수정 지시를 기록했습니다.

## ⑥ 아직 못 막은 것

1. 모든 패스키나 저장 제공자 계정에 접근할 수 없으면 자동 복구할 수 없습니다. 마지막 키 삭제 차단은 기기 분실·제공자 계정 상실을 해결하지 않습니다.
2. ‘저장소 메모’와 서버의 deviceType/backedUp 정보만으로 실제 Google·iCloud 저장 위치, 동기화 계정·백업 복구를 보증하지 않습니다. 실제 제공자 확인(C26)은 별도 필요합니다.
3. 공개키·가상 자료를 애플리케이션 수준에서 암호화하지 않으며 서버/DB 관리자·백업 접근을 막지 못합니다. 운영 Neon의 실제 백업 복원 훈련도 하지 않았습니다.
4. 요청 제한은 함수 프로세스 메모리의 15분·60회로, 다중 인스턴스를 가로지르는 전역 제한은 보장하지 않습니다. 자동 검증의 연속 실행도 제한될 수 있습니다.
5. 사용자 기기·브라우저나 서버 관리 권한이 장악된 경우를 방어하지 못합니다. Safari·Firefox·모바일 실기기·스크린리더와 실제 기기 2개의 분실 대비 검증은 완료했다고 쓰지 않았습니다.

필수 항목의 구현·자동 증거와 미확인 항목은 [최종 점검](final-audit.md)에 구분합니다. 과제 제출 시스템에 URL을 입력하는 최종 제출은 사용자가 진행합니다.

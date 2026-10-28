# 요구사항 추적표

상태: 로컬 구현·자동 검증을 진행했습니다. HTTPS 결과물·public 소스 URL 및 실제 기기 확인은 아직 남아 있습니다. 아래에 구현·증거 위치를 연결합니다.
기준: 첨부된 과제8 PDF의 통과 기준. 원본 PDF는 저장소에 복사하지 않았습니다.
문서에 없는 C04–C09는 임의로 만들지 않습니다. 명시된 기준은 총 47개입니다.

## 공개·제출

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C01 | 결과물 HTTPS URL 1개 제출 | docs/submission.md |
| T08-C02 | 소스 HTTPS URL 1개 제출 | docs/submission.md |
| T08-C03 | 두 URL이 새 시크릿 창에서 가입·인증·초대·CAPTCHA 없이 열림 | docs/public-release.md |
| T08-C10 | 결과물 첫 화면이 등록 없이 보는 공개 소개 페이지 | src/client/public-profile/ProfilePage.tsx, content.html |
| T08-C11 | 과제1 소개 페이지를 이어받고 기존 공개 내용을 유지 | src/client/public-profile/ProfilePage.tsx, content.html |
| T08-C12 | 실제 개인정보를 제외하고 가상 데이터임을 명시 | README.md, tests/fixtures/ |

## 카드1 · 공개·비공개 분리

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C13 | 공개·비공개 영역의 경계가 화면에서 구분됨 | src/client/public-profile/ProfilePage.tsx, content.html, src/client/private-space/VaultPage.tsx |
| T08-C14 | 비공개 항목 3개 이상 | src/server/storage/store.ts (첫 등록 시 가상 자료 3개 생성) |
| T08-C15 | 미인증 상태에서 비공개 내용이 보이지 않음 | src/client/private-space/VaultPage.tsx, tests/e2e/ |
| T08-C16 | 미인증 직접 자료 요청 거절 | src/server/authorization/access.ts, src/server/storage/store.ts, tests/integration/ |
| T08-C17 | 거절 상태가 401 또는 403 | evidence/authorization/ |
| T08-C18 | 미인증 페이지 소스·응답에 비공개 내용 없음 | tests/e2e/, evidence/authorization/ |

## 카드2 · 등록

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C19 | 서버가 등록 질문을 발급하고 검증까지 보관 | src/server/auth/webauthn.ts |
| T08-C20 | 등록 요청마다 질문이 다른 기록 | evidence/registration/ |
| T08-C21 | 검증 완료 후 공개키 저장 | src/server/auth/webauthn.ts, src/server/storage/store.ts |
| T08-C22 | 저장한 공개키 값과 비밀번호가 아니라는 설명 | evidence/registration/, docs/authentication-report.md |
| T08-C23 | 등록 요청 본문에 개인키가 없다는 기록 | evidence/registration/ |
| T08-C24 | 알아볼 수 있는 패스키 이름 | src/client/passkeys/ |
| T08-C25 | 취소 안내, 등록 결과를 저장하지 않음 | src/client/passkeys/, src/server/auth/webauthn.ts |
| T08-C26 | 실제 패스키 저장 위치 기록 | docs/authentication-report.md |

## 카드3 · 로그인·로그아웃

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C27 | 서버가 매번 새 로그인 질문 발급 | src/server/auth/webauthn.ts |
| T08-C28 | 로그인 요청마다 질문이 다른 기록 | evidence/authentication/ |
| T08-C29 | 저장한 공개키로 서명 검증 후에만 통과 | src/server/auth/webauthn.ts |
| T08-C30 | 서명 검증 성공·실패 요청을 나란히 기록 | evidence/authentication/ |
| T08-C31 | 사용한 질문 재전송과 거절 응답 기록 | evidence/authentication/ |
| T08-C32 | 로그인 이후 사용자 식별 방식 설명 | docs/authentication-report.md |
| T08-C33 | 로그아웃 이전 인증값의 재사용 거절 기록 | evidence/authentication/ |
| T08-C34 | 공개 기록의 세션·토큰 마스킹 | evidence/README.md |
| T08-C35 | 비밀번호 입력란 없음 | src/client/, tests/e2e/ |

## 카드5의 계정 격리 검증

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C36 | 패스키를 등록한 두 계정에 서로 다른 비공개 자료 | tests/fixtures/, tests/integration/ |
| T08-C37 | A의 패스키로 로그인 후 B 자료 접근 거절 | evidence/authorization/ |
| T08-C38 | B에서 A로의 접근도 거절 | evidence/authorization/ |
| T08-C39 | 거절 전후 상대 자료 건수가 동일 | evidence/authorization/ |
| T08-C40 | 요청의 계정값을 바꿔도 본인 목록만 반환 | src/server/authorization/access.ts, src/server/storage/store.ts, evidence/authorization/ |
| T08-C41 | 거절을 수행하는 실제 소스 위치 명시 | docs/authentication-report.md |

## 카드4 · 분실·삭제

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C42 | 한 계정에 서로 다른 패스키 2개 등록 | src/server/storage/store.ts, evidence/passkey-lifecycle/ |
| T08-C43 | 목록에 이름과 등록일 표시 | src/client/passkeys/ |
| T08-C44 | 하나를 삭제한 후 남은 것으로 로그인 | evidence/passkey-lifecycle/ |
| T08-C45 | 삭제한 패스키의 로그인 거절 기록 | evidence/passkey-lifecycle/ |
| T08-C46 | 패스키가 0개이거나 모두 접근 불가할 때의 동작 설명 | docs/architecture.md, src/client/passkeys/ |

## 카드5 · 설명서와 확인 방법

| 기준 | 완료 조건 | 관련 위치 |
| --- | --- | --- |
| T08-C47 | 설명서 6개 항목을 각각 구분 | docs/authentication-report.md |
| T08-C48 | 직접 구현·라이브러리·서비스의 종류와 이름 명시 | docs/authentication-report.md |
| T08-C49 | 등록·로그인·로그아웃·비공개 조회의 소스 흐름 명시 | docs/authentication-report.md |
| T08-C50 | 필수 4가지 검증에 성공·거절 요청을 나란히 기록 | docs/verification-plan.md, evidence/ |
| T08-C51 | 실제 미해결 한계를 최소 1개 구체적으로 작성 | docs/authentication-report.md |
| T08-C52 | 확인 방법을 지정된 4줄로 작성 | docs/submission.md |
| T08-C53 | AI와 내 판단을 지정된 3항목으로 작성 | docs/submission.md |

## 승인된 추가 범위

U1–U6은 [UX 체크리스트](ux.md)에 정의합니다. U7–U9는 이번 범위에 포함하지 않습니다.
구현 소스와 자동 검증 결과는 아래 매핑 및 verification-results.md에서 확인합니다. 과제의 최종 통과를 의미하지 않습니다.

## 최종 확인 대기 항목

- C01–C03: 과제8 HTTPS 결과물·public 소스 게시와 시크릿 창 검증.
- C26: 가상 인증기 저장 위치는 기록했으며 실제 기기·제공자 위치는 사용자가 확인해야 함.
- C42–C45: 별도 가상 credential 2개로 자동 검증함. 실제 기기·제공자로도 직접 확인 필요.
- C53: AI에게 맡긴 일과 확인된 사용자 결정은 기록했으나 AI 제안을 따르지 않은 일·이유는 사용자 보완 필요.

| 범위 | 실제 소스·자동 검증 |
| --- | --- |
| C10–C18 | src/client/public-profile/, src/client/private-space/VaultPage.tsx, src/server/private-data/service.ts, tests/unit/policies.test.ts, evidence/authorization/verified-isolation.json |
| C19–C26 | src/server/auth/webauthn.ts, src/server/storage/store.ts, src/client/passkeys/RegistrationForm.tsx, evidence/registration/ |
| C27–C35 | src/server/auth/webauthn.ts, src/server/app.ts, src/client/shared/session.tsx, evidence/authentication/ |
| C36–C41 | src/server/private-data/service.ts, Store.items/item, tests/integration/api.test.ts, evidence/authorization/ |
| C42–C46 | Store.deleteCredential, src/client/passkeys/PasskeysPage.tsx, evidence/passkey-lifecycle/ |
| C47–C53 | docs/authentication-report.md, docs/submission.md |

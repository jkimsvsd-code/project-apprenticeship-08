# 공개 검증 증거

Chromium 가상 인증기의 실제 WebAuthn 검증에서 생성한 공개용 JSON·화면을 보관합니다. 쿠키·세션·초기 토큰·가상 인증기의 개인키는 저장하지 않습니다. 실제 기기 검증 기록이 아닙니다. JSON의 sourceDigest는 src·tests·package-lock.json을 정렬해 해시한 값이며 커밋 SHA가 아닙니다.

| 디렉터리 | 보관할 공개 증거 |
| --- | --- |
| registration/ | 서로 다른 등록 질문, 마스킹한 등록 본문·응답, 공개키, 패스키 목록·저장 위치 |
| authentication/ | 로그인 질문 비교, 정상·변조 서명, 질문 재사용, 로그아웃 이전 인증값 재사용 |
| authorization/ | 미인증 접근, A↔B 접근, 계정값 변조, 자료 건수 전후 비교, 미인증 응답 본문 |
| passkey-lifecycle/ | 패스키 2개 목록, 하나 삭제, 남은 것의 성공·삭제한 것의 실패, 마지막 삭제 차단 |
| ux/ | U1–U6의 화면·기기·키보드·오류 동선 확인 |

## 작성 형식

각 증거 문서에 다음을 적습니다.

1. 기준 번호, 실행 시각·환경·커밋, 가상 계정 역할.
2. 사전 조건과 기대 결과.
3. 성공 요청의 메서드·경로·공개 가능한 본문, 응답 상태·본문.
4. 대응하는 거절 요청과 응답을 같은 문서에 나란히 기록.
5. 실제 결과, 자료 건수 등 추가 확인, 관련 실제 소스 링크.

## 공개 기준

- 원본이 필요하면 로컬 `evidence/raw/`에서만 다룹니다. 이 경로는 Git에서 제외합니다.
- `Cookie`, `Set-Cookie`, `Authorization`, 세션·토큰 값은 `[REDACTED]`로 치환합니다.
- 실제 개인정보, 개인키, 생체정보, 등록용 초기 설정 비밀값은 기록하거나 공개하지 않습니다.
- credential ID와 사용자 식별자는 필요 시 일관된 가명으로 치환하고 치환 사실을 표시합니다.
- 과제에서 요구한 공개키·질문 비교는 가상 검증 계정의 기록으로 남깁니다. 인증 중인 원본 값을 실시간 공개하지 않습니다.
- 스크린샷의 계정명·알림·주소창·개발자 도구도 직접 확인합니다.
- 가공한 증거는 Markdown·마스킹한 JSON·이미지로 보관하고, 원본 HAR는 커밋하지 않습니다.

`.gitignore`는 내용 마스킹을 대신하지 않습니다. 커밋할 사본의 본문을 직접 확인합니다.

## 생성 파일

- registration/verified-registration.json: 등록 요청·응답, 서로 다른 질문, 저장 공개키.
- registration/cancellation.json: 취소·중복 방지·시간 초과·새 질문 비교.
- authentication/verified-authentication.json: 성공·서명 실패·재사용·로그아웃 후 거절.
- authorization/verified-isolation.json, anonymous-page.html: 본인 성공·미인증/타인 거절·건수·변조·미인증 HTML.
- passkey-lifecycle/verified-revocation.json, two-passkeys.png: 두 키·삭제·잔여 키 검증.
- ux/verified-ux.json 및 PNG: U1–U6 자동 확인과 화면.

E2E를 실행하면 같은 경로를 새 실행 기록으로 덮어씁니다. 실행에 실패한 경우 일부 이전 기록이 남을 수 있으므로 executedAt·sourceDigest와 최근 전체 테스트 결과를 함께 확인합니다.

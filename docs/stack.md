# 기술 스택 선정

## 선택

| 역할 | 선택 | 과제에 적합한 이유 |
| --- | --- | --- |
| 런타임 | Node.js 24 | Web Crypto와 내장 SQLite를 사용하고 추가 네이티브 DB 드라이버 설치를 줄임 |
| 언어 | TypeScript | 요청·응답·세션·credential의 계약을 명시 |
| 화면 | React + Vite | 승인된 client 폴더를 유지하고 상태·접근성·작은 화면을 컴포넌트로 관리 |
| HTTP 서버 | Express 5 | 등록·로그인·로그아웃·자료 조회를 직접 추적하고 요청·응답 증거를 확보 |
| 패스키 | SimpleWebAuthn server/browser 14 | 직접 암호 프로토콜을 작성하지 않고 질문·Origin·RP ID·UV·서명을 검증 |
| 저장 | SQLite + node:sqlite | 공개키·질문·세션·가상 자료를 트랜잭션으로 관리하고 로컬 재현 |
| 입력·헤더 | Zod, Helmet, express-rate-limit | 입력 경계, CSP·쿠키 정책, 단일 프로세스의 요청 횟수 제한 |
| 검증 | Node test + Playwright + axe-core | 서버 규칙, 실제 HTTP, 가상 인증기의 실제 서명, 모바일·접근성을 확인 |

각 패키지는 package.json과 package-lock.json에 정확한 버전으로 고정합니다.

## 대안과 결정

Next.js나 인증 서비스를 사용해도 구현할 수 있으나, 이 과제에서는 인증 흐름·공개키·질문·폐기 상태를 직접 설명하고 검증하는 일이 중요합니다.
기존 client/server 구조에 React·Express를 대응시켜 역할을 유지하고, 외부 계정이나 유료 서비스 없이 로컬에서 재현하도록 선택했습니다.
서명 검증은 라이브러리에 맡기고, 서버 저장형 세션·소유권·초기 등록 제한은 작은 앱 경계 안에서 구현합니다.
OAuth, 이메일 로그인, 비밀번호·복구 코드는 이번 승인 범위에 포함하지 않습니다.

## 운영 조건

SQLite 파일을 보존하는 단일 Node 프로세스와 영속 디스크가 필요합니다. 쓰기를 동기적으로 처리하므로 대규모 트래픽에 적합한 설계는 아닙니다.
서버리스의 임시 파일시스템이나 여러 인스턴스에 이 DB 파일을 그대로 배치하면 안 됩니다. 그런 배포는 공유 DB·공유 요청 제한 저장소로의 변경이 필요합니다.
Dockerfile은 같은 단일 서버 형태를 위한 배포 준비 파일이며 실제 Docker 빌드·클라우드 배포는 별도로 검증해야 합니다.

## 공식 근거

- [SimpleWebAuthn 서버](https://simplewebauthn.dev/docs/packages/server) / [브라우저](https://simplewebauthn.dev/docs/packages/browser)
- [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/)
- [FIDO 패스키](https://fidoalliance.org/passkeys/)
- [Node.js SQLite](https://nodejs.org/api/sqlite.html)

# GitHub public 공개와 배포 점검

GitHub public 게시·Vercel HTTPS 배포·Neon 영속 DB 연결과 운영 WebAuthn 자동 검증을 완료했습니다. 과제 최종 제출은 진행하지 않았습니다.

- 결과물: https://project-apprenticeship-08.vercel.app
- 소스: https://github.com/jkimsvsd-code/project-apprenticeship-08
- 운영 코드: 2deaa632decc68309bd5d4d656f97da50db49de3
- 운영 증거: [HTTPS 요청·응답](../evidence/deployment/https-verification.json), [검증 결과](verification-results.md).

## 완료한 점검

- [x] 지정한 과제1 소개 본문·스타일을 보존하고 출처·blob SHA를 기록했다.
- [x] 개인 공간과 테스트 계정에는 가상 데이터만 사용했다.
- [x] Node.js 24, 패키지 명세·lockfile, 예시 환경변수, 설치·실행·검증 명령을 추가했다.
- [x] 환경변수·운영 DB·세션·비밀키·원본 인증 로그를 Git과 배포 입력에서 제외했다.
- [x] 실제 WebAuthn 검증·서버 소유권·세션 폐기와 U1–U6을 구현하고 자동 검사했다.
- [x] public 저장소의 설명과 홈페이지 URL을 설정하고 인증 없는 소스 접속을 확인했다.
- [x] GitHub Actions의 형 검사·서버 테스트·빌드·운영 진입점·브라우저 테스트 원격 실행을 확인했다.
- [x] 고정 HTTPS Origin/RP ID와 Secure 쿠키를 실제 운영에서 확인했다.
- [x] 새 브라우저 컨텍스트에서 공개 소개·JS·CSS 200, 미인증 비공개 API 401을 확인했다.
- [x] 운영 A·B 계정으로 등록·로그인·자료 격리·키 삭제 후 로그인과 각 거절 응답을 기록했다.
- [x] 영속 Neon PostgreSQL을 사용하고 생성한 테스트 계정만 정리했다.

## 배포 방식

실제 운영은 Vercel Express + Neon PostgreSQL입니다. [설정과 재배포](hosting.md)를 참고하세요.
로컬 `npm run dev`와 단일 서버 `npm start`는 SQLite를 사용합니다. SQLite를 서버리스 임시 디스크에 배치하지 않습니다.
CLI 배포 전 `npm run vercel-build`로 public/ 생성물을 준비해야 CDN에 JS·CSS가 함께 업로드됩니다.

Dockerfile은 단일 서버 SQLite 운영을 위한 별도 선택지입니다. Docker 빌드는 실행하지 않았습니다.
그 경우 HTTPS 종료 프록시와 `/app/runtime` 영속 볼륨, 고정 APP_ORIGIN·WEBAUTHN_RP_ID가 필요합니다.
관리 명령의 초기 등록 링크는 공개 빌드 로그·이슈·스크린샷에 남기지 않습니다.

## 남은 사용자 확인

- [x] 사용자가 등록·삭제·잔여 키 로그인·재등록 완료를 보고했고 운영 DB의 두 키를 확인했다.
- [ ] 실제 저장 제공자 종류와 독립적인 복구 가능성, 삭제 키 재로그인 거절을 확인한다.
- [ ] 실제 모바일·Safari·Firefox·스크린리더를 확인한다.
- [ ] Neon 백업·복구 범위와 복원 훈련을 확인한다.
- [ ] 재사용 허용을 원한다면 LICENSE와 기존 자산의 이용 범위를 결정한다. 현재 라이선스는 지정하지 않았다.
- [ ] Private vulnerability reporting을 사용할지 결정한다.
- [ ] 설명서의 사용자 판단 부분을 보완한 후 과제를 제출한다.

`.gitignore`는 이미 커밋한 비밀값을 제거하지 않습니다. 공개 증거에는 쿠키·세션·토큰·개인키 원문을 포함하지 않습니다.

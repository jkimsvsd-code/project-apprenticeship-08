# GitHub public 공개와 배포 점검

현재 로컬 구현과 검증 단계입니다. GitHub 생성·push·클라우드 배포·과제 제출은 수행하지 않았습니다.

## 완료한 준비

- [x] 사용자가 지정한 과제1 소개 본문·스타일을 보존하고 출처·blob SHA를 기록했다.
- [x] 개인 공간에는 가상 데이터만 사용하고 실제 개인정보를 넣지 않았다.
- [x] Node.js 24, 패키지 명세·lockfile, 예시 환경변수, 설치·실행·검증 명령을 추가했다.
- [x] 환경변수·운영 DB·세션·비밀키·원본 인증 로그를 Git과 Docker 빌드 입력에서 제외했다.
- [x] 실제 WebAuthn 검증·서버 소유권·세션 폐기와 U1–U6을 구현했다.
- [x] GitHub Actions에 형 검사·서버 테스트·빌드·브라우저 테스트를 정의했다. 원격 실행은 미확인이다.
- [x] 단일 서버용 Dockerfile을 추가했다. Docker 빌드는 미실행이다.

## 운영 방식

`npm run build`는 `dist/client/`와 `dist/server/`를 만듭니다.
`npm start`는 NODE_ENV=production을 설정하고 정적 클라이언트·API만 제공하며 Vite를 실행하지 않습니다.
운영은 `APP_ORIGIN=https://실제도메인`, `WEBAUTHN_RP_ID=실제도메인`, `PORT=3000`, 영속 `DATABASE_PATH`를 지정해야 합니다.
Origin에는 경로·끝 슬래시를 붙이지 않습니다. 이 앱은 RP ID와 Origin 호스트를 동일하게 제한합니다.
HTTPS는 호스팅의 TLS 종료 프록시에서 제공하고 Node HTTP 포트는 내부로 둡니다.
원본 DB 파일을 영속 볼륨에 유지해야 하며, 임시 디스크·다중 인스턴스에는 이 SQLite 설계를 그대로 사용하지 않습니다.

Docker를 사용할 경우 이미지 빌드 후 APP_ORIGIN을 실제 HTTPS 주소로 설정하고 `/app/runtime`에 영속 볼륨을 연결합니다.
컨테이너의 최초 등록 명령은 `node dist/server/server/auth/bootstrap-cli.js --account owner --name "가상 사용자"`입니다.
이 출력에는 초기 등록 링크가 있으므로 공개 빌드 로그·이슈·스크린샷에 남기지 않습니다.

## 아직 필요한 공개 확인

- [ ] 실제 기기 2개 또는 독립된 패스키 저장 위치로 등록·삭제·잔여 키 로그인을 확인한다.
- [ ] 고정된 운영 HTTPS Origin/RP ID, Secure 쿠키, 데이터 영속성·백업을 확인한다.
- [ ] GitHub 저장소를 만들고 커밋 대상과 전체 Git 이력의 비밀값을 검사한다.
- [ ] 저장소 LICENSE와 기존 자산의 이용 범위를 최종 확정한다.
- [ ] GitHub Private vulnerability reporting을 활성화한다.
- [ ] 실제 GitHub Actions 실행 결과를 확인한다.
- [ ] 새 시크릿 창에서 결과물 첫 화면과 public 소스가 인증 없이 열리는지 확인한다.
- [ ] 설명서의 사용자 판단, 결과물·소스 URL을 보완한 후 제출한다.

`.gitignore`는 이미 커밋한 비밀값이나 가공하지 않은 증거 본문을 제거하지 않습니다.

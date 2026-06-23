# 다른 컴퓨터에서 셋업하기 (클론 + clasp 로그인)

이 문서는 **다른 컴퓨터에서 이 저장소를 클론해 개발·배포를 이어가는** 방법을 정리한 것입니다.
저장소에는 소스와 설정(`.clasp.json`의 `scriptId` 포함)이 들어 있지만, **의존성(node_modules)과 clasp 로그인 정보는 들어 있지 않으므로** 새 PC에서 두 가지만 추가로 설정하면 됩니다.

---

## 0. 사전 준비 (한 번만)

새 PC에 아래가 설치되어 있어야 합니다.

| 도구 | 확인 명령 | 없으면 |
|------|-----------|--------|
| Git | `git --version` | https://git-scm.com 설치 |
| Node.js (npm 포함) | `node -v` / `npm -v` | https://nodejs.org (LTS) 설치 |
| clasp (Apps Script CLI) | `clasp --version` | `npm install -g @google/clasp` |

> clasp는 전역(`-g`) 설치가 편합니다. 권한 문제로 전역 설치가 안 되면 `npx clasp ...` 형태로도 사용할 수 있습니다.

---

## 1. 저장소 클론

```bash
git clone https://github.com/Kimjs99/baseball-scoreboard.git
cd baseball-scoreboard
```

---

## 2. 의존성 설치

```bash
npm install
```

`@babel/standalone`, `tailwindcss` 등 빌드에 필요한 패키지가 설치됩니다. (`node_modules/`는 저장소에 없으므로 필수)

---

## 3. clasp 로그인 ⚠️ 가장 중요

```bash
clasp login
```

- 브라우저가 열리면 **반드시 배포 계정 `jsmajs@gmail.com` 으로 로그인**하고 권한을 허용하세요.
- 로그인 정보는 홈 폴더의 `~/.clasprc.json`(Windows: `C:\Users\<사용자>\.clasprc.json`)에 저장되며, **저장소에는 올라가지 않습니다(보안).**
- **같은 계정으로 로그인해야** `.clasp.json`의 `scriptId`로 **동일한 Apps Script 프로젝트**에 연결되어:
  - `clasp push` / `clasp redeploy`가 동작하고
  - **공유 URL(현재 `@14`)과 기존 경기 기록(구글 시트)이 그대로 유지**됩니다.
- 다른 계정으로 로그인하면 그 계정의 **별도 프로젝트**로 가서 같은 앱·시트를 이어갈 수 없습니다.

> 로그인이 잘 됐는지 확인: `clasp list-deployments` 실행 시 배포 목록(`@HEAD`, `@14 ...`)이 보이면 정상입니다.

---

## 4. 빌드 → 푸시 → 배포

평소 작업 흐름은 다음과 같습니다.

```bash
npm run build                 # src/app.jsx + Tailwind → apps-script/Index.html 재생성 (편집 후 필수)
clasp push                    # apps-script/* 를 스크립트 프로젝트에 업로드
clasp redeploy 15qf7... 또는 배포ID -d "설명"   # 기존 공유 배포 갱신(URL 유지)
```

자주 쓰는 clasp 명령:

```bash
clasp list-deployments        # 배포 ID/버전 확인
clasp open-web-app <배포ID>    # 배포된 앱 브라우저로 열기
clasp open-script             # Apps Script 에디터 열기
clasp tail-logs               # 로그 보기
```

**공유(versioned) 배포 ID**
```
AKfycbwm3qR95v8sA6q6zMFzaLKOi78R1cldZNc__1V8eUkXG5-8s_0t_qVaeEaD5ZWV6WGm
```
갱신 예시:
```bash
clasp push
clasp redeploy AKfycbwm3qR95v8sA6q6zMFzaLKOi78R1cldZNc__1V8eUkXG5-8s_0t_qVaeEaD5ZWV6WGm -d "변경 설명"
```

---

## 5. 꼭 기억할 점

- **데이터는 PC가 아니라 구글 서버에 있습니다.** 경기 기록 시트와 그 ID(`RESULT_SPREADSHEET_ID`, Script Properties)는 Apps Script 프로젝트(=구글 계정)에 저장되므로, 어느 PC에서 작업하든 **같은 계정으로 로그인하면 데이터가 보존**됩니다.
- **편집 → 반드시 `npm run build` → `clasp push` → `clasp redeploy`** 순서. 빌드/푸시/재배포 중 하나라도 빠지면 공유 URL에 반영되지 않습니다.
- **저장 검증은 공유 `/exec` URL에서**: `@HEAD`(개발) 주소는 로그인 필수라 익명 저장이 안 되고, `no-cors`라 실패해도 "전송 완료"로 보입니다. 반드시 아래 공유 주소를 쓰세요.
  ```
  https://script.google.com/macros/s/AKfycbwm3qR95v8sA6q6zMFzaLKOi78R1cldZNc__1V8eUkXG5-8s_0t_qVaeEaD5ZWV6WGm/exec
  ```
- **재배포 후에는 하드 리프레시(Ctrl+Shift+R) 또는 시크릿창**으로 확인하세요. Apps Script는 iframe을 강하게 캐싱합니다.
- **`appsscript.json`을 덮어쓰는 작업 주의**: `clasp create-script`/클론 시 매니페스트가 기본값으로 바뀝니다. 그럴 땐 `webapp` 블록(`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`)과 `timeZone: Asia/Seoul`을 다시 넣고 `clasp push` 하세요.

---

## 6. 빠른 체크리스트

```bash
# 새 PC 최초 1회
git clone https://github.com/Kimjs99/baseball-scoreboard.git
cd baseball-scoreboard
npm install
npm install -g @google/clasp     # clasp 없을 때만
clasp login                      # jsmajs@gmail.com 으로!
clasp list-deployments           # 연결 확인

# 이후 작업할 때마다
npm run build
clasp push
clasp redeploy <공유 배포ID> -d "변경 설명"
```

문제가 생기면 `README.md`, `CLAUDE.md`(배포 주의사항·아키텍처), `사용설명서.md`(사용자용)도 참고하세요.

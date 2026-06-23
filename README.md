# ⚾ 야구 스코어보드 (Baseball Scoreboard)

React 단일 페이지 스코어보드를 **Google Apps Script 웹앱**으로 배포하는 프로젝트입니다.
별도 서버 없이 Apps Script의 `HtmlService`(프론트)와 `doPost`(백엔드)만으로 동작합니다.

## 주요 기능

- 볼/스트라이크/아웃 카운트, 주자 다이아몬드, 이닝별 스코어(R/H/E)
- 안타(1·2·3루타·홈런)·볼넷·아웃 시 주자 진루 및 득점 자동 처리
- 특수 상황 기록: 볼넷/사구(BB·HBP)·야수선택(FC)·실책 출루(ROE)·희생플라이(SF)·희생번트(SAC) + 주자/득점 수동 조정
- 타자별 타수/안타/**타율·타점(RBI)** 집계, 되돌리기(Undo)
- **경기 설정**: 정규 이닝 수·이닝당 아웃 카운트·타자 수(타순 인원)를 팀 설정에서 자유 조정
- **경기 종료(저장)** 및 새 경기 시작(이번 기록을 전체 누적에 반영)
- **라인업 기록**을 좌(어웨이)·우(홈) 사이드에 표시 (이번 경기 / 전체 누적 토글)
- **리더보드 별도 페이지**: 양 팀 타자 순위(타율·안타·타점)
- 팀명·라인업 수동 입력 또는 구글 시트(CSV) 연동
- 경기 결과 CSV 다운로드 / 구글 시트 자동 전송

## 구조

```
src/
  app.jsx               # React 컴포넌트 원본(JSX) — 여기서 수정
  index.template.html   # HTML 셸 (JS/CSS 주입 자리)
  tw-input.css          # @tailwind 지시문
build.cjs               # JSX→JS + Tailwind 스캔 → apps-script/Index.html 생성
apps-script/
  Index.html            # 빌드 산출물(수정 금지), doGet으로 서빙
  Code.gs               # doGet(화면) / doPost(결과 저장) / authorize(권한 승인)
  appsscript.json       # 웹앱 매니페스트 (ANYONE_ANONYMOUS, USER_DEPLOYING)
.clasp.json             # clasp 프로젝트 설정 (rootDir: apps-script)
```

> JSX·Tailwind는 **빌드 시 사전 컴파일**됩니다. Apps Script 샌드박스에서는 브라우저
> 런타임 Babel/Tailwind가 동작하지 않아(흰 화면) 정적 JS/CSS만 인라인합니다.

## 빌드 & 배포

```bash
npm install                 # 최초 1회 (@babel/standalone, tailwindcss)
npm run build               # src/app.jsx → apps-script/Index.html (src/ 수정 후 필수)
clasp login                 # 최초 1회 구글 인증
clasp push                  # 소스 업로드
clasp create-deployment     # 웹앱 배포 → /exec URL 생성
clasp open-web-app          # 배포된 앱 열기
```

배포 후 익명 접근 403이 뜨면, 에디터(`clasp open-script`)에서 `authorize` 함수를 1회 실행해 OAuth 스코프를 승인하세요.

배포 후 생성되는 `https://script.google.com/macros/s/.../exec` 주소가 스코어보드 화면입니다.
화면의 **결과 저장 → 구글 시트로 전송**을 누르면 배포 계정에 자동 생성된
`야구 스코어보드 경기기록` 스프레드시트에 경기요약·타자기록이 누적 저장됩니다.

## 배포 링크 & 연결 리소스

| 구분 | URL / ID | 비고 |
|---|---|---|
| 웹앱 (버전 배포, **공유·기록용**) | `https://script.google.com/macros/s/AKfycbwm3qR95v8sA6q6zMFzaLKOi78R1cldZNc__1V8eUkXG5-8s_0t_qVaeEaD5ZWV6WGm/exec` | 배포 ID `AKfycbwm3qR9...`, 현재 버전 `@13`. URL 고정. **익명 접근 가능 → 결과 저장은 이 URL에서만 동작** |
| 웹앱 (`@HEAD`, 개발/테스트용) | `https://script.google.com/macros/s/AKfycbwV0kZpbbfyEZq42cdlguCym84ATMCzEEnP7oRhf5Q/exec` | 배포 ID `AKfycbwV0...`, `clasp push` 시 최신 코드 자동 반영. ⚠️ **로그인 필수(익명 불가) → 결과 저장 안 됨**(no-cors라 실패해도 "전송 완료"로 보임). 화면 확인 전용 |
| 결과 저장 구글 시트 | `https://docs.google.com/spreadsheets/d/1icZKDgE0YS--CebK1v7nhvERZVkXhFGzQUAwXZkK0ZQ/edit` | 파일명 `야구 스코어보드 경기기록`. Script Properties `RESULT_SPREADSHEET_ID`에 캐시 |
| Apps Script 스크립트 ID | `15qf7wDFkRgNi_wIR-iTw401u6HQQLC6fV_XiVLwjbYZaAaXyMjU8Jy35` | `.clasp.json` 참조 |

- 버전 배포 갱신: `clasp push` 후 `clasp redeploy AKfycbwm3qR9...` (URL 유지, 새 버전으로 덮어쓰기)
- 배포 목록 확인: `clasp list-deployments`
- ⚠️ **저장 검증은 반드시 공유(/exec) URL에서** 하세요. `@HEAD`(개발 URL)는 로그인 필수라 익명 `no-cors` POST가 거부되며, 앱은 거짓 "전송 완료"를 표시합니다. `clasp push`만으로는 공유 배포가 갱신되지 않으니 **반드시 `clasp redeploy`** 해야 새 코드가 기록에 반영됩니다.

## 백엔드 동작 메모

- `doPost`는 프론트엔드가 `mode:'no-cors'`로 보내는 JSON을 `e.postData.contents`에서 읽습니다.
- 결과 스프레드시트 ID는 최초 1회 생성 후 Script Properties에 저장되어 재사용됩니다.

# ⚾ 야구 스코어보드 (Baseball Scoreboard)

React 단일 페이지 스코어보드를 **Google Apps Script 웹앱**으로 배포하는 프로젝트입니다.
별도 서버 없이 Apps Script의 `HtmlService`(프론트)와 `doPost`(백엔드)만으로 동작합니다.

## 주요 기능

- 볼/스트라이크/아웃 카운트, 주자 다이아몬드, 이닝별 스코어(R/H/E)
- 안타(1·2·3루타·홈런)·볼넷·아웃 시 주자 진루 및 득점 자동 처리
- 타자별 타수/안타/타율 집계, 되돌리기(Undo), 연장 이닝 지원
- 팀명·라인업(최대 15명) 수동 입력 또는 구글 시트(CSV) 연동
- 경기 결과 CSV 다운로드 / 구글 시트 자동 전송

## 구조

```
apps-script/
  Index.html       # React(UMD)+Babel+Tailwind 단일 화면, doGet으로 서빙
  Code.gs          # doGet(화면) / doPost(결과를 구글 시트에 저장)
  appsscript.json  # 웹앱 매니페스트 (ANYONE_ANONYMOUS, USER_DEPLOYING)
.clasp.json        # clasp 프로젝트 설정 (rootDir: apps-script)
```

## 배포 (clasp)

```bash
clasp login                 # 최초 1회 구글 인증
clasp push                  # 소스 업로드
clasp create-deployment     # 웹앱 배포 → /exec URL 생성
clasp open-web-app          # 배포된 앱 열기
```

배포 후 생성되는 `https://script.google.com/macros/s/.../exec` 주소가 스코어보드 화면입니다.
화면의 **결과 저장 → 구글 시트로 전송**을 누르면 배포 계정에 자동 생성된
`야구 스코어보드 경기기록` 스프레드시트에 경기요약·타자기록이 누적 저장됩니다.

## 백엔드 동작 메모

- `doPost`는 프론트엔드가 `mode:'no-cors'`로 보내는 JSON을 `e.postData.contents`에서 읽습니다.
- 결과 스프레드시트 ID는 최초 1회 생성 후 Script Properties에 저장되어 재사용됩니다.

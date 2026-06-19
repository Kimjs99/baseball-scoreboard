# Changelog

All notable changes to this project will be documented in this file.

## [v0.3.0] - 2026-06-20

### ✨ Features
- 경기 설정 추가 — 정규 이닝 수·이닝당 아웃 카운트·타자 수(타순 인원)를 팀 설정에서 조정 (B/S/O의 O 표시도 아웃 설정에 연동)
- 경기 강제 종료(저장) 및 새 경기 시작(이번 기록을 전체 누적에 합산)
- 타점(RBI) 집계 도입 및 시트 `타자기록`에 `타점` 열 추가
- 라인업 기록을 좌(어웨이)·우(홈) 사이드에 배치, 이번 경기/전체 누적 토글
- 리더보드 별도 페이지 추가 — 양 팀 타자 타율·안타·타점 순위
- 명단 직접 입력 시 기본 이름 자동 클리어(placeholder화) 및 클릭 시 전체 선택

### 🐛 Bug Fixes
- 다이아몬드(베이스) 이미지 재구성 — 절대 위치 기반으로 2·3·1루 및 홈플레이트 정상 배치
- 좁은 중앙 컬럼에 맞춰 NOW BATTING 등 카드 폰트·간격 조정(줄바꿈 해소)
- 결과 시트 헤더 자동 보정(`getOrCreateSheet_`) — 기존 시트에 `타점` 열 누락 시 헤더 갱신

### 📝 Documentation
- README·사용설명서 갱신 — 신규 기능 및 "저장은 /exec 공유 URL에서만 동작(@HEAD/dev는 로그인 필수, no-cors라 실패해도 '전송 완료' 표시)" 주의 추가, 공유 배포 버전 @6 표기

## [v0.2.0] - 2026-06-18

### ✨ Features
- 특수 상황 기록 패널 추가 — 야수선택(FC)·사구/볼넷(HBP·BB)·실책 출루(ROE)·희생플라이(SF)·희생번트(SAC) 및 주자/득점 수동 조정 (7375d2a)
- 최초 권한 승인용 `authorize()` 헬퍼 추가 (bf2c4ad)

### 🐛 Bug Fixes
- JSX/Tailwind 사전 컴파일로 Apps Script 흰 화면(런타임 변환 차단) 문제 해결 (466537d)

### 📝 Documentation
- 다중 사용자용 사용설명서 추가 — 각자 복제·배포로 사용자별 결과 시트 분리 안내 (7375d2a)
- README에 배포 링크·연결 시트·스크립트 ID 표 기록, CLAUDE.md 기록 규칙 의미 보강 (7375d2a)
- CLAUDE.md 및 CHANGELOG.md 최초 추가 (7f07bc7)

## [v0.1.0] - 2026-06-18

### ✨ Features
- React 단일 HTML 스코어보드(Index.html)를 Apps Script `doGet`으로 서빙 (902ea92)
- `doPost`로 경기 결과를 구글 시트(경기요약/타자기록)에 누적 저장 (902ea92)
- 결과 전송 기본 URL을 배포된 웹앱 `/exec` 주소로 자동 주입 (902ea92)

### 🐛 Bug Fixes
- 3아웃 시 타순이 다음 타자로 넘어가지 않던 버그 수정 (902ea92)

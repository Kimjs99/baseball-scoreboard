# REFACTORING.md

이 프로젝트의 **리팩토링 이력**을 누적 기록하는 문서입니다.
동작(기능)을 바꾸지 않으면서 코드 구조·중복·가독성을 개선한 작업을 남깁니다.

> 기능 변경(추가/수정/버그픽스)은 [`CHANGELOG.md`](./CHANGELOG.md)에, 순수 내부 리팩토링은 이 문서에 기록합니다.
> 두 성격이 겹치면 양쪽에 모두 남깁니다.

## 기록 규칙 (앞으로 지킬 것)

리팩토링이나 버전 변경을 할 때마다 아래를 남깁니다.

1. **리팩토링** → 이 문서 맨 위에 새 항목 추가:
   - 날짜(YYYY-MM-DD) · 대상 파일 · 변경 요약 · 이유 · **동작 보존 검증 방법**
   - `src/app.jsx`를 고쳤다면 반드시 `npm run build` 후 산출물 동작을 확인했는지 명시
2. **버전 변경(기능)** → [`CHANGELOG.md`](./CHANGELOG.md)에 `## [vX.Y.Z]` 항목 추가
   - 공유 배포까지 했다면 `· 공유 배포 @N` 표기와 [`기록용_링크.md`](./기록용_링크.md)의 버전 표기도 함께 갱신
3. **배포 반영 여부**를 항상 명시 — 빌드만 한 상태인지, `clasp push` + `clasp redeploy`까지 끝나 공유 `/exec`에 반영됐는지 구분
   (빌드만으로는 절대 라이브가 아님 — `CLAUDE.md`의 "Deployment gotchas" 참고)

---

## [2026-06-23] 코드 중복 제거 (app.jsx)

**대상:** `src/app.jsx` (→ `npm run build`로 `apps-script/Index.html` 재생성)
**성격:** 순수 리팩토링 — 동작 변경 없음
**배포:** ⏳ 빌드까지만 완료. `clasp push` + `clasp redeploy` 미실행 → 공유 `/exec`에는 아직 미반영.

### 변경 내용

1. **빈 베이스 리터럴 → 팩토리 함수**
   - `{ first: false, second: false, third: false }`가 5곳에 반복되던 것을
     모듈 레벨 헬퍼 `emptyBases()`로 통일.
   - 호출마다 새 객체를 반환하므로 누산용(예: `handleSacBunt`의 `const nb = emptyBases()`)으로도 안전.
   - 적용처: `useState` 초기값 / `switchInning` / `handleSacBunt` / `startNewGame` / `resumeSavedGame`.

2. **볼넷·사구·4구 강제진루 로직 → `applyWalk()` 헬퍼로 추출**
   - `handleBall`의 4구 분기와 `handleWalkLike`의 본문이
     `computeForcedWalk → setBases → updateStats → advanceBatter`로 완전히 동일했음.
   - 공통 로직을 `applyWalk()`로 추출(단, `saveHistory()`는 호출자가 담당하는 계약 유지).

### 이유
- 동일 로직이 흩어져 있으면 한쪽만 고쳐 규칙이 어긋날 위험(특히 밀어내기 타점 처리)이 있어 단일 출처로 통일.
- 빈 베이스 객체의 표현을 한 곳으로 모아 의도를 명확히 하고 오타 가능성 제거.

### 사전 확인 (정리 전 점검)
- 모든 함수·`useState` 변수·세터의 사용처를 grep으로 전수 확인 → **미사용(죽은) 코드 없음**.
- `apps-script/Code.gs`도 점검 → 죽은 코드 없음.
- 즉, 이번 작업은 "삭제"가 아니라 **중복 통합**이 핵심.

### 동작 보존 검증
- `npm run build` 성공 (산출물 101,884 → 101,716 bytes, 중복 제거로 소폭 감소).
- 금지 문자열(`text/babel`, `cdn.tailwindcss.com`) 0건 확인.
- 빌드 산출물을 로컬 HTTP 서버로 띄워 브라우저에서 직접 검증:
  - 정상 렌더링(흰 화면 없음).
  - **볼넷 경로 테스트**: `볼` 4회 클릭 → 1루 주자 점등 + 다음 타자로 진행 + B/S/O 리셋 + 타수 미증가(볼넷은 타수 제외) 정상.

# Floduler — React + TypeScript 이전

Vite + React + TypeScript. index.html의 기능이 **전부** 옮겨졌다 — 테마
카드(직접 입력·이미지 인식·서버 불러오기) → 조건 패널 → 결과(정렬·탭·
페이지네이션) → 팀 배정(F-14) → 공유 링크·자동저장 → 로그인·저장된
일정까지 실제로 동작한다. 저장소 루트의 `index.html`은 손대지 않아
계속 그대로 서빙되고, 이 디렉터리는 그 옆에서 자라는 중이다.

경위·설계 결정은 저장소 루트의 [`기획.md`](../기획.md) §4.31(스캐폴드+
핵심 로직)·§4.32(핵심 계산기 화면)·§4.33(CI/CD)·§4.34(3단계, 범위 밖
기능 하나씩 이식 — 완료), 진행 상세는 [`작업명세서.md`](../작업명세서.md)
#59~#66 참고.

**배포는 아직 이 앱으로 전환 안 됐다.** `.github/workflows/deploy.yml`이
`main` 푸시마다 테스트 통과 후 이 디렉터리를 빌드해 GitHub Pages에 올리는
워크플로를 이미 만들어 뒀지만, 저장소 Pages Source가 여전히 "브랜치에서
배포"(=지금 실제로 열리는 건 루트 `index.html`)로 남아 있다. §4.33에서
전환을 미룬 이유였던 "빠진 기능"은 이제 없다 — 남은 건 Revolt 스타일
리디자인뿐이고 그건 시각적으로 index.html과 동일하게 두는 이번 포팅
원칙과 무관한 별도 단계다. **Pages Source 전환은 여전히 사용자 승인이
필요하다** — 실제로 눌러 실서비스를 바꾸는 조작이라서.

```bash
npm install
npm test        # Vitest — index.html의 @core/직렬화 로직을 이식한 검사
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
```

## 구성

```
src/core.ts             index.html @core 구간(회차 파싱·조합 탐색) 이식, 로직 변경 없음
src/core.test.ts        test/acceptance.mjs 검사 전체를 Vitest로 이식
src/serialize.ts        serialize()/restore() — DOM 의존을 없앤 순수 함수. JSON 포맷은 원본과 완전히 동일
src/serialize.test.ts   ../test/fixtures/legacy-links.json 왕복 검증 + id 버그 회귀 테스트
src/ocr.ts              PaddleOCR 엔진 로드·전처리·인식 — index.html의 getPaddleService/ocr() 이식 (§4.34)
src/useTheme.ts          다크모드 토글 — index.html의 applyTheme/isDarkNow 이식 (§4.34)
src/useTour.ts           사용법 투어(스포트라이트) — index.html의 tourMount/showTourStep 이식 (§4.34)
src/server.ts            F-15 네트워크 — index.html의 server.js 이식 (§4.34)
src/useLoadModal.ts      F-15 "회차 불러오기" 모달 상태 — index.html의 openLoad/ldFetch 등 이식 (§4.34)
src/cloud.ts             Firebase Auth·Firestore — index.html의 cloud.js 이식, 로그인 전까지 지연 로드 (§4.34)
src/useAuth.ts           계정 상태 + 로그인/가입 모달 — index.html의 renderAcct/openAuth 등 이식 (§4.34)
src/usePlans.ts          "내 일정" 목록(불러오기/전환/삭제) — index.html의 loadPlans/renderPlans 이식 (§4.34)
src/useSaveModal.ts      일정 저장 모달 — index.html의 openSave/submitSave 이식 (§4.34)
src/scheduler/          useScheduler() 훅 — 핵심 앱 상태(themes/found/teams/sortKey/moveMap 등)
src/components/         ThemeCard·ThemeList·ConditionsPanel·MoveTimeGrid·ResultsPanel·ResultCard·TeamPanel·LoadModal·AcctWidget·AuthModal·SaveModal·PlanSection
src/SchedulerPage.tsx   위 컴포넌트를 조립하는 최상위 화면
src/floduler.css        index.html의 <style> 블록(31~543행) 그대로 — 리디자인 전까지 이 파일이 유일한 스타일 소스
public/vendor/          onnxruntime-web 모델·wasm — vite.config.ts에서 external 처리, index.html의 importmap으로 런타임 해석
public/firebase-config.js  저장소 루트 사본. 비밀이 아니라 커밋해도 되는 값 (파일 상단 주석 참고)
```

## 아직 없는 것

Revolt 스타일 리디자인뿐이다 — index.html의 §4.31~4.34에서 범위 밖으로
미뤘던 다섯 기능(다크모드 토글, 사용법 투어, 이미지 인식(OCR), F-15 회차
불러오기, 로그인/저장된 일정)이 전부 완료됐다 (§4.34). 다크모드는 시스템
설정 자동 전환에 더해 헤더 버튼으로 수동 전환 가능(`localStorage`에 남음),
투어는 첫 방문 시 자동 시작 + 헤더의 "사용법 보기" 버튼으로 언제든 재실행,
OCR은 파일 첨부·Ctrl+V 붙여넣기·드래그드롭 세 경로 모두 브라우저 내
PaddleOCR로 동작, F-15는 "회차 불러오기" 버튼으로 실제 배포된 서버에서
지점·날짜별 회차와 매진 여부를 가져온다(로컬 dev는 `vite.config.ts`의
`/api` 프록시로 CORS를 우회), 로그인은 헤더의 로그인 버튼 → 결과 카드의
"저장" → "내 일정"에서 불러오기/전환/삭제까지 — `index.html`이 저장한
일정도 `app/`에서 그대로 불러와진다(실측 확인, 기획 §4.34).

# Floduler — React + TypeScript 이전 (진행 중)

Vite + React + TypeScript. **핵심 계산기 화면까지** 옮겨진 상태다 — 테마
카드 → 조건 패널 → 결과(정렬·탭·페이지네이션) → 팀 배정(F-14) → 공유
링크·자동저장까지 실제로 동작한다. 저장소 루트의 `index.html`은 손대지
않아 계속 그대로 서빙되고, 이 디렉터리는 그 옆에서 자라는 중이다.

경위·설계 결정은 저장소 루트의 [`기획.md`](../기획.md) §4.31(스캐폴드+
핵심 로직)·§4.32(핵심 계산기 화면)·§4.33(CI/CD)·§4.34(3단계, 범위 밖
기능 하나씩 이식), 진행 상세는 [`작업명세서.md`](../작업명세서.md)
#59·#60·#61·#62 참고.

**배포는 아직 이 앱으로 전환 안 됐다.** `.github/workflows/deploy.yml`이
`main` 푸시마다 테스트 통과 후 이 디렉터리를 빌드해 GitHub Pages에 올리는
워크플로를 이미 만들어 뒀지만, 저장소 Pages Source가 여전히 "브랜치에서
배포"(=지금 실제로 열리는 건 루트 `index.html`)로 남아 있다 — 이 앱에
아직 이미지 인식·로그인·F-15·투어가 없어서, 지금 전환하면 실서비스가
그 기능들을 잃기 때문이다(기획 §4.33).

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
src/ocr-spike.ts        PaddleOCR가 Vite 번들에서 되는지 검증한 스파이크 코드 (컴포넌트로 다듬기 전 상태)
src/useTheme.ts          다크모드 토글 — index.html의 applyTheme/isDarkNow 이식 (§4.34)
src/scheduler/          useScheduler() 훅 — 핵심 앱 상태(themes/found/teams/sortKey/moveMap 등)
src/components/         ThemeCard·ThemeList·ConditionsPanel·MoveTimeGrid·ResultsPanel·ResultCard·TeamPanel
src/SchedulerPage.tsx   위 컴포넌트를 조립하는 최상위 화면
src/floduler.css        index.html의 <style> 블록(31~543행) 그대로 — 리디자인 전까지 이 파일이 유일한 스타일 소스
public/vendor/          onnxruntime-web 모델·wasm — vite.config.ts에서 external 처리, index.html의 importmap으로 런타임 해석
```

## 아직 없는 것 (버튼은 있지만 비활성화 상태)

이미지 인식(OCR) 연결, Firebase 계정·저장된 일정, F-15 서버 불러오기 모달,
사용법 투어, Revolt 스타일 리디자인. 배포 파이프라인은 만들어졌으나 위
이유로 아직 전환 전.

**다크모드 수동 토글 버튼은 완료**(§4.34) — 시스템 설정 자동 전환에 더해
헤더 버튼으로 수동 전환 가능, 선택은 `localStorage`에 남는다.

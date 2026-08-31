# Floduler — React + TypeScript 이전 (진행 중)

Vite + React + TypeScript 스캐폴드. 아직 화면(컴포넌트)은 없고, 지금은
**핵심 로직과 데이터 계층만** 옮겨진 상태다 — 저장소 루트의 `index.html`이
계속 실제로 서빙되는 앱이고, 이 디렉터리는 그 옆에서 자라는 중이다.

경위·설계 결정은 저장소 루트의 [`기획.md`](../기획.md) §4.31, 진행 상세는
[`작업명세서.md`](../작업명세서.md) #59 참고.

```bash
npm install
npm test        # Vitest — index.html의 @core/직렬화 로직을 이식한 검사
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
```

## 구성

```
src/core.ts           index.html @core 구간(회차 파싱·조합 탐색) 이식, 로직 변경 없음
src/core.test.ts       test/acceptance.mjs 검사 전체를 Vitest로 이식
src/serialize.ts       serialize()/restore() — DOM 의존을 없앤 순수 함수. JSON 포맷은 원본과 완전히 동일
src/serialize.test.ts  ../test/fixtures/legacy-links.json 왕복 검증 + id 버그 회귀 테스트
src/ocr-spike.ts       PaddleOCR가 Vite 번들에서 되는지 검증한 스파이크 코드 (컴포넌트로 다듬기 전 상태)
public/vendor/         onnxruntime-web 모델·wasm — vite.config.ts에서 external 처리, index.html의 importmap으로 런타임 해석
```

## 아직 없는 것

테마 카드·조건 패널·결과 카드·팀 패널·로드/저장 모달·계정 위젯·투어 같은
실제 화면, Firebase(cloud.js)·서버 로드(server.js) 연동, 배포 파이프라인
(GitHub Actions) — 전부 다음 단계.

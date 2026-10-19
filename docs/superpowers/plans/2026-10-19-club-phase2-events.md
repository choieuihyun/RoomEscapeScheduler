# 동호회 2단계 — 일정·참여·홈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 멤버가 동호회 일정을 만들고·고치고·지우고, 참여하고(정원), 예약 상태를 표시하고, 카톡 제목을 붙여넣어 채우거나 카톡에 올릴 글을 복사하며, 홈(대시보드)에서 한눈에 본다.

**Architecture:** 데이터는 서버 Postgres(`club_event`·`club_event_segment`·`club_event_participant`)에 있고, 화면은 작업명세서 §4.7 계약대로 부른다. 화면 쪽 규칙(카톡 제목 해석, 상태·제목 만들기, 홈에 고를 일정, 입력 검사, 범위 병합)은 React 밖의 순수 함수(`clubEvents.ts`)로 두어 단위 테스트한다. 일정 목록은 `SchedulerPage` 에서 훅 하나(`useClubEvents`)가 들고 홈·캘린더가 같이 쓴다.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest, 헤드리스 확인은 Playwright(`page.route` 로 서버 응답 흉내).

**Spec:** `docs/superpowers/specs/2026-10-19-club-calendar-design.md` (§6.2, §6.7, §6.8-2, §6.9) · 계약 `작업명세서.md` §4.7 · 목업 https://claude.ai/artifact/D5EiM6uxv84PjLon5ernb8

**누가 무엇을:** 서버는 **서버 세션(`server-ae`)** 이 §4.7 대로 `~/ideaProjects/Server` 에서 만든다(표 셋, D30·D31, 실제 Postgres 동시성 테스트). 이 계획의 Task E1~E9 는 이 저장소(`/Users/uihyeon/RoomEscapeScheduler-club`, 갈래 `club-phase2`)의 앱 작업이다. 서버가 아직 없으니 화면 확인은 Playwright 흉내로 한다.

## Global Constraints

- 계약 원본은 `작업명세서.md` §4.7 이다. 응답 모양을 바꿔야 하면 코드보다 그 문서를 먼저 고치고 서버 세션에 알린다.
- 시각은 **자정부터의 분(정수)**, 표시는 `core.ts` 의 `fmt`·`parseClock` 을 쓴다(자정 넘김 `24:30` = 1470, 범위 0~2879). 날짜는 `"YYYY-MM-DD"` 한국 날짜, `core.ts` 의 `toISO` 로 만든다.
- 글자 수는 코드 포인트(`[...s].length`): 제목 0~60, 위치 0~60, 메모 0~500, 테마명 1~40, 지점명 0~40, 구간 0~6개, 정원 `null` 또는 2~8.
- 상태는 저장하지 않고 만든다: 구간 없음 → `'talk'`(협의 중), 있으면 `booked ? 'done'(예약 완료) : 'before'(예약 전)`.
- 서버 에러는 본문 `message` 를 그대로 보여 준다(`server.ts` 의 `sayClub`). 삭제 요청의 `404` 는 성공으로 받는다.
- 새 API 가 `404`(본문 없음)면 홈 메뉴·홈 화면·캘린더의 동호회 일정만 숨기고 나머지는 그대로 돈다.
- 조합 계산·공유 링크(`#s=`·`#z=`)·테마 불러오기는 로그인 없이 그대로 동작해야 한다.
- 화면 색은 `floduler.css` 토큰만 쓴다. 상태 색은 새 토큰 세 쌍을 `:root` 와 다크 두 블록에 함께 둔다(아래 E5). 카카오 노랑 `#FEE500` 만 예외.
- 화면 문구는 해요체·사람 말(기획 §4.53). 화면에서 ADMIN 은 "운영진".
- 확인용 스크립트는 scratchpad 에 두고, 헤드리스 크롬은 CLAUDE.md 규칙(프로필 `/tmp/cdp-prof-<작업명>`, 끝나면 `pkill -f 'user-data-dir=/tmp/cdp-prof-'` 후 `pgrep -lf 'remote-debugging-port'` 가 비어야 함)을 지킨다.
- 커밋에 `Co-Authored-By: Claude` 를 넣지 않는다. 푸시는 사용자 승인 뒤(E9)에만 한다.
- 린트 경고 수는 시작 시점(172)보다 늘리지 않는다.

## Review Focus

1. **마지막 한 자리에 두 사람이 거의 동시에 "참여"** — 한 명은 `409 EVENT_FULL` 을 받는다. 화면은 "자리가 다 찼어요."를 띄우고, 그 일정을 다시 불러와 "마감"으로 바꿔야 한다(낡은 "참여" 단추가 남으면 안 된다). → Task E3 테스트.
2. **둘이 같은 일정을 동시에 고침** — 뒤에 저장한 사람은 `409 EVENT_CONFLICT` 를 받는다. 입력한 내용을 버리지 않고 "다른 사람이 먼저 고쳤어요" + 최신 내용 보기를 띄우며, 조용히 덮어쓰지 않는다. → Task E5 테스트(`conflictOf`).
3. **카톡 제목이 형식과 조금 다름** — `[예약o]`, `[ 예약 X ]`, `+` 앞뒤 공백 없음, `13시40분`, 시각 없는 조각이 섞임. 알아보는 것만 채우고, 시각 없는 조각이 있으면 구간을 채우지 않고 제목을 그대로 둔다(틀리게 채우는 것보다 안 채우는 게 낫다). → Task E1 테스트.
4. **자정 넘는 회차(`24:30`)와 하루 종일 일정** — 목록·캘린더·카톡 글에서 `00:30` 으로 보이되 정렬은 1470 기준, 하루 종일 일정은 시각 없이 맨 앞. → Task E1 테스트.
5. **`#e=<id>` 링크로 들어왔는데 지워진 일정이거나 승인 전 계정** — 빈 상세가 아니라 "일정을 찾을 수 없어요"(404) / 로그인·승인 안내를 띄우고, 공유 링크(`#s=`·`#z=`)와 계산 화면 자동 저장을 망가뜨리지 않는다. → Task E6 테스트(`readEventHash`)·헤드리스.

---

### Task E1: 순수 함수 — 상태·제목·카톡 해석·카톡 글·홈 고르기

**Files:**
- Create: `app/src/clubEvents.ts`
- Test: `app/src/clubEvents.test.ts`

**Interfaces — Produces:**
- `export type EventStatus = 'talk' | 'before' | 'done'`, `export const STATUS_LABEL: Record<EventStatus, string>` = `{ talk: '협의 중', before: '예약 전', done: '예약 완료' }`
- `eventStatus(ev: Pick<EventDto,'segments'|'booked'>): EventStatus`
- `eventTitle(ev: Pick<EventDto,'title'|'segments'>): string` — `title` 이 있으면 그대로, 없으면 구간을 `비밀의 화원 13:40 → 셜록의 서재 15:20`
- `timeLabel(ev): string` — 하루 종일이면 `''`, 시각이 있으면 `13:40–16:30`, 없고 구간이 있으면 첫 구간 시작~마지막 구간 끝(끝이 없으면 시작만)
- `parseKakaoTitle(s: string): { booked: boolean | null; segments: { themeName: string; startMin: number }[] }` — 앞의 `[예약O|o|0]`·`[예약X|x]`(괄호 안 공백 허용)을 떼고, 나머지를 `+` 로 나눠 조각마다 끝의 시각(`13:40` 또는 `13시40분`·`13시`)을 읽는다. 조각 하나라도 시각이 없거나 테마명이 비면 `segments: []`.
- `kakaoPost(ev: EventDto, link: string): string` — `[예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20 · 3/4명\n<link>`. 구간 없으면 `제목 · 2명`(정원 없으면 `n명`, 있으면 `n/정원명`). 예약 표시는 구간이 있을 때만(`[예약O]`/`[예약X]`).
- `sortEvents(evs: EventDto[]): EventDto[]` — `date` → `startMin`(null 먼저, 없으면 첫 구간 시작) → `id`
- `nextMine(evs: EventDto[], today: string): EventDto | null` — `joined` 이고 `date >= today` 인 것 중 가장 이른 것
- `upcoming(evs: EventDto[], today: string, days: number): EventDto[]` — `today ≤ date ≤ today+days-1`, 정렬
- `addDays(iso: string, n: number): string`
- `cpLen(s: string): number` — `[...s].length`

- [ ] **Step 1: 실패하는 테스트** (`clubEvents.test.ts`)
  - `구간 없으면 협의 중, 있으면 booked 로` — `eventStatus({segments:[],booked:true})` → `'talk'`, 구간 하나 + `booked:false` → `'before'`
  - `제목이 비면 구간으로 만든다` — `'비밀의 화원 13:40 → 셜록의 서재 15:20'`
  - `카톡 제목 기본형` — `parseKakaoTitle('[예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20')` → `{booked:true, segments:[{themeName:'비밀의 화원',startMin:820},{themeName:'셜록의 서재',startMin:920}]}`
  - **`카톡 제목 변형`**(Review Focus 3) — `'[ 예약 x ]심해 탐사 11:00+미드나잇 13시30분'` → `booked:false`, 시작 660·810; `'[예약0] ABC 13:40'` → `booked:true`
  - **`시각 없는 조각이 섞이면 구간을 안 채운다`** — `'[예약X] ABC 13:40 + DEF'` → `{booked:false, segments:[]}`; `'테마, 일정 협의'` → `{booked:null, segments:[]}`
  - **`자정 넘김`**(Review Focus 4) — `parseKakaoTitle('ABC 24:30')` → `startMin:1470`; `kakaoPost` 에는 `00:30` 으로 나온다; `sortEvents` 에서 같은 날 `startMin 1470` 이 `1200` 뒤, `startMin:null`(하루 종일)이 맨 앞
  - `카톡 글` — 위 일정(`booked:true`, count 3, capacity 4, link `https://x/#e=12`) → `'[예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20 · 3/4명\nhttps://x/#e=12'`; 협의형 `title:'테마, 일정 협의'`, count 2, capacity null → `'테마, 일정 협의 · 2명\n…'`
  - `내 다음 일정` — 어제 참여한 것·참여 안 한 것은 건너뛰고 오늘 이후 첫 `joined`
  - `2주 목록` — `upcoming(evs,'2026-10-19',14)` 에 `2026-11-01` 포함, `2026-11-02` 제외
  - `cpLen('😀가')` → 2
- [ ] **Step 2:** `cd app && npx vitest run src/clubEvents.test.ts` — FAIL(모듈 없음).
- [ ] **Step 3:** 구현. `EventDto` 타입은 E2 가 `server.ts` 에 두는 것을 import 한다 — E1 을 먼저 하므로 **이 Task 에서 `server.ts` 에 §4.7 의 `EventDto`·`SegmentDto`·`EventInput`·`SegmentInput`·`ClubMemberDto` 인터페이스만 먼저 추가**한다(함수는 E2).
- [ ] **Step 4:** PASS, `npx tsc -b` 통과.
- [ ] **Step 5:** 커밋 — `feat: 동호회 일정 순수 함수 — 상태·제목·카톡 해석·카톡 글·홈 고르기`

---

### Task E2: 일정 API 호출 (`server.ts`)

**Files:**
- Modify: `app/src/server.ts`
- Test: `app/src/server.test.ts` (기존 파일에 추가, `fetch` 는 `vi.stubGlobal`)

**Interfaces — Produces:**
- `listEvents(from: string, to: string, token): Promise<EventDto[]>` → `GET /api/club/events?from=&to=`
- `getEvent(id: number, token): Promise<EventDto>`
- `createEvent(input: EventInput, token): Promise<EventDto>` → `POST /api/club/events`
- `updateEvent(id: number, input: EventInput, version: number, token): Promise<EventDto>` → `POST /api/club/events/{id}` 본문 `{...input, version}`
- `deleteEvent(id: number, token): Promise<void>` → `DELETE`; **`404` 는 던지지 않고 성공으로 끝낸다**
- `joinEvent(id, token)`, `leaveEvent(id, token)`, `addParticipant(id, uid, token)`, `removeParticipant(id, uid, token)`, `setBooked(id, booked: boolean, token)` → 모두 `Promise<EventDto>`
- `listClubMembers(token): Promise<ClubMemberDto[]>` → `GET /api/club/members`
- `export function conflictOf(err: unknown): EventDto | null` — `409` + `body.error === 'EVENT_CONFLICT'` 면 `body.event`, 아니면 `null`
- `export function errorCode(err: unknown): string | null` — `body.error` 또는 `null`
- `export function isMissingApi(err: unknown): boolean` — 상태 404 이고 본문 `error` 가 없음(서버가 새 API 를 모름)

- [ ] **Step 1: 실패하는 테스트**
  - `listEvents 는 from·to 를 싣고 Bearer 를 보낸다` — URL 이 `/api/club/events?from=2026-10-19&to=2026-12-19`
  - `updateEvent 는 version 을 본문에 싣는다`
  - **`삭제 404 는 성공`** — `deleteEvent` 가 resolve
  - **`충돌이면 최신 일정을 꺼낸다`** — 409 `{error:'EVENT_CONFLICT',message:'…',event:{id:3,version:5,…}}` → `conflictOf(e).version === 5`; 409 `EVENT_FULL` → `conflictOf(e) === null`, `errorCode(e) === 'EVENT_FULL'`
  - `본문 없는 404 는 API 없음, NO_SUCH_EVENT 404 는 아님` — `isMissingApi`
- [ ] **Step 2:** FAIL. **Step 3:** 구현(기존 `send`/`authed` 를 쓴다 — 에러 본문은 이미 `e.body` 에 담긴다). **Step 4:** PASS, `npx tsc -b`.
- [ ] **Step 5:** 커밋 — `feat: 동호회 일정 API 호출`

---

### Task E3: `useClubEvents` — 목록 들고 있기·다시 불러오기·동작

**Files:**
- Create: `app/src/useClubEvents.ts`
- Modify: `app/src/clubEvents.ts` — 순수 병합 함수 추가
- Test: `app/src/clubEvents.test.ts`

**Interfaces:**
- Consumes: E1·E2. `useAuth` 의 `idToken` 얻는 방식은 `useMembers.ts` 를 따른다.
- Produces (`clubEvents.ts`): `mergeRange(cur: EventDto[], from: string, to: string, fresh: EventDto[]): EventDto[]` — `from~to` 안의 기존 항목을 버리고 `fresh` 로 바꾼 뒤 정렬; `upsert(cur, ev): EventDto[]`; `dropEvent(cur, id): EventDto[]`
- Produces (`useClubEvents(enabled: boolean, ranges: { from: string; to: string }[])`):
  `{ events: EventDto[]; api: 'unknown' | 'on' | 'missing'; error: string; reload(): Promise<void>; refreshOne(id: number): Promise<EventDto | null>;
     create(input): Promise<EventDto>; update(id, input, version): Promise<EventDto>; remove(id): Promise<void>;
     join(id): Promise<void>; leave(id): Promise<void>; addPerson(id, uid): Promise<void>; removePerson(id, uid): Promise<void>; setBooked(id, booked): Promise<void>; busyIds: Set<number> }`
  - `enabled` = 로그인 + 승인 멤버. false 면 아무것도 부르지 않고 `events=[]`.
  - 다시 불러오기: `enabled` 가 켜질 때, `ranges` 가 바뀔 때, `visibilitychange`(보임)·`focus`, 60초마다(창이 보일 때만).
  - 첫 응답이 `isMissingApi` 면 `api='missing'`, 성공하면 `'on'`.
  - 동작이 성공하면 돌아온 `EventDto` 를 `upsert`. 실패하면 `sayClub` 문구로 `showToast`, **그리고 `EVENT_FULL`·`NO_SUCH_EVENT` 면 `refreshOne(id)`(404 면 목록에서 뺀다)**. `update` 의 `EVENT_CONFLICT` 는 토스트 없이 그대로 던진다(E5 가 처리).

- [ ] **Step 1: 실패하는 테스트** (`clubEvents.test.ts`)
  - `범위 병합은 그 범위만 바꾼다` — 10/1·10/20·11/5 가 있을 때 `mergeRange(cur,'2026-10-15','2026-10-31',[10/22])` → 10/1·10/22·11/5
  - `지워진 일정은 범위 병합에서 사라진다`
  - `upsert 는 같은 id 를 바꾸고 정렬을 지킨다`
  - **`정원 초과 뒤에는 그 일정을 다시 불러온다`**(Review Focus 1) — 훅 대신, 실패 처리 함수를 순수하게 떼어 `afterActionError(err): 'refresh' | 'drop' | 'none'` 으로 시험: `EVENT_FULL` → `'refresh'`, `NO_SUCH_EVENT` → `'drop'`, `EVENT_CONFLICT` → `'none'`
- [ ] **Step 2:** FAIL. **Step 3:** 구현(`afterActionError` 는 `clubEvents.ts` 에). **Step 4:** PASS, `npx tsc -b`, `npm test` 전체.
- [ ] **Step 5:** 커밋 — `feat: useClubEvents — 동호회 일정 목록과 동작`

---

### Task E4: 홈 메뉴와 첫 화면 (`useView`·`SideNav`·`SchedulerPage`)

**Files:**
- Modify: `app/src/useView.ts`, `app/src/useView.test.ts`
- Modify: `app/src/components/SideNav.tsx` — 맨 위에 "홈"(집 아이콘), `homeOn` 일 때만
- Modify: `app/src/SchedulerPage.tsx` — `useClubEvents` 를 여기서 한 번 만들고, 홈 자리(빈 `HomePage` 자리표시는 E7 이 채운다)

**Interfaces — Produces:**
- `export type View = 'home' | 'calc' | 'calendar' | 'members'`
- `readView(search: string, hash: string, o: { calendarOn: boolean; isAdmin: boolean; homeOn: boolean }): View`
  - `?view=` 가 있으면 그대로(쓸 수 없으면 아래 기본으로), `?view=calc` 는 계산 화면을 **명시**한다.
  - `?view=` 가 없을 때: `hash` 가 `#s=`·`#z=` 로 시작하면 `'calc'`, `#e=` 면 `'calendar'`, 아니면 `homeOn ? 'home' : 'calc'`.
  - `'home'` 은 `homeOn` 이 아니면 `'calc'`.
- `useView(o)` 의 `go('calc')` 는 이제 `?view=calc` 를 **적는다**(기본이 홈이라 지우면 홈으로 간다). `go('home')` 은 `?view=` 를 지운다.
- `homeOn = cloudOn && member?.status === 'APPROVED' && clubEvents.api !== 'missing'`

- [ ] **Step 1: 실패하는 테스트** (`useView.test.ts`, 기존 테스트는 새 시그니처로 고친다)
  - `승인 멤버는 기본이 홈` — `readView('', '', {calendarOn:true,isAdmin:false,homeOn:true})` → `'home'`
  - `승인 전·로그아웃은 기본이 계산`
  - **`공유 링크는 홈이어도 계산으로`** — hash `#s=AAA` → `'calc'`
  - `일정 링크는 캘린더로` — hash `#e=12` → `'calendar'`
  - `?view=calc 는 홈 멤버여도 계산`
  - `홈이 꺼졌는데 ?view=home 이면 계산`
- [ ] **Step 2:** FAIL. **Step 3:** 구현. 사이드 메뉴 "홈"은 `homeOn` 일 때만 보인다. `useTour` 의 "계산 화면으로 먼저 넘어간 뒤" 로직은 `go('calc')` 를 그대로 쓴다.
- [ ] **Step 4:** PASS, `npx tsc -b`, `npm test` 전체.
- [ ] **Step 5:** 커밋 — `feat: 홈 메뉴와 첫 화면 — 승인 멤버는 홈 (설계 §6.9)`

---

### Task E5: 일정 만들기·수정 창 (`EventForm`)

**Files:**
- Create: `app/src/eventForm.ts` — 폼 상태 ↔ `EventInput` 순수 변환과 검사
- Create: `app/src/components/EventForm.tsx`
- Modify: `app/src/floduler.css` — 창 스타일과 **상태 색 토큰**: `--st-talk-fg/bg`, `--st-before-fg/bg`, `--st-done-fg/bg` (라이트: talk `#525253`/`#EEEFEF`, before `#99562C`/`#FFEDDC`, done `#0D7738`/`#E3F4E8`; 다크 두 블록에도 같은 이름으로 대비 4.5:1 이상 값)
- Test: `app/src/eventForm.test.ts`

**Interfaces:**
- Consumes: E1 `parseKakaoTitle`, `cpLen`; E3 `create`/`update`; E2 `conflictOf`, `sayClub`.
- Produces (`eventForm.ts`):
  - `export interface FormState { title: string; date: string; allDay: boolean; start: string; end: string; location: string; capacity: number | null; booked: boolean; memo: string; segs: { themeName: string; branchName: string; themeKey: string | null; start: string; end: string }[] }` (시각은 입력 칸 문자열 `"13:40"`)
  - `emptyForm(date: string): FormState`, `formFromEvent(ev: EventDto): FormState`, `formFromSteps(date: string, steps: PathStep[]): FormState`(E8 이 씀 — `name`→themeName, `place`→branchName, `start`/`end`)
  - `applyPaste(f: FormState, title: string): { form: FormState; note: string }` — `parseKakaoTitle` 결과가 구간을 주면 `segs` 를 바꾸고 `booked` 를 채우며 `title` 은 **비운다**(제목은 구간으로 만들어지므로), `note` = `'카톡 제목에서 예약 완료 · 테마 2개를 채웠어요.'` 형식(예약 상태가 없으면 `'테마 2개를 채웠어요.'`). 구간이 없으면 `title` 만 바꾸고 `note=''`.
  - `toInput(f: FormState): { input: EventInput } | { error: string }` — 검사 실패 문구(해요체): 제목·테마 둘 다 비면 `'제목이나 테마 중 하나는 적어 주세요.'`, 시각을 못 읽으면 `'시각은 13:40 처럼 적어 주세요.'`, 끝이 시작보다 이르면 `'끝 시각이 시작보다 늦어야 해요.'`, 글자 수 초과면 `'제목은 60자까지예요.'` 등 칸 이름을 넣어서.
- 화면: 목업 "일정 만들기" 그대로 — 제목(붙여넣기·입력이 끝날 때 `applyPaste`, 아래 초록 `note`), 날짜, 시간(구간이 있으면 "테마에서" 읽기 전용, 없으면 하루 종일 체크 + 시작·끝), 테마 행(시작·테마·지점·끝·빼기, 최대 6, "+ 테마 추가"), 인원 칩(제한 없음·2~8), 예약(구간 있을 때만), 위치·메모(선택), 만들기/저장·취소.
- 수정 중 `409 EVENT_CONFLICT` 면 입력을 지우지 않고 창 위에 `'다른 사람이 먼저 고쳤어요.'` 줄 + "새로 불러온 내용 보기"(누르면 `formFromEvent(최신)` 로 바꾸고 `version` 도 최신으로) (Review Focus 2). `CAPACITY_TOO_SMALL` 등은 서버 문구 그대로.

- [ ] **Step 1: 실패하는 테스트** (`eventForm.test.ts`)
  - `붙여넣기로 구간과 예약을 채우고 제목은 비운다`
  - `구간 없는 제목은 그대로`
  - `테마 행에서 EventInput 으로` — `segments[0] = {themeName:'비밀의 화원', branchName:'강남점', themeKey:null, startMin:820, endMin:890}`, 빈 지점은 `null`
  - `하루 종일이면 startMin·endMin 이 null`
  - `제목도 테마도 없으면 오류 문구`, `끝이 시작보다 이르면 오류`, `61자 제목은 오류`(이모지 포함 코드 포인트)
  - `formFromSteps 는 계산 결과 단계를 구간으로`
  - **`충돌이면 입력을 지키고 최신으로 바꿀 수 있다`**(Review Focus 2) — `formFromEvent(conflictEvent)` 가 최신 값, 원래 폼 객체는 바뀌지 않음(불변)
- [ ] **Step 2:** FAIL. **Step 3:** 구현(`eventForm.ts` → `EventForm.tsx` → CSS). 창은 기존 `.modal`/`.mbox` 를 쓰고 휴대폰에선 화면 전체.
- [ ] **Step 4:** PASS, `npx tsc -b`, `npm test`. 헤드리스: 창 라이트·다크·390px, 붙여넣기 뒤 모습. 크롬 정리.
- [ ] **Step 5:** 커밋 — `feat: 동호회 일정 만들기·수정 창 — 카톡 제목 붙여넣기`

---

### Task E6: 캘린더에 동호회 일정 + 일정 상세 패널 + `#e=` 링크

**Files:**
- Modify: `app/src/useCalendar.ts` — `CalKind` 에 `'club'`, 필터 기본값 `club: true`(기존 저장값에 키가 없으면 true 로 채운다), `openEvent: number | null` + `setOpenEvent`
- Modify: `app/src/components/CalendarSide.tsx` — 필터 줄 "동호회 일정" (`homeOn` 일 때만)
- Modify: `app/src/components/CalendarPage.tsx` — 날짜 칸에 동호회 일정 칩(상태 점 + 제목 + `n/정원`), 일정 칩을 누르면 오른쪽 패널을 일정 상세로, "+ 일정 만들기" 단추
- Create: `app/src/components/EventPanel.tsx`
- Create: `app/src/eventLink.ts` — `readEventHash(hash: string): number | null`(`#e=12` → 12, 아니면 null), `eventLink(id: number, loc: {origin; pathname}): string`
- Test: `app/src/eventLink.test.ts`

**Interfaces — Consumes:** E1(`eventStatus`·`STATUS_LABEL`·`eventTitle`·`timeLabel`·`kakaoPost`), E3 훅 동작, E5 `EventForm`(수정), E2 `listClubMembers`(대신 넣기 고르기).

- 상세 패널(목업 그대로): 상태 배지·수정·삭제(`canDelete`)·닫기 / 제목·날짜·만든 사람 / 구간 목록(사이 이동 시간 = 다음 시작 − 이전 끝, 끝이 없으면 생략) / 참여 `count/capacity`, 남은 자리, 참여자 칩(만든 사람 표시), `mine` 이면 "+ 대신 넣기"(승인 멤버 목록에서 고르기)·칩마다 빼기 / 참여·참여 취소·마감 단추 / 예약 상태 바꾸기(참여자·만든 사람, 구간이 있을 때만) / 메모·위치 / "카톡에 올릴 글 복사"(`kakaoPost` + `eventLink` 를 클립보드에, `showToast('카톡에 붙여 넣으세요.')`).
- 삭제는 `confirm('이 일정을 지울까요? 참여한 사람들 화면에서도 사라져요.')`.
- `#e=<id>`: 시작할 때 해시에 있으면 캘린더 화면으로 열고 `getEvent` → 그 날짜를 고르고 패널을 연다. 404 면 `showToast('일정을 찾을 수 없어요. 지워졌을 수 있어요.')`. 승인 전·로그아웃이면 로그인 창을 연다. 패널을 닫으면 `history.replaceState` 로 `#e=` 만 지운다(다른 해시는 건드리지 않는다).

- [ ] **Step 1: 실패하는 테스트** (`eventLink.test.ts`)
  - `readEventHash('#e=12')` → 12, `'#e=abc'`·`'#s=…'`·`''` → null
  - **`공유 해시와 섞이지 않는다`**(Review Focus 5) — `readEventHash('#z=e=12')` → null
  - `eventLink(12, {origin:'https://choieuihyun.github.io', pathname:'/RoomEscapeScheduler/'})` → `'https://choieuihyun.github.io/RoomEscapeScheduler/#e=12'`
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS, `npx tsc -b`, `npm test`.
- [ ] **Step 5: 헤드리스 확인**(scratchpad 스크립트, `page.route('**/api/**')` 로 §4.7 모양 응답을 흉내, Firebase 는 1단계 확인 스크립트처럼 가짜 모듈): 캘린더 칩·상세 패널 라이트·다크·390px, 참여 → 409 `EVENT_FULL` 흉내 → 토스트 + "마감"으로 바뀜(Review Focus 1), `#e=999` → 404 토스트, `#s=` 공유 링크가 그대로 계산 화면으로 열림. 크롬 정리.
- [ ] **Step 6:** 커밋 — `feat: 캘린더에 동호회 일정과 상세 패널, 일정 링크`

---

### Task E7: 홈 화면 (`HomePage`)

**Files:**
- Create: `app/src/components/HomePage.tsx`
- Modify: `app/src/SchedulerPage.tsx` — 홈 화면 자리, 홈 범위 `{ from: today, to: addDays(today, 61) }` 를 `useClubEvents` ranges 에 넣는다(캘린더 범위는 보고 있는 달 그리드 첫날~끝날)
- Modify: `app/src/floduler.css`

**Interfaces — Consumes:** E1 `nextMine`·`upcoming`·`eventTitle`·`timeLabel`·`STATUS_LABEL`, E3 훅, 기존 `useWatches`(빈자리 알림 개수·첫 알림), `useMembers`(운영진 승인 대기 수 — 이미 `SchedulerPage` 에 있음).

- 목업 "홈" 그대로: 머리말 "홈" + "<닉네임> 님, 다가오는 동호회 일정이에요." + "일정 만들기"(E5 창) / "내 다음 일정"(없으면 "참여한 일정이 아직 없어요. 아래에서 골라 참여해 보세요.") / 빈자리 알림 칸(`n/한도`, 첫 알림 한 줄, "알림 관리 →" = 빈자리 알림 창) / 운영진에게만 "가입 신청 n명 → 멤버 관리" / "다가오는 동호회 일정"(2주, 줄: 날짜·요일(토 파랑·일 빨강 — 기존 `--sat`/`--sun` 토큰)·상태 배지·제목·만든 사람·`n/정원명`·참여 단추 / "참여 중" / "마감"; 비면 "2주 안에 잡힌 일정이 없어요. 하나 만들어 볼까요?"). 줄을 누르면 캘린더 화면 + 그 일정 상세.
- 휴대폰: 목업 "홈 (휴대폰)" 처럼 한 줄로 쌓는다.

- [ ] **Step 1:** 구현(순수 로직은 E1 에 이미 있다 — 이 Task 는 화면만).
- [ ] **Step 2:** 헤드리스: 홈 라이트·다크·1280·390px, 일정 없음·참여 일정 없음 상태, 운영진/일반 멤버 두 벌. `npm run build`·`npm test`·린트 경고 수. 크롬 정리.
- [ ] **Step 3:** 커밋 — `feat: 홈 — 내 다음 일정·다가오는 동호회 일정·빈자리 알림·가입 신청`

---

### Task E8: 계산 결과에서 "동호회 일정으로 올리기"

**Files:**
- Modify: `app/src/components/ResultCard.tsx`, `app/src/components/ResultsPanel.tsx` — 결과 카드에 단추(승인 멤버 + `api === 'on'` 일 때만)
- Modify: `app/src/SchedulerPage.tsx` — 누르면 `formFromSteps(날짜, r.steps)` 로 E5 창을 연다

**Interfaces — Consumes:** E5 `formFromSteps`, `EventForm`.

- 날짜는 테마를 불러온 날짜가 있으면 그 날짜(계산 화면 상태에서 찾는다 — 없으면 오늘), 사용자가 창에서 고친다. 예약 상태 기본은 "예약 전".
- [ ] **Step 1:** 구현. **Step 2:** 헤드리스로 결과 카드 단추 → 창에 구간이 채워진 모습 한 장. 빌드·테스트·린트, 크롬 정리.
- [ ] **Step 3:** 커밋 — `feat: 계산 결과에서 동호회 일정으로 올리기`

---

### Task E9: 문서·배포·확인

**Files:**
- Modify: `기획.md` — 새 절 `### 4.57 동호회 2단계 — 일정·참여·홈` (결정과 이유: 표 셋·분 정수·낙관적 수정+비관적 정원, 만든 사람 참여 취소 가능, 첫 화면 홈, 카톡 해석은 틀리게 채우느니 안 채움, 테마 키·끝 시각 자동 채움은 4단계로 미룸, 운영진은 삭제만)
- Modify: `배포.md` — 2단계 배포 순서(서버 → 5분 → 앱)

- [ ] **Step 1:** `기획.md`·`배포.md` 를 쓰고 커밋 — `docs: 동호회 2단계 (기획 §4.57)`
- [ ] **Step 2:** 서버 세션이 배포를 마치고(사용자 승인) `GET /api/club/events?from=…&to=…` 가 토큰 없이 `401` 인 것을 확인한다.
- [ ] **Step 3:** **사용자 승인을 받고** `club-phase2` 를 `main` 에 합쳐 푸시한다(서버 배포 5분 뒤). 사이트 반영을 확인한다.
- [ ] **Step 4:** 운영 확인 — 헤드리스로 로그아웃 상태가 계산 화면으로 열리는지, `#s=` 공유 링크. 실제 일정 만들기 → 다른 계정으로 참여 → 정원 마감 → 카톡 글 복사·붙여넣기 → 링크 열기는 **사용자 확인**으로 받는다. 결과를 `기획.md` §4.57 에 적고 커밋.

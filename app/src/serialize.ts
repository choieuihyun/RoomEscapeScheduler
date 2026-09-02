/* ══════════════════════════════════════════════════════════════════
   index.html의 serialize()/restore()/b64e/b64d(1726~1779행, 2026-08-31
   기준)를 상태 계층으로 옮긴 것. 원본은 DOM(`$('oStart').value` 등)에
   직접 의존했으므로 그대로 옮길 수 없었다 — 상태 객체를 받고 돌려주는
   순수 함수로 다시 짰다. 그러나 밖으로 나가는 JSON 모양(v:3, 위치 기반
   튜플, 죽은 lock 자리, id 자리)은 바이트 호환을 위해 원본과 완전히
   동일하게 유지한다 — 실사용자의 공유 링크·자동저장·Firestore snapshot이
   이 포맷에 의존한다. (계획서 "Step 3", 기준 픽스처는
   test/fixtures/legacy-links.json)
   ══════════════════════════════════════════════════════════════════ */
import type { Session, SearchResultRow } from './core';
import { pairKey, parseSessions } from './core';

export interface ThemeState {
  id: number;
  name: string;
  dur: number;
  raw: string;
  place: string;
  sessions: Session[];
  source: string;
  date?: string;
}

export interface TeamStep {
  id: number;
  name: string;
  t: number;
}

export interface TeamState {
  name: string;
  steps: TeamStep[];
  start: number;
  end: number;
  /* 확정한 그 순간의 결과 카드 전체(타임라인·통계) — "저장 시점이 아니라
     계산 시점의 snapshot" 원칙(§7.1)과 같은 이유로, 나중에 테마 카드를
     고쳐도 팀 패널에 뜨는 내용이 안 바뀐다. 없으면(옛 링크) 컴팩트한
     한 줄 요약으로 대체 표시한다 — steps/start/end 위의 추가 필드라
     기존 링크·자동저장·Firestore snapshot과 그대로 호환된다. */
  row?: SearchResultRow;
}

export interface OptionsState {
  oStart: string;
  oEnd: string;
  oMinGap: string;
  oMaxGap: string;
  oPartial: boolean;
  oMeal: boolean;
  oMealFrom: string;
  oMealTo: string;
  oMealMin: string;
  oMove: string;
  oTeam: boolean;
  oIncludeSoldout: boolean;
}

export interface AppState {
  themes: ThemeState[];
  moveMap: Record<string, number>;
  options: OptionsState;
  sortKey: string;
  teams: TeamState[];
  /* 이 상태를 만든 뒤 다음 새 카드가 받아야 할 id. 복원된 테마들의 id보다
     항상 커야 한다 — 안 그러면 나중에 만드는 카드가 우연히 복원된 팀의
     회차 id와 겹쳐 F-14 제외가 엉뚱한 테마를 가리킬 수 있다. */
  nextId: number;
}

const bytesToB64 = (b: Uint8Array) =>
  btoa(Array.from(b, c => String.fromCharCode(c)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64ToBytes = (str: string) =>
  Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));

const b64e = (str: string) => bytesToB64(new TextEncoder().encode(str));
const b64d = (str: string) => new TextDecoder().decode(b64ToBytes(str));

/* 지금 상태에 등장하는 매장 이름만, 한국어 로케일로 정렬해 꺼낸다.
   (index.html의 placeList() — 지운 매장 값까지 링크에 끌고 다니지 않기 위함) */
function placeList(themes: ThemeState[]): string[] {
  return [...new Set(themes.map(t => (t.place || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/* 튜플 7번째 자리(F-16). 6번째까지는 원본 index.html이 만든 바이트 그대로 두고,
   여기서만 회차 단위 정보를 싣는다 — **필요한 테마에만 붙인다**(손으로 친 테마는
   붙지 않아 옛 링크와 바이트가 완전히 같다).

   왜 필요한가: 복원은 raw 텍스트를 parseSessions()로 다시 읽는데, 그 함수는
   설계상 Session.id(감시 slotId)를 만들지 않는다(core.ts). 그래서 이 자리가
   없으면 새로고침 한 번에 감시 벨이 통째로 사라졌다 — 서버에서 불러온 회차라는
   사실(source)도 같이 날아가서 'manual'로 되돌아갔다.

   id는 배열 순번이 아니라 **시각(t)으로 다시 붙인다.** 순번은 raw를 손으로 고쳐
   회차 개수가 달라지면 조용히 어긋나지만, 시각으로 맞추면 없어진 회차는 그냥
   안 붙고 끝난다. */
interface ThemeExtra {
  i?: [number, number][];   // [회차 시각(분), 서버 slotId]
  s?: string;               // source — 'manual'/'' 은 복원이 알아서 채우므로 안 싣는다
  d?: string;                // 회차가 속한 캘린더 날짜("YYYY-MM-DD") — §4.41, 날짜 불일치 경고용
}

function themeExtra(t: ThemeState): ThemeExtra | null {
  const i = t.sessions.filter(s => s.id != null).map(s => [s.t, s.id as number] as [number, number]);
  const s = t.source && t.source !== 'manual' ? t.source : undefined;
  const d = t.date || undefined;
  if (!i.length && !s && !d) return null;
  const ex: ThemeExtra = {};
  if (i.length) ex.i = i;
  if (s) ex.s = s;
  if (d) ex.d = d;
  return ex;
}

export function serialize(state: AppState): string {
  return b64e(payloadJson(state));
}

/* serialize() 에서 base64 만 벗겨낸 것. #z=(압축 공유 링크)도 **이 JSON 을 그대로**
   싣는다 — 운반 방법만 다르고 내용은 한 바이트도 안 다르다. 이 파일 첫 주석의
   바이트 호환 약속이 지켜지는 근거가 여기다. */
function payloadJson(state: AppState): string {
  const ps = placeList(state.themes);
  const m: [string, string, number][] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const v = state.moveMap[pairKey(ps[i], ps[j])];
      if (v != null) m.push([ps[i], ps[j], v]);
    }
  }
  const o = state.options;
  return JSON.stringify({
    v: 3,
    /* 4번째 자리는 옛 "자리 고정" 값 — §4.14 후기로 없어진 개념이라 항상 0.
       6번째 자리(id)는 F-14 이후 추가됐다: 팀 배정은 이 id로 회차를 가리키므로,
       빠지면 mid-session 복원 때 F-14 제외가 조용히 어긋난다 (실측으로 확인,
       index.html에서도 같은 이유로 고쳤다). */
    t: state.themes.map(t => {
      const base = [t.name, t.dur, t.raw, 0, t.place || '', t.id];
      const ex = themeExtra(t);
      return ex ? [...base, ex] : base;
    }),
    m,
    o: [
      o.oStart, o.oEnd, o.oMinGap, o.oMaxGap,
      1, o.oPartial ? 1 : 0,
      o.oMeal ? 1 : 0, o.oMealFrom, o.oMealTo, o.oMealMin,
      o.oMove, o.oTeam ? 1 : 0,
      o.oIncludeSoldout ? 1 : 0,
    ],
    k: state.sortKey,
    tm: state.teams,
  });
}

/* ══ 공유 링크 압축 (#z=) ═════════════════════════════════════════════
   왜 공유 링크에만 붙이나: 자동저장(localStorage)·Firestore snapshot 은 크기
   압박이 없고, 압축해 두면 저장된 값을 눈으로 못 읽는다. 무엇보다 serialize()
   가 내는 바이트를 그대로 둬야 옛 링크·저장분이 안전하다. #z= 는 같은 JSON 을
   deflate 로 감싼 것뿐이고, 풀면 #s= 페이로드와 **바이트가 완전히 같다**
   (serialize.test.ts 가 이걸 못 박는다).

   실측(2026-09-01, 테마 3개·팀 0개 실제 링크): 1,583자 → 606자.
   반복이 많은 데이터라(같은 지점명·날짜·"매진") 테마가 늘어도 압축본은 거의
   안 커진다 — 테마 6개로 늘리면 #s= 는 3,027자인데 #z= 는 630자다.

   **deflateShare() 는 2차 배포 전까지 UI 에 연결하지 않는다.** 옛 번들을
   캐시한 사람이 #z= 링크를 받으면 못 읽기 때문 — 먼저 읽기(inflateShare)와
   useScheduler 의 가드를 퍼뜨리고, 그다음에 쓰기를 켠다. 순서를 바꾸면
   받는 사람이 "남의 일정 대신 자기 자동저장"을 보게 된다. */

/** deflate-raw 를 쓸 수 있는 브라우저인가. 버전으로 따지지 않고 기능으로 본다. */
export const canCompressShare = () =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/* GenericTransformStream 으로 받는 이유: CompressionStream 의 writable 은
   WritableStream<BufferSource> 라 TransformStream<Uint8Array, Uint8Array> 에
   대입이 안 된다(tsc TS2345). 둘의 공통 조상이 이거다. */
async function through(bytes: Uint8Array, t: GenericTransformStream) {
  const src = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); c.close(); },
  });
  return new Uint8Array(await new Response(src.pipeThrough(t)).arrayBuffer());
}

/** AppState → #z= 페이로드. */
export async function deflateShare(state: AppState): Promise<string> {
  const json = new TextEncoder().encode(payloadJson(state));
  return bytesToB64(await through(json, new CompressionStream('deflate-raw')));
}

/** #z= 페이로드 → #s= 페이로드(base64url JSON). restore() 에 그대로 넘긴다.
    restore() 를 안 건드리려고 일부러 base64 로 되싸서 돌려준다 — 한 번 더
    인코딩하는 값은 치르지만, 포맷을 읽는 코드가 한 벌로 유지된다. */
export async function inflateShare(z: string): Promise<string> {
  const raw = await through(b64ToBytes(z), new DecompressionStream('deflate-raw'));
  return bytesToB64(raw);
}

/* 옛 링크(v1/v2/v3early)는 id가 없다 — 그럴 때만 새 id를 매긴다.
   startId는 "지금 세션에서 이미 쓰이고 있는 가장 큰 id + 1" 을 호출부가 넘겨야
   한다(예: 이미 카드를 만졌다가 "불러오기"로 mid-session 복원하는 경우).
   기본값 1은 갓 새로고침한 페이지에서 복원하는 경우에 맞는다. */
export function restore(hash: string, startId = 1): AppState {
  const d = JSON.parse(b64d(hash));
  if (d.v !== 1 && d.v !== 2 && d.v !== 3) throw new Error('알 수 없는 링크 형식');

  let nextId = startId;
  const themes: ThemeState[] = d.t.map(
    ([name, dur, raw, _lock, place, id, ex]: [string, number, string, number, string | undefined, number | undefined, ThemeExtra | undefined]) => {
      const sessions = parseSessions(raw || '');
      /* 7번째 자리가 있으면 감시 slotId를 시각으로 되붙인다. 없는 옛 링크·자동저장은
         그대로 통과한다(=지금까지의 동작). */
      if (ex && Array.isArray(ex.i)) {
        const byT = new Map<number, number>(ex.i);
        for (const s of sessions) {
          const slotId = byT.get(s.t);
          if (slotId != null) s.id = slotId;
        }
      }
      const th: ThemeState = {
        id: id != null ? id : nextId++,
        name: name || '',
        dur,
        raw: raw || '',
        place: place || '',           // v1·v2 링크에는 없다 — 빈칸이면 이동시간이 안 붙는다
        sessions,
        source: (ex && ex.s) || (raw ? 'manual' : ''),
        date: ex?.d,
      };
      // _lock 은 옛 "자리 고정" 값 — §4.14 후기로 없어진 개념이라 읽지 않고 버린다
      return th;
    },
  );
  // 명시적 id가 있는 링크(v3current 이후)라도, 다음 카드는 그 id들보다 커야 한다.
  nextId = Math.max(nextId, ...themes.map(t => t.id + 1));

  const [a, b, c2, dd, , pt, me, mf, mt, mm, mv, tmOn, isv] = d.o as [
    string, string, string, string, unknown, number, number, string, string, string,
    string | undefined, number | undefined, number | undefined,
  ];
  // so(5번째) 슬롯은 옛 링크 호환용으로 남겨두고 쓰지 않는다 — index.html과 동일

  const moveMap: Record<string, number> = {};
  if (Array.isArray(d.m)) for (const [x, y, v] of d.m as [string, string, number][]) moveMap[pairKey(x, y)] = v;

  return {
    themes,
    moveMap,
    options: {
      oStart: a, oEnd: b, oMinGap: c2, oMaxGap: dd,
      oPartial: !!pt,
      oMeal: !!me, oMealFrom: mf, oMealTo: mt, oMealMin: mm,
      oMove: mv !== undefined ? mv : '10',   // v1/v2 링크엔 없다 — HTML 기본값(10)으로 떨어진다
      oTeam: !!tmOn,                          // 옛 링크는 tmOn이 undefined → 꺼짐
      oIncludeSoldout: !!isv,                 // 이 필드가 없던 옛 링크는 undefined → 꺼짐(안전한 기본값)
    },
    sortKey: d.k || 'gap',
    teams: Array.isArray(d.tm) ? d.tm : [],
    nextId,
  };
}

/* ── 해시 판독 ────────────────────────────────────────────────────────
   `#` 에 페이로드가 실려 있으면 그건 공유 링크다 — 우리가 읽을 수 있든 없든.
   'unknown' 이 따로 있는 이유가 이 함수의 존재 이유다: 못 읽는 공유 링크를
   "해시 없음"과 같은 값으로 뭉개면 받는 사람 자동저장이 조용히 대신 뜬다.
   훅 안에 인라인으로 두면 테스트할 방법이 없어서 밖으로 뺐다. */
export type ShareHash =
  | { kind: 'none' }                      // 공유 링크가 아니다 — 자동저장으로
  | { kind: 'plain'; payload: string }    // #s=
  | { kind: 'packed'; payload: string }   // #z=
  | { kind: 'unknown'; tag: string };     // 공유 링크인데 이 번들이 모르는 형식

export function readShareHash(hash: string): ShareHash {
  // 한 글자 + '=' 만 공유 링크로 본다. `#top` 같은 평범한 앵커는 안 걸린다.
  const m = /^#([a-z])=([\s\S]*)$/.exec(hash);
  if (!m) return { kind: 'none' };
  const [, tag, payload] = m;
  if (tag === 's') return { kind: 'plain', payload };
  if (tag === 'z') return { kind: 'packed', payload };
  return { kind: 'unknown', tag };
}

/* ── 공유 링크를 압축해서 낼 것인가 ──────────────────────────────────
   원래는 "1차(읽기) 배포 후 하루 뒤에 켠다"로 계획했다. 옛 번들을 캐시한
   사람이 #z= 를 받으면 못 읽기 때문이다(기획 §4.43). 그런데 **아직 이 앱을
   쓰는 사람이 없다** — 옛 번들을 든 사람이 0명이면 그 위험창도 0이라,
   기다릴 이유가 없어져 처음부터 켜고 나간다.

   ⚠️ 나중에 **읽는 쪽 형식을 또 바꿀 일이 생기면** 그때는 이 계산이 다르다.
   그때는 사용자가 있을 테니 읽기를 먼저 배포하고 쓰기를 나중에 켜는
   2단계로 돌아가야 한다 — 그러라고 이 스위치를 남겨 둔다. */
const SHARE_WRITE_PACKED = true;

/** 공유 링크에 붙일 해시("s=…" 또는 "z=…"). packed 인자는 테스트용이다. */
export async function shareHash(state: AppState, packed = SHARE_WRITE_PACKED): Promise<string> {
  if (packed && canCompressShare()) {
    /* 압축이 실패하면 링크를 못 만드는 게 아니라 그냥 안 쓴다 — 긴 링크는
       불편할 뿐이지만, 링크가 안 나가는 건 기능이 없어지는 것이다. */
    try { return 'z=' + await deflateShare(state); } catch { /* 아래로 */ }
  }
  return 's=' + serialize(state);
}

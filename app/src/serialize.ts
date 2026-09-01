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

const b64e = (str: string) =>
  btoa(Array.from(new TextEncoder().encode(str), c => String.fromCharCode(c)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64d = (str: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)),
  );

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
  const ps = placeList(state.themes);
  const m: [string, string, number][] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const v = state.moveMap[pairKey(ps[i], ps[j])];
      if (v != null) m.push([ps[i], ps[j], v]);
    }
  }
  const o = state.options;
  return b64e(JSON.stringify({
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
  }));
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

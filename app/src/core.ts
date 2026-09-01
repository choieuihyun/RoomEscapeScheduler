/* ══════════════════════════════════════════════════════════════════
   index.html의 @core 구간(709~889행, 2026-08-31 기준)을 그대로 옮긴 것.
   로직은 한 줄도 바꾸지 않았다 — 타입만 얹었다. parseSessions의 AM/PM·
   인접중복·12시간보정 규칙과 search()의 이동시간/식사공백/순차배정 제외
   규칙은 전부 실제 버그를 겪고 고쳐 지금 형태가 된 것이라, 재작성이 아니라
   이식이 목표다. (기획.md 2026-08-31 계획서 "Step 2" 참고)
   ══════════════════════════════════════════════════════════════════ */

/* ── 시간 유틸 ── */
export const pad = (n: number) => String(n).padStart(2, '0');
export const fmt = (m: number) => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);

export function parseClock(s: string | null | undefined): number | null {
  const m = String(s || '').trim().match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 29 || mi > 59) return null;
  return h * 60 + mi;
}

/* ── 회차 텍스트 파싱 ── */
export interface Session {
  t: number;
  soldout: boolean;
  fixed?: boolean;
  /* F-16 감시 API의 slotId. 서버에서 불러온 회차만 값이 있다 — 수동 입력·
     이미지 인식은 서버가 매긴 id가 애초에 없으므로 parseSessions()는 이
     필드를 만들지 않는다(작업명세서 §4.5). */
  id?: number;
}

/* "오전 10:30 매진 오후 12:00 매진 …" 또는 "10:30, 12:00, 1:30" 모두 처리 */
export function parseSessions(text: string | null | undefined): Session[] {
  const out: Session[] = [];
  const toks = String(text || '').split(/[\s,·|\n\r\t]+/).filter(Boolean);
  let mer: 'am' | 'pm' | null = null, sawMer = false;
  for (const tk of toks) {
    if (/오전|AM/i.test(tk) && !/\d{1,2}:\d{2}/.test(tk)) { mer = 'am'; sawMer = true; continue; }
    if (/오후|PM/i.test(tk) && !/\d{1,2}:\d{2}/.test(tk)) { mer = 'pm'; sawMer = true; continue; }
    const hit = tk.match(/(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})/i);
    if (hit) {
      let lm = mer;
      if (hit[1]) { lm = /오전|AM/i.test(hit[1]) ? 'am' : 'pm'; sawMer = true; }
      let h = +hit[2], mi = +hit[3];
      if (lm === 'pm' && h < 12) h += 12;
      if (lm === 'am' && h === 12) h = 0;
      out.push({ t: h * 60 + mi, soldout: false });
      mer = null;
      continue;
    }
    if (/매진|마감|SOLD/i.test(tk) && out.length) out[out.length - 1].soldout = true;
  }
  /* 1) 바로 옆에 같은 시각이 또 나오면 같은 칸을 두 번 읽은 것 → 접는다.
        떨어져 있는 같은 시각은 접으면 안 된다. 오전/오후가 한 바퀴 돈 것이기 때문:
        "10:30 12:00 … 9:00 10:30" 의 마지막 10:30 은 22:30 이다.
        (인접이냐 아니냐가 노이즈와 오후 한 바퀴를 가르는 기준) */
  const seq: Session[] = [];
  for (const s of out) {
    const prev = seq[seq.length - 1];
    if (prev && prev.t === s.t) { prev.soldout = prev.soldout || s.soldout; continue; }
    seq.push(s);
  }
  /* 2) 오전/오후 표기가 전혀 없으면 오름차순 가정하고 12시간 보정.
        보정한 항목에는 표시를 남긴다 — 화면에서 "내가 친 것과 다르게 읽혔다" 를
        보여주기 위해서다. 이 보정은 순서가 뒤섞이면 엉뚱한 값을 만들므로 숨기면 안 된다. */
  if (!sawMer) {
    for (let i = 1; i < seq.length; i++) {
      const before = seq[i].t;
      while (seq[i].t <= seq[i - 1].t) seq[i].t += 12 * 60;
      if (seq[i].t !== before) seq[i].fixed = true;
    }
  }
  /* 3) 보정이 끝난 절대시각 기준으로 최종 중복 제거 */
  const byT = new Map<number, Session>();
  for (const s of seq) {
    const prev = byT.get(s.t);
    if (prev) { prev.soldout = prev.soldout || s.soldout; continue; }
    byT.set(s.t, s);
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

export function sessionsToText(ss: Session[]): string {
  return ss.map(s => fmt(s.t) + (s.soldout ? ' 매진' : '')).join('  ');
}

/* ── 조합 탐색 ── */
/* 폭주 방지용 상한. §4.14 후기로 순서를 더는 탐색하지 않아(카드 배치 순서 고정),
   탐색 공간이 순열(N!)이 아니라 회차 선택(M^N)만 남아 훨씬 작아졌다 —
   테마 5개 / 회차 9~10개가 100개 안팎, 1ms 수준. 상한은 이제 실무 범위에서
   사실상 걸릴 일이 없지만, 회차를 아주 많이 넣는 극단적인 입력을 위해 남겨 둔다.
   상한에 걸리면 결과 개수 옆에 "탐색 한도 도달"로 표시한다(조용히 자르지 않는다). */
export const NODE_CAP = 800000, KEEP_CAP = 50000;

/* 매장 쌍의 키. 걷는 시간은 방향에 상관없으므로 정렬해서 한 칸만 쓴다
   (A↔B 를 두 번 적게 하면 입력만 두 배가 되고 서로 어긋날 여지가 생긴다). */
export function pairKey(a: string | null | undefined, b: string | null | undefined): string {
  const x = (a || '').trim(), y = (b || '').trim();
  return x < y ? x + '\u0000' + y : y + '\u0000' + x;
}

/* 앞 테마에서 이 테마로 오는 데 드는 이동시간.
   쌍마다 적어둔 값이 있으면 그것을 쓰고, 없으면 기본값으로 떨어진다.
   매장을 적지 않은 테마는 "모른다" 이므로 0 으로 둔다 —
   모르는 것을 지어내면 조합이 조용히 사라진다. 빈칸은 제약이 아니어야 한다. */
export function moveCost(
  fromPlace: string | null | undefined,
  toPlace: string | null | undefined,
  moveMin: number | null | undefined,
  moveMap: Record<string, number> | null | undefined,
): number {
  const a = (fromPlace || '').trim(), b = (toPlace || '').trim();
  if (!a || !b || a === b) return 0;
  if (moveMap) {
    const v = moveMap[pairKey(a, b)];
    if (v != null) return v;
  }
  return moveMin || 0;
}

export interface SearchTheme {
  id?: number;
  name?: string;
  dur: number;
  sessions: Session[];
  place?: string;
}

export interface MealOption {
  from: number;
  to: number;
  min: number;
}

export interface SearchOptions {
  startMin?: number | null;
  endMax?: number | null;
  minGap: number;
  maxGap?: number | null;
  moveMin?: number | null;
  moveMap?: Record<string, number> | null;
  excludeSoldout: boolean;
  minCount: number;
  meal?: MealOption | null;
  /* 순차 배정(F-14): 앞선 팀이 이미 확정한 회차 제외용. 테마 id + 시각 키. */
  taken?: Set<string> | null;
}

export interface PathStep {
  i: number;
  name: string;
  place: string;
  dur: number;
  start: number;
  end: number;
  soldout: boolean;
  move: number;
  /* F-16 — 이 스텝이 어느 회차(Session)에서 왔는지. 결과 타임라인에서
     감시 토글을 걸 때 쓴다. Session.id 와 마찬가지로 서버 로드분만 값이 있다. */
  sessionId?: number;
}

export interface SearchResultRow {
  steps: PathStep[];
  count: number;
  start: number;
  end: number;
  total: number;
  gaps: number[];
  varc: number;
  minGap: number;
  moveTotal: number;
  minWait: number;
}

export interface SearchOutcome {
  out: SearchResultRow[];
  capped: boolean;
}

export function search(list: SearchTheme[], o: SearchOptions): SearchOutcome {
  const n = list.length, path: PathStep[] = [], out: SearchResultRow[] = [];
  let nodes = 0, capped = false;

  function record() {
    /* 식사 공백: "공백을 줄여라" 가 아니라 "한 군데는 크게 비워라" 는 요구다.
       경로가 완성돼야 판정할 수 있으므로 가지치기가 아니라 여기서 거른다.
       창과 겹치는 길이로 따진다 — 11:00~13:00 공백은 11:30~14:00 창을 90분 채운다. */
    if (o.meal) {
      let ok = false;
      for (let i = 1; i < path.length; i++) {
        const ov = Math.min(path[i].start, o.meal.to) - Math.max(path[i - 1].end, o.meal.from);
        if (ov >= o.meal.min) { ok = true; break; }
      }
      if (!ok) return;
    }
    const gaps: number[] = [], waits: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const g = path[i].start - path[i - 1].end;
      gaps.push(g);
      waits.push(g - (path[i].move || 0));   /* 이동을 뺀, 실제로 쉬는 시간 */
    }
    const total = gaps.reduce((a, b) => a + b, 0);
    const avg = gaps.length ? total / gaps.length : 0;
    const varc = gaps.length ? Math.sqrt(gaps.reduce((a, g) => a + (g - avg) ** 2, 0) / gaps.length) : 0;
    out.push({
      steps: path.map(p => ({ ...p })), count: path.length,
      start: path[0].start, end: path[path.length - 1].end,
      total, gaps, varc, minGap: gaps.length ? Math.min(...gaps) : Infinity,
      moveTotal: path.reduce((a, p) => a + (p.move || 0), 0),
      minWait: waits.length ? Math.min(...waits) : Infinity,
    });
  }

  function dfs(curEnd: number | null, start: number) {
    if (out.length >= KEEP_CAP || nodes > NODE_CAP) { capped = true; return; }
    if (path.length >= o.minCount) record();
    /* 카드 배치 순서가 곧 방문 순서다 (§4.14 후기) — i 를 되돌아가지 않고
       start 부터만 훑으므로, 순서 자체는 절대 바뀌지 않고 "이 순서에서 어떤
       테마를 건너뛸지" 만 갈린다. 그래서 used[] 로 방문 여부를 따로 셀 필요가
       없다 — 이미 지나온 인덱스는 다시 오지 않는다. */
    for (let i = start; i < n; i++) {
      const th = list[i];
      for (const s of th.sessions) {
        if (o.excludeSoldout && s.soldout) continue;
        /* 순차 배정(F-14): 앞선 팀이 이미 확정한 회차는 이 팀의 후보에서 뺀다.
           테마 id + 시각으로 키를 잡는다 — 이름은 겹칠 수 있고 배열 인덱스는
           테마를 고치거나 순서를 바꾸면 팀마다 어긋난다. */
        if (o.taken && th.id != null && o.taken.has(th.id + '|' + s.t)) continue;
        if (o.startMin != null && s.t < o.startMin) continue;
        /* 이동시간은 "후보를 줄이는" 제약이라 가지치기로 처리한다 (식사 공백과 반대다).
           최소 공백 위에 얹는다 — 최소 공백은 정리·여유이고 이동은 그 위의 실제 소요다. */
        const move = path.length ? moveCost(path[path.length - 1].place, th.place, o.moveMin, o.moveMap) : 0;
        if (path.length) {
          const g = s.t - (curEnd as number);
          if (g < o.minGap + move) continue;
          if (o.maxGap != null && g > o.maxGap) continue;
        }
        const end = s.t + th.dur;
        if (o.endMax != null && end > o.endMax) continue;
        nodes++;
        path.push({
          i, name: th.name || ('테마 ' + (i + 1)), place: th.place || '', dur: th.dur,
          start: s.t, end, soldout: s.soldout, move, sessionId: s.id,
        });
        dfs(end, i + 1);
        path.pop();
        if (nodes > NODE_CAP) { capped = true; return; }
      }
    }
  }

  dfs(null, 0);
  return { out, capped };
}

/* ── 정렬 ── */
export interface SortDef {
  k: string;
  label: string;
  f: (a: SearchResultRow, b: SearchResultRow) => number;
}

export const SORTS: SortDef[] = [
  { k: 'gap', label: '공백 적은 순', f: (a, b) => b.count - a.count || a.total - b.total || a.end - b.end },
  { k: 'end', label: '빨리 끝나는 순', f: (a, b) => b.count - a.count || a.end - b.end || a.total - b.total },
  { k: 'even', label: '공백 고른 순', f: (a, b) => b.count - a.count || a.varc - b.varc || a.total - b.total },
  { k: 'late', label: '늦게 시작 순', f: (a, b) => b.count - a.count || b.start - a.start || a.total - b.total },
  { k: 'safe', label: '여유 있는 순', f: (a, b) => b.count - a.count || b.minGap - a.minGap || a.total - b.total },
];

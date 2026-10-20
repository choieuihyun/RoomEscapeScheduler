/* 해 본 테마 한꺼번에 넣기 — 붙여 넣은 글을 읽고(parseBulk), 서버 테마 목록에 맞추고(matchBulk),
   4개씩 나눠 보낸다(runPool). 서버는 그대로 — 기존 POST /api/me/played(멱등)를 여러 번 부른다(작업명세서 §4.9).
   형식은 한 줄에 테마 하나 "테마 | 매장 | 날짜"(테마만 필수). 엑셀·시트에서 복사한 탭 구분도 받는다. */
import { cpLen, todayKst } from './clubEvents';
import { isPlayableName, normalizeName } from './played';
import type { PlayedDto, PlayedInput, ThemeRef } from './server';

export const BULK_MAX_LINES = 1000;
export const BULK_NAME_MAX = 40;

/* AI 에게 같이 보낼 문구 — 화면의 "문구 복사"가 이걸 그대로 복사한다 */
export const AI_PROMPT = `아래는 내가 해 본 방탈출 기록이야. 한 줄에 테마 하나씩 "테마 | 매장 | 날짜" 형식으로만 바꿔 줘.
- 날짜는 2024-03-15 처럼 쓰고, 모르면 비워 둬.
- 매장(지점)을 모르면 비워 둬. 칸이 비어도 | 는 남겨 줘.
- 같은 테마가 여러 번 나오면 한 줄만 남겨 줘.
- 설명이나 표 없이 결과 줄만 보내 줘.

(여기에 내 기록을 붙여 넣기)`;

/* noname: 테마 이름이 없음(글자·숫자가 하나도 없는 것 포함) · long: 테마 40자 넘음 · storeLong: 매장 40자 넘음 · date: 날짜를 못 읽음·없는 날·미래 */
export type BulkIssue = 'noname' | 'long' | 'storeLong' | 'date';
export const ISSUE_TEXT: Record<BulkIssue, string> = {
  noname: '테마 이름이 없어요',
  long: `테마 이름이 너무 길어요(${BULK_NAME_MAX}자)`,
  storeLong: `매장 이름이 너무 길어요(${BULK_NAME_MAX}자)`,
  date: '날짜를 확인해 주세요',
};

export interface BulkLine {
  no: number;           // 붙여 넣은 글의 몇 번째 줄(1부터). 합친 줄은 처음 나온 줄
  theme: string;
  store: string;        // 없으면 ''
  date: string | null;  // YYYY-MM-DD
  rawDate: string;      // 적은 그대로 — 못 읽은 날짜를 보여 줄 때
  issues: BulkIssue[];
}
export interface BulkParse {
  lines: BulkLine[];
  merged: number;  // 겹쳐서 합친 줄 수
  over: number;    // 1000줄을 넘어 읽지 않은 줄 수
}

const FENCE = /^(```|~~~)/;
/* 줄 앞 번호·기호 — "1. " "1) " "- " "* " "• " "·". 번호는 뒤에 띄어쓰기가 있을 때만("1999", "2.5차원" 은 이름이다) */
const BULLET = /^(?:\d{1,4}\s*[.)]\s+|\d{1,4}\)|[-*]\s+|[•·▪◦]\s*)/;
const SEP_CELL = /^:?-+:?$/;
const HEAD = new Set([
  '테마', '테마이름', '테마명', '이름', '매장', '지점', '매장지점', '매장명', '지점명', '날짜', '일자', '방문일', '플레이날짜', '플레이일',
  '번호', '순번', 'no', 'theme', 'name', 'store', 'branch', 'date',
]);

/* 날짜 — 2024-03-15 · 2024.03.15 · 2024/3/15 · 24.03.15 · 2024년 3월 15일 · 2024. 3. 15. · 20240315, 뒤에 (금) 같은 요일이 붙어도 */
const DATE_RE = /^(\d{4}|\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[일.]?\s*(?:\([^)]*\))?$/;
const DATE8_RE = /^(\d{4})(\d{2})(\d{2})$/;
export const looksLikeDate = (s: string): boolean => DATE_RE.test(s.trim()) || DATE8_RE.test(s.trim());

/* 읽은 날짜(ISO), 없으면 null. bad = 적었는데 못 읽었거나 없는 날·오늘(KST) 뒤 */
export function parseDate(s: string, today: string): { iso: string | null; bad: boolean } {
  const t = s.trim();
  if (!t) return { iso: null, bad: false };
  const m = DATE_RE.exec(t) ?? DATE8_RE.exec(t);
  if (!m) return { iso: null, bad: true };
  const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1990 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { iso: null, bad: true };
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return iso > today ? { iso: null, bad: true } : { iso, bad: false };
}

const clean = (c: string) => c.replace(/\*\*|__|`/g, '').trim();

/* 한 줄을 칸으로 — | 가 있으면 |, 없고 탭이 있으면 탭, 둘 다 없으면 줄 전체가 테마.
   마크다운 표 줄(| a | b |, 앞뒤 둘 다 |)만 앞뒤 | 를 떼어 낸다 — "| 매장 | 날짜" 는 테마 칸이 빈 줄이다 */
function cellsOf(line: string): string[] {
  if (line.includes('|')) {
    const s = line.length > 1 && line.startsWith('|') && line.endsWith('|') ? line.slice(1, -1) : line;
    return s.split('|').map(clean);
  }
  if (line.includes('\t')) return line.split('\t').map(clean);
  return [clean(line)];
}

/* 붙여 넣은 글 → 줄. 빈 줄·``` 줄·표 구분 줄(| --- |)·머리줄(테마 | 매장 | 날짜)·글자 없는 줄은 건너뛴다.
   같은 테마(정규화 이름 + 정규화 매장)가 여러 번이면 하나로(가장 이른 날짜). */
export function parseBulk(text: string, today: string = todayKst()): BulkParse {
  const lines: BulkLine[] = [];
  const byKey = new Map<string, BulkLine>();
  let merged = 0, over = 0, read = 0;
  const raw = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < raw.length; i++) {
    let s = raw[i].trim();
    if (!s || FENCE.test(s)) continue;
    s = s.replace(BULLET, '').trim();
    let cells = cellsOf(s);
    const filled = cells.filter((c) => c !== '');
    if (filled.length === 0 || filled.every((c) => SEP_CELL.test(c))) continue;
    /* 머리줄 — 테마 칸까지 채워진 칸이 모두 칸 이름일 때만("| 매장" 은 테마가 빈 줄) */
    if (cells[0] !== '' && filled.every((c) => HEAD.has(normalizeName(c)))) continue;
    if (!filled.some((c) => normalizeName(c) !== '')) continue;
    if (read >= BULK_MAX_LINES) { over++; continue; }
    read++;
    /* 시트의 번호 칸(번호 | 테마 | 매장 | 날짜) — 칸이 넷 이상이고 첫 칸이 숫자뿐이면 뗀다 */
    if (cells.length >= 4 && /^\d{1,4}[.)]?$/.test(cells[0])) cells = cells.slice(1);
    let [theme = '', store = '', date = ''] = cells;
    /* "테마 | 날짜" 두 칸이면 둘째 칸이 날짜처럼 생겼을 때 날짜로 */
    if (cells.length === 2 && looksLikeDate(store)) { date = store; store = ''; }
    theme = theme.replace(BULLET, '').trim();
    const pd = parseDate(date, today);
    const issues: BulkIssue[] = [];
    if (!isPlayableName(theme)) issues.push('noname');
    else if (cpLen(theme) > BULK_NAME_MAX) issues.push('long');
    if (cpLen(store) > BULK_NAME_MAX) issues.push('storeLong');
    if (pd.bad) issues.push('date');
    const line: BulkLine = { no: i + 1, theme, store, date: pd.iso, rawDate: date, issues };
    if (issues.includes('noname')) { lines.push(line); continue; }
    const key = normalizeName(theme) + '|' + normalizeName(store);
    const first = byKey.get(key);
    if (first) {
      merged++;
      mergeInto(first, line);
      continue;
    }
    byKey.set(key, line);
    lines.push(line);
  }
  return { lines, merged, over };
}

/* 뒤에 나온 같은 줄을 앞 줄에 합친다 — 날짜는 가장 이른 것. 읽은 날짜가 생기면 날짜 문제는 없어진다 */
function mergeInto(a: BulkLine, b: BulkLine) {
  if (b.date && (!a.date || b.date < a.date)) {
    a.date = b.date;
    a.rawDate = b.rawDate;
    a.issues = a.issues.filter((x) => x !== 'date');
  }
}

/* ── 서버 테마에 맞추기 ── */

export type BulkStatus = 'found' | 'direct' | 'exists' | 'check';
export const STATUS_TEXT: Record<BulkStatus, string> = { found: '찾음', direct: '직접 기록', exists: '이미 있어요', check: '확인 필요' };

export interface BulkRow {
  line: BulkLine;
  cands: ThemeRef[];      // 같은 이름의 서버 테마가 여럿이고 매장으로 못 고른 때 — 고를 후보
  ref: ThemeRef | null;   // 찾은(고른) 서버 테마. null 이면 직접 기록
  pick: boolean;          // 매장을 골라야 저장할 수 있다
  mismatch: boolean;      // 적은 매장이 찾은 테마 매장과 전혀 다름(그래도 찾음)
  exists: boolean;        // 이미 내 기록에 있다
}

const brCore = (b: string) => normalizeName(b).replace(/점$/, '');

/* 적은 매장 글자로 이 테마를 고를 수 있나 — 정규화한 "매장+지점"과 서로 포함, 또는 매장과 지점(…점 뗀 것)이 둘 다 들어 있음 */
export function storeFits(store: string, t: ThemeRef): boolean {
  const s = normalizeName(store);
  if (!s) return false;
  const st = normalizeName(t.storeName), br = brCore(t.branchName);
  const full = st + normalizeName(t.branchName);
  return full.includes(s) || s.includes(full) || (s.includes(st) && br !== '' && s.includes(br));
}

/* 매장이 "전혀 다른가" — 매장 이름이나 지점 이름 어느 한쪽과도 겹치지 않으면 */
function storeRelated(store: string, t: ThemeRef): boolean {
  const s = normalizeName(store);
  if (!s || storeFits(store, t)) return true;
  const st = normalizeName(t.storeName), br = brCore(t.branchName);
  return (st !== '' && (s.includes(st) || st.includes(s))) || (br !== '' && (s.includes(br) || br.includes(s)));
}

/* 보낼 이름·키 — 찾았으면 서버 테마 이름, 아니면 적은 이름 */
const sendName = (r: Pick<BulkRow, 'line' | 'ref'>) => (r.ref ? r.ref.themeName : r.line.theme);

/* 서버의 같은 테마 판정(§4.9): 키가 같거나, 한쪽에 키가 없으면 정규화한 이름이 같음 */
function sameTheme(aKey: string | null, aName: string, bKey: string | null, bName: string): boolean {
  return aKey && bKey ? aKey === bKey : normalizeName(aName) === normalizeName(bName);
}

export function existsIn(r: Pick<BulkRow, 'line' | 'ref'>, mine: PlayedDto[]): boolean {
  const key = r.ref?.themeKey ?? null, name = sendName(r);
  return mine.some((p) => sameTheme(key, name, p.themeKey, p.themeName));
}

/* 저장할 수 없는 줄 — 이름 문제, 매장을 아직 안 고름, 직접 기록인데 매장이 너무 김(서버가 400) */
export function blocked(r: BulkRow): boolean {
  const is = r.line.issues;
  return is.includes('noname') || is.includes('long') || r.pick || (!r.ref && is.includes('storeLong'));
}

export function rowStatus(r: BulkRow): BulkStatus {
  if (blocked(r)) return 'check';
  if (r.exists) return 'exists';
  if (r.line.issues.includes('date')) return 'check';
  return r.ref ? 'found' : 'direct';
}

/* 처음에 체크해 둘 줄 — 찾음·직접 기록만. 이미 있어요·확인 필요는 빼 둔다(확인 필요 중 저장할 수 있는 것은 사람이 체크할 수 있다) */
export const checkedByDefault = (r: BulkRow): boolean => { const s = rowStatus(r); return s === 'found' || s === 'direct'; };

/* 매장 고르기에서 고른 것(ref, 또는 null = 직접 기록) */
export function choose(r: BulkRow, ref: ThemeRef | null, mine: PlayedDto[]): BulkRow {
  const next: BulkRow = { ...r, ref, pick: false, mismatch: false };
  next.exists = existsIn(next, mine);
  return next;
}

/* 줄마다 서버 테마(GET /api/themes)에 맞춘다. 정규화한 테마 이름이 같은 것이
   하나면 찾음(매장이 전혀 다르면 mismatch), 여럿이면 적은 매장으로 고르고 못 고르면 pick, 없으면 직접 기록.
   그다음 서버가 같은 테마로 볼 줄(키가 같거나, 한쪽에 키가 없고 이름이 같음)끼리 하나로 합친다 — 매장을 골라야 하는 줄은 빼고. */
export function matchBulk(lines: BulkLine[], themes: ThemeRef[], mine: PlayedDto[]): { rows: BulkRow[]; merged: number } {
  const idx = new Map<string, ThemeRef[]>();
  for (const t of themes) {
    const k = normalizeName(t.themeName);
    const a = idx.get(k);
    if (a) a.push(t); else idx.set(k, [t]);
  }
  const rows: BulkRow[] = [];
  const kept: BulkRow[] = [];
  let merged = 0;
  for (const line of lines) {
    let row: BulkRow = { line, cands: [], ref: null, pick: false, mismatch: false, exists: false };
    const bad = line.issues.includes('noname') || line.issues.includes('long');
    const cands = bad ? [] : idx.get(normalizeName(line.theme)) ?? [];
    if (cands.length === 1) {
      row = { ...row, ref: cands[0], mismatch: line.store !== '' && !storeRelated(line.store, cands[0]) };
    } else if (cands.length > 1) {
      const fits = line.store ? cands.filter((c) => storeFits(line.store, c)) : [];
      if (fits.length === 1) row = { ...row, ref: fits[0] };
      else row = { ...row, pick: true, cands: fits.length > 1 ? fits : cands };
    }
    row.exists = !bad && existsIn(row, mine);
    if (!bad && !row.pick) {
      const key = row.ref?.themeKey ?? null, name = sendName(row);
      const dup = kept.find((k) => sameTheme(k.ref?.themeKey ?? null, sendName(k), key, name));
      if (dup) {
        merged++;
        mergeInto(dup.line, line);
        continue;
      }
      kept.push(row);
    }
    rows.push(row);
  }
  return { rows, merged };
}

/* 보낼 몸통 — 찾았으면 키·서버 이름·테마의 지점, 아니면 적은 이름·매장 */
export function toInput(r: BulkRow): PlayedInput {
  return r.ref
    ? { themeKey: r.ref.themeKey, themeName: r.ref.themeName, branchName: r.ref.branchName, playedOn: r.line.date, source: 'MANUAL' }
    : { themeKey: null, themeName: r.line.theme, branchName: r.line.store || null, playedOn: r.line.date, source: 'MANUAL' };
}

/* 같은 이름 줄이 동시에 날아가지 않게 하는 열쇠 — 서버가 같은 테마로 볼 수 있는 줄(한쪽 키 없음 + 같은 이름)끼리 같다 */
export const raceKey = (r: BulkRow): string => normalizeName(sendName(r));

/* 요약 수 */
export function bulkSummary(rows: BulkRow[], checked: ReadonlySet<number>) {
  let exists = 0, check = 0;
  for (const r of rows) {
    const s = rowStatus(r);
    if (s === 'exists') exists++;
    else if (s === 'check') check++;
  }
  return { total: rows.length, save: checked.size, exists, check };
}

/* ── 동시 실행기 ── 한 번에 limit 개까지 보내고, 끝나는 대로 다음을 보낸다.
   개별 실패는 모으고 계속한다. fatal(로그인 만료·승인 아님)이면 새로 보내지 않고 멈춘다. signal 이 서면(창 닫힘) 새로 보내지 않는다.
   keyOf 가 같은 일은 동시에 보내지 않는다(서버의 "있나 보고 넣기"가 겹쳐 같은 테마가 두 줄이 되지 않게).
   left = 보내지 못한 것(멈춘 때·fatal 을 낸 그 일 포함) — "다시"에 실패와 함께 넣는다. */
export interface PoolResult<T, R> {
  ok: { item: T; value: R }[];
  failed: { item: T; error: unknown }[];
  left: T[];
  fatal: unknown;
  stopped: boolean;
}
export function runPool<T, R>(
  items: T[], work: (item: T) => Promise<R>,
  opts: {
    limit?: number; keyOf?: (item: T) => string; isFatal?: (e: unknown) => boolean;
    signal?: { readonly aborted: boolean }; onSettle?: (settled: number) => void;
  } = {},
): Promise<PoolResult<T, R>> {
  const limit = Math.max(1, opts.limit ?? 4);
  const queue = items.map((item, i) => ({ item, key: opts.keyOf ? opts.keyOf(item) : '#' + i }));
  const busy = new Set<string>();
  const res: PoolResult<T, R> = { ok: [], failed: [], left: [], fatal: null, stopped: false };
  let running = 0, settled = 0, halt = false, done = false;
  return new Promise((resolve) => {
    const finish = () => {
      if (done) return;
      done = true;
      res.left.push(...queue.map((q) => q.item));
      res.stopped = !!opts.signal?.aborted;
      resolve(res);
    };
    const pump = () => {
      if (halt || opts.signal?.aborted) { if (running === 0) finish(); return; }
      while (running < limit) {
        const i = queue.findIndex((q) => !busy.has(q.key));
        if (i < 0) break;
        const [{ item, key }] = queue.splice(i, 1);
        busy.add(key);
        running++;
        let p: Promise<R>;
        try { p = work(item); } catch (e) { p = Promise.reject(e); }
        p.then(
          (value) => { res.ok.push({ item, value }); },
          (error) => {
            if (opts.isFatal?.(error)) {
              if (!halt) res.fatal = error;
              halt = true;
              res.left.push(item);
            } else res.failed.push({ item, error });
          },
        ).finally(() => {
          busy.delete(key);
          running--;
          opts.onSettle?.(++settled);
          pump();
        });
      }
      if (running === 0) finish();
    };
    pump();
  });
}

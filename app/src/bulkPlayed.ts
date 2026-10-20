/* 해 본 테마 한꺼번에 넣기 — 붙여 넣은 글을 읽고(parseBulk), 서버 테마 목록에 맞추고(matchBulk),
   4개씩 나눠 보낸다(runPool). 서버는 그대로 — 기존 POST /api/me/played(멱등)를 여러 번 부른다(작업명세서 §4.9).
   형식은 한 줄에 테마 하나 "테마 | 매장 | 날짜"(테마만 필수). 엑셀·시트에서 복사한 탭 구분도 받는다.
   원칙: 잘못 읽혔을 수 있는 줄은 기본 체크로 저장되지 않게 '확인 필요'로 둔다(지우기는 하나씩뿐이라). */
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

/* 확인 필요 사유. 막는 것(체크 불가) — noname: 테마 이름이 없음(글자·숫자가 하나도 없는 것 포함) · notname: 테마 칸이 날짜·숫자뿐 ·
   long: 테마 40자 넘음 · storeLong: 매장 40자 넘음(직접 기록일 때만 막힘).
   기본 체크만 빼는 것(사람이 체크할 수 있다) — date: 날짜를 못 읽음·없는 날·미래 · format: 대부분 줄에 구분자가 있는데 이 줄만 없음 · talk: 설명 문장 */
export type BulkIssue = 'noname' | 'notname' | 'long' | 'storeLong' | 'date' | 'format' | 'talk';
export const ISSUE_TEXT: Record<BulkIssue, string> = {
  noname: '테마 이름이 없어요',
  notname: '테마 이름이 아니에요',
  long: `테마 이름이 너무 길어요(${BULK_NAME_MAX}자)`,
  storeLong: `매장 이름이 너무 길어요(${BULK_NAME_MAX}자)`,
  date: '날짜를 확인해 주세요',
  format: '형식이 달라요',
  talk: '설명 문장 같아요',
};
/* 잘못 읽혔을 수 있는 줄 — 다른 줄과 합치지 않는다(멀쩡한 줄이 체크 안 된 줄에 묻히지 않게) */
const ODD: BulkIssue[] = ['noname', 'notname', 'format', 'talk'];

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
const HEADING = /^#{1,6}\s/;   // 마크다운 제목 줄(구분자 없는 줄만)
/* 줄 앞 번호·기호 — "1. " "1) " "3)" "10." "- " "* " "• " "·". "10." 뒤가 숫자면 떼지 않는다("2.5차원", 날짜) */
const BULLET = /^(?:\d{1,4}\s*[.)]\s+|\d{1,4}\)|\d{1,4}\.(?=[^\d\s.])|[-*]\s+|[•·▪◦]\s*)/;
const SEP_CELL = /^:?-+:?$/;
const ROW_NO = /^\d{1,3}[.)]?$/;  // 번호 칸 — 1000줄까지 읽으니 세 자리까지("1999" 는 번호가 아니다)
const EDGE = /^[^\S\t]+|[^\S\t]+$/g;  // 줄 앞뒤 공백 — 탭은 남긴다(시트의 빈 첫 칸)
const ESC_BAR = '';              // \| 를 잠시 바꿔 두는 글자(구분자가 아니라 글자 |)

/* 머리줄 낱말 → 칸 종류(정규화해서 비교). skip 은 번호·비고 같은 버리는 칸 */
type HeadCol = 'theme' | 'store' | 'date' | 'skip';
const HEAD = new Map<string, HeadCol>();
for (const [col, words] of [
  ['theme', '테마 테마명 테마이름 방탈출테마 방탈출 이름 제목 theme themename name title'],
  ['store', '매장 매장명 매장이름 지점 지점명 매장지점 장소 카페 카페명 업체 업체명 store storename shop branch place cafe'],
  ['date', '날짜 일자 방문일 방문날짜 방문일자 플레이날짜 플레이일 플레이일자 플레이한날 date playedon'],
  ['skip', 'no 번호 순번 비고 메모 평점 별점 점수 후기 리뷰 한줄평 코멘트 인원 결과 성공 성공여부 탈출 탈출여부 난이도 장르 시간 소요시간 남은시간 힌트 지역 note notes memo rating review result people comment genre time region'],
] as const) for (const w of words.split(' ')) HEAD.set(w, col);
const headCol = (c: string): HeadCol | null => (c === '#' ? 'skip' : HEAD.get(normalizeName(c)) ?? null);

/* 머리줄에서 칸 순서 — 테마 칸이 없으면 null(그 머리줄은 건너뛰기만). n = 머리줄 칸 수 */
interface Cols { theme: number; store: number[]; date: number; n: number }
function colsOf(cells: string[]): Cols | null {
  let theme = -1, date = -1;
  const store: number[] = [];
  cells.forEach((c, k) => {
    const h = headCol(c);
    if (h === 'theme' && theme < 0) theme = k;
    else if (h === 'store') store.push(k);
    else if (h === 'date' && date < 0) date = k;
  });
  return theme < 0 ? null : { theme, store, date, n: cells.length };
}

/* 날짜 — 2024-03-15 · 2024.03.15 · 2024/3/15 · 24.03.15 · 2024년 3월 15일 · 2024. 3. 15. · 20240315,
   뒤에 요일이 붙어도 — (금) · 금 · 금요일 */
const DOW = String.raw`(?:\([^)]*\)|[월화수목금토일](?:요일)?)?`;
const DATE_RE = new RegExp(String.raw`^(\d{4}|\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[일.]?\s*${DOW}$`);
const DATE8_RE = new RegExp(String.raw`^(\d{4})(\d{2})(\d{2})\s*${DOW}$`);
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

const clean = (c: string) => c.replace(/\*\*|__|`/g, '').trim().replaceAll(ESC_BAR, '|');
const unbullet = (c: string) => (looksLikeDate(c) ? c : c.replace(BULLET, '').trim());
/* 테마 칸이 날짜나 숫자뿐("2024-03-15", "1999", "1 2 3") — 테마 이름이 아니다 */
const notName = (t: string) => looksLikeDate(t) || !/\p{L}/u.test(t);
/* 설명 문장 — AI 인사말·맺음말("정리해 드릴게요!", "총 12개입니다.") */
const TALK_END = /[.!?:。．！？：]$/;
const TALK_WORD = /정리했|정리해|드릴게|드렸|입니다|습니다|총\s*\d+\s*개/;

/* 한 줄을 칸으로 — | 가 있으면 |, 없고 탭이 있으면 탭, 둘 다 없으면 줄 전체가 한 칸.
   마크다운 표 줄(| a | b |, 앞뒤 둘 다 |)만 앞뒤 | 를 떼어 낸다 — "| 매장 | 날짜" 는 테마 칸이 빈 줄이다 */
function cellsOf(line: string): string[] {
  if (line.includes('|')) {
    const t = line.trim();
    const s = t.length > 1 && t.startsWith('|') && t.endsWith('|') ? t.slice(1, -1) : t;
    return s.split('|').map(clean);
  }
  if (line.includes('\t')) return line.split('\t').map(clean);
  return [clean(line)];
}

/* 머리줄이 없을 때 — 날짜 모양 칸은 어디 있든 날짜, 번호 칸은 버리고, 남은 칸(빈 칸 포함, 자리대로)을 테마 → 매장.
   그보다 남는 칸은 조용히 버린다. 남은 칸이 하나도 없으면(날짜·번호뿐) 첫 칸을 테마 자리에 둔다 — 테마 이름이 아니에요 */
function assign(cells: string[]): { theme: string; store: string; date: string } {
  let date = '';
  const rest: string[] = [];
  for (const c of cells) {
    if (looksLikeDate(c)) { if (!date) date = c; continue; }
    if (ROW_NO.test(c)) continue;
    rest.push(c);
  }
  if (!rest.some((c) => c !== '')) return { theme: cells.find((c) => c !== '') ?? '', store: '', date: '' };
  /* 날짜 모양 칸이 없으면 셋째 칸을 날짜 자리로 — "3/15" 처럼 못 읽는 날짜를 조용히 버리지 않고 '날짜를 확인해 주세요'로 */
  return { theme: rest[0], store: rest[1] ?? '', date: date || (rest[2] ?? '') };
}

/* 붙여 넣은 글 → 줄. 빈 줄·``` 줄·# 제목 줄·표 구분 줄(| --- |)·머리줄·글자 없는 줄은 건너뛴다.
   구분자는 | · 전각 ｜ · ¦ · 탭(\| 는 글자 |). 머리줄(테마 | 매장 | 날짜 처럼 칸 이름뿐인 줄)이 있으면 그 칸 순서대로 읽는다.
   같은 테마(정규화 이름 + 정규화 매장)가 여러 번이면 하나로(가장 이른 날짜). */
export function parseBulk(text: string, today: string = todayKst()): BulkParse {
  const found: { no: number; cells: string[]; sep: boolean; cols: Cols | null }[] = [];
  let cols: Cols | null = null, over = 0;
  const raw = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < raw.length; i++) {
    let s = raw[i].replace(EDGE, '');
    if (!s.trim() || FENCE.test(s.trim())) continue;
    /* 구분 글자만 | 로 바꾼다 — 칸 글자는 그대로(NFKC 하면 저장되는 이름이 바뀐다) */
    s = s.replaceAll('\\|', ESC_BAR).replace(/[｜¦]/g, '|');
    const sep = s.includes('|') || s.includes('\t');
    if (!sep && HEADING.test(s.trim())) continue;
    if (!looksLikeDate(s.split(/[|\t]/, 1)[0].trim())) s = s.replace(BULLET, '');
    const cells = cellsOf(s);
    const filled = cells.filter((c) => c !== '');
    if (filled.length === 0 || filled.every((c) => SEP_CELL.test(c))) continue;
    if (cells[0] !== '' && filled.every((c) => headCol(c) !== null)) { cols = colsOf(cells) ?? cols; continue; }
    if (!filled.some((c) => normalizeName(c) !== '')) continue;
    if (found.length >= BULK_MAX_LINES) { over++; continue; }
    found.push({ no: i + 1, cells, sep, cols });
  }

  /* 줄 절반 이상이 구분자를 가졌으면 구분자 없는 줄은 형식이 다른 줄(AI 인사말 같은 것) */
  const strict = found.filter((f) => f.sep).length * 2 >= found.length;
  const lines: BulkLine[] = [];
  const byKey = new Map<string, BulkLine>();
  let merged = 0;
  for (const f of found) {
    /* 머리줄 칸 순서는 칸 수가 같은 줄에만. 칸 수가 다른 줄(표 뒤에 직접 적은 줄 등)은 머리줄 없이 읽고 '형식이 달라요' */
    const c = f.cols && f.sep && f.cells.length === f.cols.n ? f.cols : null;
    const odd = !!f.cols && f.sep && !c;
    const at = (k: number) => f.cells[k] ?? '';
    let { theme, store, date } = c
      ? { theme: at(c.theme), store: c.store.map(at).filter(Boolean).join(' '), date: c.date < 0 ? '' : at(c.date) }
      : assign(f.cells);
    theme = unbullet(theme);
    const pd = parseDate(date, today);
    const issues: BulkIssue[] = [];
    if (!isPlayableName(theme)) issues.push('noname');
    else if (notName(theme)) issues.push('notname');
    else if (cpLen(theme) > BULK_NAME_MAX) issues.push('long');
    if (cpLen(store) > BULK_NAME_MAX) issues.push('storeLong');
    if (pd.bad) issues.push('date');
    /* 문장이면 '설명 문장 같아요' 하나만(형식이 달라요까지 겹쳐 적지 않게) */
    const words = [theme, store].filter(Boolean).join(' | ');
    if (TALK_END.test(words) || TALK_WORD.test(words)) issues.push('talk');
    else if ((strict && !f.sep) || odd) issues.push('format');
    const line: BulkLine = { no: f.no, theme, store, date: pd.iso, rawDate: date, issues };
    if (issues.some((x) => ODD.includes(x))) { lines.push(line); continue; }
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

/* 너그러운 비교 — 매장 이름이나 지점 이름 어느 한쪽과라도 겹치면 */
export function storeRelated(store: string, t: ThemeRef): boolean {
  const s = normalizeName(store);
  if (!s) return false;
  if (storeFits(store, t)) return true;
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
  return is.includes('noname') || is.includes('notname') || is.includes('long') || r.pick || (!r.ref && is.includes('storeLong'));
}

export function rowStatus(r: BulkRow): BulkStatus {
  if (blocked(r)) return 'check';
  if (r.exists) return 'exists';
  if (r.line.issues.some((x) => x === 'date' || x === 'format' || x === 'talk')) return 'check';
  return r.ref ? 'found' : 'direct';
}

/* 처음에 체크해 둘 줄, '모두'로 고를 줄 — 찾음·직접 기록만. 이미 있어요·확인 필요는 빼 둔다(확인 필요 중 막히지 않은 것은 사람이 하나씩 체크할 수 있다) */
export const checkedByDefault = (r: BulkRow): boolean => { const s = rowStatus(r); return s === 'found' || s === 'direct'; };

/* 매장 고르기에서 고른 것(ref, 또는 null = 직접 기록) */
export function choose(r: BulkRow, ref: ThemeRef | null, mine: PlayedDto[]): BulkRow {
  const next: BulkRow = { ...r, ref, pick: false };
  next.exists = existsIn(next, mine);
  return next;
}

/* 같은 이름 서버 테마(cands)에서 적은 매장으로 하나 고르기.
   매장을 안 적었으면 하나일 때만 그것, 여럿이면 고르기(pick).
   적었으면 — 딱 맞는 것(storeFits)이 하나면 그것, 아니면 너그럽게(storeRelated) 맞는 것이 하나면 그것,
   어느 것과도 안 맞으면 적은 매장 그대로 직접 기록, 여럿이면 그중에서 고르기. */
function pickRef(store: string, cands: ThemeRef[]): { ref: ThemeRef | null; pick: ThemeRef[] | null } {
  if (!store) return cands.length === 1 ? { ref: cands[0], pick: null } : { ref: null, pick: cands };
  const fits = cands.filter((c) => storeFits(store, c));
  if (fits.length === 1) return { ref: fits[0], pick: null };
  const rel = fits.length > 1 ? fits : cands.filter((c) => storeRelated(store, c));
  if (rel.length === 0) return { ref: null, pick: null };
  return rel.length === 1 ? { ref: rel[0], pick: null } : { ref: null, pick: rel };
}

/* 줄마다 서버 테마(GET /api/themes)에 맞춘다(정규화한 테마 이름이 같은 것 → pickRef, 없으면 직접 기록).
   그다음 서버가 같은 테마로 볼 줄(키가 같거나, 한쪽에 키가 없고 이름이 같음)끼리 하나로 합친다 — 키 있는 줄을 남기고,
   날짜는 가장 이른 것. 매장을 골라야 하는 줄·잘못 읽혔을 수 있는 줄은 합치지 않는다. */
export function matchBulk(lines: BulkLine[], themes: ThemeRef[], mine: PlayedDto[]): { rows: BulkRow[]; merged: number } {
  const idx = new Map<string, ThemeRef[]>();
  for (const t of themes) {
    const k = normalizeName(t.themeName);
    const a = idx.get(k);
    if (a) a.push(t); else idx.set(k, [t]);
  }
  const rows: BulkRow[] = [];
  const byKey = new Map<string, BulkRow>();     // 남긴 줄 — 키별
  const byName = new Map<string, BulkRow[]>();  // 남긴 줄 — 보낼 이름(정규화)별
  let merged = 0;
  for (const src of lines) {
    const line = { ...src };
    let row: BulkRow = { line, cands: [], ref: null, pick: false, exists: false };
    const bad = line.issues.includes('noname') || line.issues.includes('notname') || line.issues.includes('long');
    const cands = bad ? [] : idx.get(normalizeName(line.theme)) ?? [];
    if (cands.length > 0) {
      const p = pickRef(line.store, cands);
      row = p.pick ? { ...row, pick: true, cands: p.pick } : { ...row, ref: p.ref };
    }
    row.exists = !bad && existsIn(row, mine);
    if (row.pick || line.issues.some((x) => ODD.includes(x))) { rows.push(row); continue; }
    const key = row.ref?.themeKey ?? null, name = normalizeName(sendName(row));
    const same = byName.get(name);
    const dup = key ? byKey.get(key) ?? same?.find((k) => !k.ref) : same?.[0];
    if (dup) {
      merged++;
      if (!dup.ref && row.ref) {
        /* 키 없는 줄에 키 있는 줄이 겹치면 키 있는 쪽을 남긴다(같은 자리에) */
        const prev = dup.line;
        Object.assign(dup, row);
        mergeInto(dup.line, prev);
        byKey.set(key!, dup);
      } else mergeInto(dup.line, line);
      continue;
    }
    if (key) byKey.set(key, row);
    if (same) same.push(row); else byName.set(name, [row]);
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

/* 다시 보내 볼 만한 실패인가 — 400(BAD_PLAYED: 이름·글자 수)은 다시 보내도 같다 */
export const retryable = (e: unknown): boolean => (e as { status?: number } | null)?.status !== 400;

/* 창을 닫기 전에 물을 말 — 붙여 넣은 글이 있거나 미리 보기면 사라진다고, 저장 중이면 멈춘다고. 물을 게 없으면 null */
export function closeAsk(step: 'paste' | 'preview' | 'save', hasText: boolean, running: boolean): string | null {
  if (step === 'save') return running ? '저장을 멈추고 닫을까요?' : null;
  return step === 'preview' || hasText ? '붙여 넣은 내용이 사라져요. 닫을까요?' : null;
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

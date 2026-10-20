/* 카톡 제목 읽기와 붙여넣기 — 일정 만들기 창(늦게 받는 청크)에서만 쓴다. 진입 코드에 들어가지 않게 따로 둔다. */
import { fmt } from './core';
import { rollDays, todayKst, type TimeRow } from './clubEvents';
import { emptySeg, MAX_CANDIDATES, MAX_SEGS, type FormState } from './eventForm';

/* 시각 한 개: `13:40`, `13시40분`, `13시`. 24시간제라 시는 23 까지(아래에서 거른다). */
const TIME = String.raw`(?<!\d)(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})\s*분?)?)`;
/* 조각 = 테마명 + 시각, 또는 테마명 + 시각 ~ 시각(구분자 `~`·`-`·`–`) */
const PIECE = new RegExp(String.raw`^(.*?)\s*${TIME}(?:\s*[~\-–]\s*${TIME})?$`);

/* 이름 끝에 시각이나 `~`·`-`·`–` 가 남아 있으면 못 읽은 것이다(`A 13:40 14:50` 처럼) */
const RANGE_TAIL = /(?:\d:\d{2}|\d\s*시|\d\s*분)\s*$|[~\-–]\s*$/;

const toMin = (h: string, mm: string | undefined, mm2: string | undefined): number | null => {
  const hh = +h;
  const mi = mm !== undefined ? +mm : mm2 !== undefined ? +mm2 : 0;
  return hh > 23 || mi > 59 ? null : hh * 60 + mi;
};

/* 제목 앞의 `10/31`·`10/31(토)` 나 어디서든 `(10/31)`·`(10/31 토)` 한 개 — 날짜로 읽히면 떼어 내고 월·일을 돌려준다 */
const DATE_LEAD = /^(\d{1,2})\/(\d{1,2})(?:\s*\(\s*[월화수목금토일]\s*\))?(?=\s)\s*/;
const DATE_PAREN = /\(\s*(\d{1,2})\/(\d{1,2})\s*[월화수목금토일]?\s*\)/;
const validMD = (m: number, d: number): boolean => m >= 1 && m <= 12 && d >= 1 && d <= 31 && new Date(Date.UTC(2024, m - 1, d)).getUTCMonth() === m - 1;
function takeDate(piece: string): { text: string; md: [number, number] | null } {
  for (const re of [DATE_LEAD, DATE_PAREN]) {
    const m = piece.match(re);
    if (m && validMD(+m[1], +m[2])) return { text: (piece.slice(0, m.index) + ' ' + piece.slice((m.index ?? 0) + m[0].length)).trim(), md: [+m[1], +m[2]] };
  }
  return { text: piece, md: null };
}

/* 월/일 → 오늘(한국 날짜) 기준 가장 가까운 앞날(오늘 포함)의 "YYYY-MM-DD". 2/29 처럼 없는 해는 건너뛴다. */
export function nearestDate(m: number, d: number, today: string): string {
  const y0 = +today.slice(0, 4);
  for (let y = y0; y <= y0 + 8; y++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() === m - 1 && iso >= today) return iso;
  }
  return `${y0}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface KakaoSeg { themeName: string; startMin: number; endMin?: number }

/* 카톡 제목 해석. 알아본 것만 채운다 — 조각 하나라도 시각이 없거나 테마명이 비면 구간은 비운다
   (틀리게 채우는 것보다 안 채우는 게 낫다). `13:40~14:50` 같은 시간 범위는 시작·끝을 다 채우고,
   자정을 건너면(rollDays) 다음날로 본다. 그 밖에 순서가 뒤집혔으면 안 채운다. */
export function parseKakaoTitle(s: string): {
  booked: boolean | null;
  segments: KakaoSeg[];
  /* 제목에 날짜(`10/31`, `(10/31)`)가 있었으면 월·일 — 이름에서는 떼어 낸다 */
  md?: [number, number];
} {
  let rest = s.trim();
  let booked: boolean | null = null;
  /* 맨 앞 대괄호는 늘 하나 걷어 낸다 — 예약 O/X 표시면 예약 여부를 읽고, `[공지]` 같은 모르는 말이면 버린다
     (테마명 안에 남으면 틀리게 채우게 된다). */
  const lead = rest.match(/^\[([^\]]*)\]\s*/);
  if (lead) {
    const mark = lead[1].match(/^\s*예약\s*([oOxX0])\s*$/);
    if (mark) booked = mark[1] === 'x' || mark[1] === 'X' ? false : true;
    rest = rest.slice(lead[0].length);
  }
  const names: string[] = [];
  const rows: TimeRow[] = [];
  let md: [number, number] | undefined;
  for (const raw of rest.split('+')) {
    const got = takeDate(raw.trim());
    if (got.md && !md) md = got.md;
    const m = got.text.match(PIECE);
    if (!m) return { booked, segments: [] };
    const themeName = m[1].trim();
    if (!themeName || RANGE_TAIL.test(themeName)) return { booked, segments: [] };
    const start = toMin(m[2], m[3], m[4]);
    const end = m[5] === undefined ? null : toMin(m[5], m[6], m[7]);
    if (start === null || (m[5] !== undefined && end === null)) return { booked, segments: [] };
    names.push(themeName);
    rows.push({ start, end });
  }
  const rolled = rollDays(rows);
  if (!('rows' in rolled)) return { booked, segments: [] };
  const segments = rolled.rows.map((r, i): KakaoSeg =>
    r.end === null ? { themeName: names[i], startMin: r.start } : { themeName: names[i], startMin: r.start, endMin: r.end });
  return md ? { booked, segments, md } : { booked, segments };
}

/* 카톡 제목을 붙여넣었을 때. 구간을 알아보면 구간·예약을 채우고 제목은 비운다(제목은 구간으로 만들어진다).
   못 알아보면 제목만 바꾼다. 원래 폼 객체는 건드리지 않는다. */
export function applyPaste(f: FormState, title: string, today: string = todayKst()): { form: FormState; note: string } {
  const p = parseKakaoTitle(title);
  if (p.segments.length === 0) return { form: { ...f, title }, note: '' };
  const segs = p.segments.slice(0, MAX_SEGS).map((s) => ({
    ...emptySeg(), themeName: s.themeName, start: fmt(s.startMin), end: s.endMin === undefined ? '' : fmt(s.endMin),
  }));
  const bits: string[] = [];
  if (p.booked !== null) bits.push(p.booked ? '예약 완료' : '예약 전');
  bits.push(`테마 ${segs.length}개`);
  const form: FormState =
    /* 붙여넣은 첫 시각이 06시 전이면 자정 뒤 시각이라 옮긴 날짜가 맞다 — 그대로 두고 안내도 유지.
       아니면 옮긴 날짜와 무관하니 날짜를 원래대로 되돌리고 안내를 끈다 */
    p.segments[0].startMin < 6 * 60
      ? { ...f, title: '', segs, booked: p.booked ?? f.booked }
      : { ...f, title: '', segs, booked: p.booked ?? f.booked, date: f.dateMoved && f.origDate ? f.origDate : f.date, dateMoved: false, origDate: undefined };
  let note = (p.booked !== null ? '카톡 제목에서 ' : '') + bits.join(' · ') + '를 채웠어요.';
  if (!p.md) return { form, note };
  /* 제목에 날짜가 있으면: 날짜 정하기는 날짜 칸, 후보 모드는 후보에 더한다 */
  const iso = nearestDate(p.md[0], p.md[1], today);
  const label = `${p.md[0]}/${p.md[1]}`;
  if (form.dateMode === 'fixed') {
    note += ` 날짜는 ${label} 로 맞췄어요.`;
    return { form: { ...form, date: iso, dateMoved: false, origDate: undefined }, note };
  }
  if (form.candidates.includes(iso)) return { form, note: note + ` 후보에 ${label} 이 이미 있어요.` };
  if (form.candidates.length >= MAX_CANDIDATES) return { form, note: note + ` 후보가 ${MAX_CANDIDATES}개라 ${label} 은 더하지 못했어요.` };
  return { form: { ...form, candidates: [...form.candidates, iso].sort(), candidatesTouched: true }, note: note + ` 후보에 ${label} 을 더했어요.` };
}

/* 제목 칸을 벗어날 때는 구간이 비어 있고 제목에 카톡 표시(맨 앞 `[예약…]` 대괄호나 조각 사이 `+`)가 있을 때만
   카톡 제목으로 채운다 — 이미 있는 구간(지점·끝 시각)이나 "정모 19:00" 같은 평범한 제목(협의 중 일정)이
   구간으로 바뀌지 못하게. 붙여넣기는 바로 적용한다. */
const hasKakaoMarker = (t: string): boolean => /^\s*\[\s*예약/.test(t) || t.includes('+');
export const shouldApplyOnBlur = (f: FormState): boolean => f.segs.length === 0 && hasKakaoMarker(f.title);


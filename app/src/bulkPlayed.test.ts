import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT, BULK_MAX_LINES, blocked, bulkSummary, checkedByDefault, choose, matchBulk, parseBulk, parseDate, raceKey, rowStatus, runPool,
  storeFits, toInput,
} from './bulkPlayed';
import type { PlayedDto, ThemeRef } from './server';

const TODAY = '2026-10-20';
const P = (t: string) => parseBulk(t, TODAY);
const ref = (n: string, store = '키이스케이프', branch = '강남점', key = `${store}-${branch}-${n}`): ThemeRef =>
  ({ themeKey: key, themeName: n, branchName: branch, storeName: store });
const played = (o: Partial<PlayedDto>): PlayedDto => ({
  id: 1, themeKey: null, themeName: 'x', branchName: null, storeName: null, playedOn: null, source: 'MANUAL', eventId: null,
  createdAt: '2026-10-19T00:00:00Z', ...o,
});

describe('parseBulk — 칸 나누기', () => {
  it('안내 예시 세 줄: | 로 나누고, 빈 칸·없는 칸은 비운다', () => {
    const r = P('메모리컴퍼니 | 키이스케이프 강남점 | 2024-03-15\n월야애담 | 비트포비아 홍대 |\n그림자 없는 상점');
    expect(r.lines.map((l) => [l.theme, l.store, l.date])).toEqual([
      ['메모리컴퍼니', '키이스케이프 강남점', '2024-03-15'],
      ['월야애담', '비트포비아 홍대', null],
      ['그림자 없는 상점', '', null],
    ]);
    expect(r.lines.every((l) => l.issues.length === 0)).toBe(true);
    expect(r.lines.map((l) => l.no)).toEqual([1, 2, 3]);
  });
  it('| 가 없으면 탭(엑셀·시트), 둘 다 없으면 줄 전체가 테마', () => {
    const r = P('메모리컴퍼니\t키이스케이프\t2024. 3. 15.\n시간의 문 3관');
    expect(r.lines[0]).toMatchObject({ theme: '메모리컴퍼니', store: '키이스케이프', date: '2024-03-15' });
    expect(r.lines[1]).toMatchObject({ theme: '시간의 문 3관', store: '', date: null });
  });
  it('마크다운 표: 앞뒤 | 를 떼고, 구분 줄·머리줄을 건너뛴다', () => {
    const r = P('| 테마 | 매장 | 날짜 |\n| --- | :---: | --- |\n| 메모리컴퍼니 | 키이스케이프 | 2024-03-15 |\n| 월야애담 | | |');
    expect(r.lines.map((l) => [l.theme, l.store, l.date])).toEqual([
      ['메모리컴퍼니', '키이스케이프', '2024-03-15'],
      ['월야애담', '', null],
    ]);
  });
  it('AI 가 붙인 ``` 줄, 빈 줄, 글자 없는 줄(---)은 건너뛴다', () => {
    const r = P('```\n\n메모리컴퍼니 | | \n---\n```text\n   \n');
    expect(r.lines.map((l) => l.theme)).toEqual(['메모리컴퍼니']);
  });
  it('줄 앞 번호·기호를 뗀다 — 띄어쓰기 없는 숫자 이름은 그대로', () => {
    const r = P('1. 메모리컴퍼니\n2) 월야애담\n3)그림자\n- 데드맨\n• 셜록\n* 비밀의 화원\n· 고백\n1999\n2.5차원 | 매장 |');
    expect(r.lines.map((l) => l.theme)).toEqual(['메모리컴퍼니', '월야애담', '그림자', '데드맨', '셜록', '비밀의 화원', '고백', '1999', '2.5차원']);
  });
  it('굵게(**)·백틱을 걷어 낸다', () => {
    expect(P('**메모리컴퍼니** | `키이스케이프` |').lines[0]).toMatchObject({ theme: '메모리컴퍼니', store: '키이스케이프' });
  });
  it('시트 번호 칸(번호 | 테마 | 매장 | 날짜)은 뗀다', () => {
    expect(P('12 | 메모리컴퍼니 | 키이스케이프 | 2024-03-15').lines[0]).toMatchObject({ theme: '메모리컴퍼니', store: '키이스케이프', date: '2024-03-15' });
  });
  it('두 칸인데 둘째가 날짜처럼 생겼으면 날짜로', () => {
    expect(P('메모리컴퍼니 | 2024.03.15').lines[0]).toMatchObject({ store: '', date: '2024-03-15' });
    expect(P('메모리컴퍼니 | 키이스케이프').lines[0]).toMatchObject({ store: '키이스케이프', date: null });
  });
  it('CRLF 도 줄로 나눈다', () => {
    expect(P('가\r\n나\r다').lines.map((l) => l.theme)).toEqual(['가', '나', '다']);
  });
});

describe('parseBulk — 날짜', () => {
  it.each([
    ['2024-03-15', '2024-03-15'], ['2024.03.15', '2024-03-15'], ['2024/3/15', '2024-03-15'], ['24.03.15', '2024-03-15'],
    ['2024년 3월 15일', '2024-03-15'], ['2024. 3. 5.', '2024-03-05'], ['2024-03-15(금)', '2024-03-15'], ['20240315', '2024-03-15'],
    ['2026-10-20', '2026-10-20'],
  ])('%s → %s', (s, iso) => {
    expect(parseDate(s, TODAY)).toEqual({ iso, bad: false });
  });
  it.each(['2024-02-30', '2023-13-01', '2026-10-21', '2030-01-01', '어제', '3월쯤', '1980-01-01'])('%s 는 확인 필요(날짜 비움)', (s) => {
    expect(parseDate(s, TODAY)).toEqual({ iso: null, bad: true });
  });
  it('빈 날짜는 문제 아님', () => {
    expect(parseDate('  ', TODAY)).toEqual({ iso: null, bad: false });
  });
  it('2월 29일은 윤년만', () => {
    expect(parseDate('2024-02-29', TODAY).iso).toBe('2024-02-29');
    expect(parseDate('2023-02-29', TODAY).bad).toBe(true);
  });
  it('못 읽은 날짜는 줄에 date 문제로 남고 적은 글자를 둔다', () => {
    const l = P('메모리컴퍼니 | 강남 | 2024-13-45').lines[0];
    expect(l).toMatchObject({ date: null, rawDate: '2024-13-45', issues: ['date'] });
  });
});

describe('parseBulk — 이름 검사·합치기·1000줄', () => {
  it('테마가 비었거나 글자가 없으면 noname, 40자 넘으면 long, 매장 40자 넘으면 storeLong(자르지 않는다)', () => {
    const long = '가'.repeat(41), store = '나'.repeat(41);
    const r = P(` | 키이스케이프 | 2024-01-01\n!!! | 매장\n${long}\n${'가'.repeat(40)} | ${store}`);
    expect(r.lines.map((l) => l.issues)).toEqual([['noname'], ['noname'], ['long'], ['storeLong']]);
    expect(r.lines[3].store).toBe(store);
  });
  it('40자는 코드 포인트로 센다(이모지 하나 = 1)', () => {
    expect(P('😀'.repeat(39) + '가').lines[0].issues).toEqual([]);
  });
  it('같은 테마(정규화 이름 + 매장)는 하나로, 가장 이른 날짜를 남긴다', () => {
    const r = P('메모리 컴퍼니 | 키이스케이프 | 2024-05-01\n메모리컴퍼니 | 키이스케이프 | 2023-01-02\nMEMORY | x |\nmemory | X | 2022-01-01\n메모리컴퍼니 | 다른 매장 |');
    expect(r.merged).toBe(2);
    expect(r.lines.map((l) => [l.theme, l.date])).toEqual([['메모리 컴퍼니', '2023-01-02'], ['MEMORY', '2022-01-01'], ['메모리컴퍼니', null]]);
  });
  it('날짜를 못 읽은 줄에 읽은 날짜가 합쳐지면 날짜 문제가 없어진다', () => {
    const r = P('가 | | 어제\n가 | | 2024-01-01');
    expect(r.lines[0]).toMatchObject({ date: '2024-01-01', issues: [] });
  });
  it('1000줄까지만 읽고 나머지는 over 로 센다(건너뛰는 줄은 세지 않는다)', () => {
    const text = ['```', '테마 | 매장 | 날짜', ...Array.from({ length: BULK_MAX_LINES + 5 }, (_, i) => `테마${i}`), '```'].join('\n');
    const r = P(text);
    expect(r.lines).toHaveLength(BULK_MAX_LINES);
    expect(r.over).toBe(5);
  });
});

describe('matchBulk', () => {
  const themes = [
    ref('메모리컴퍼니', '키이스케이프', '강남점', 'k-mem'),
    ref('월야애담', '비트포비아', '홍대던전점', 'b-wol'),
    ref('셜록', '제로월드', '강남점', 'z-sher-gn'),
    ref('셜록', '제로월드', '홍대점', 'z-sher-hd'),
    ref('셜록', '넥스트에디션', '건대점', 'n-sher'),
  ];
  const go = (text: string, mine: PlayedDto[] = []) => matchBulk(P(text).lines, themes, mine);

  it('이름이 하나면 찾음 — 서버 이름·키·지점으로 보낸다', () => {
    const { rows } = go('메모리 컴퍼니 | 키이스케이프 강남 | 2024-03-15');
    expect(rowStatus(rows[0])).toBe('found');
    expect(rows[0].mismatch).toBe(false);
    expect(toInput(rows[0])).toEqual({ themeKey: 'k-mem', themeName: '메모리컴퍼니', branchName: '강남점', playedOn: '2024-03-15', source: 'MANUAL' });
  });
  it('매장을 적었는데 전혀 다르면 그래도 찾음 + mismatch, 일부만 맞으면 mismatch 아님', () => {
    expect(go('메모리컴퍼니 | 셜록홈즈 신촌').rows[0]).toMatchObject({ mismatch: true });
    expect(rowStatus(go('메모리컴퍼니 | 셜록홈즈 신촌').rows[0])).toBe('found');
    expect(go('메모리컴퍼니 | 키이스케이프').rows[0].mismatch).toBe(false);
    expect(go('월야애담 | 비트포비아 홍대').rows[0].mismatch).toBe(false);
    expect(go('메모리컴퍼니 | 강남').rows[0].mismatch).toBe(false);
  });
  it('같은 이름 여러 개면 적은 매장으로 고른다', () => {
    expect(go('셜록 | 제로월드 홍대').rows[0].ref?.themeKey).toBe('z-sher-hd');
    expect(go('셜록 | 넥스트에디션').rows[0].ref?.themeKey).toBe('n-sher');
    expect(go('셜록 | 홍대점 제로월드').rows[0].ref?.themeKey).toBe('z-sher-hd');
  });
  it('못 고르면 pick(확인 필요, 저장 불가) — 후보는 맞는 것들, 하나도 안 맞으면 전부', () => {
    const a = go('셜록 | 제로월드').rows[0];
    expect(a.pick).toBe(true);
    expect(a.cands.map((c) => c.themeKey)).toEqual(['z-sher-gn', 'z-sher-hd']);
    expect(rowStatus(a)).toBe('check');
    expect(blocked(a)).toBe(true);
    expect(go('셜록').rows[0].cands).toHaveLength(3);
    expect(go('셜록 | 아무데나').rows[0].cands).toHaveLength(3);
  });
  it('choose 로 고르면 찾음, null 이면 직접 기록', () => {
    const a = go('셜록').rows[0];
    const b = choose(a, themes[3], []);
    expect(rowStatus(b)).toBe('found');
    expect(toInput(b).themeKey).toBe('z-sher-hd');
    const c = choose(a, null, []);
    expect(rowStatus(c)).toBe('direct');
    expect(toInput(c)).toMatchObject({ themeKey: null, themeName: '셜록', branchName: null });
    expect(rowStatus(choose(a, themes[3], [played({ themeKey: 'z-sher-hd' })]))).toBe('exists');
  });
  it('없으면 직접 기록 — 적은 이름·매장 그대로', () => {
    const { rows } = go('그림자 없는 상점 | 동네 방탈출 | 2023-01-01');
    expect(rowStatus(rows[0])).toBe('direct');
    expect(toInput(rows[0])).toEqual({ themeKey: null, themeName: '그림자 없는 상점', branchName: '동네 방탈출', playedOn: '2023-01-01', source: 'MANUAL' });
  });
  it('이미 있어요 — 서버 판정(키가 같거나, 한쪽에 키가 없으면 이름)', () => {
    const mine = [played({ themeKey: 'k-mem', themeName: '메모리컴퍼니' }), played({ id: 2, themeName: '그림자 없는 상점', branchName: '다른 곳' }),
      played({ id: 3, themeKey: 'z-sher-gn', themeName: '셜록' })];
    const { rows } = go('메모리컴퍼니\n그림자없는상점 | 동네\n셜록 | 제로월드 홍대\n월야애담', mine);
    expect(rows.map(rowStatus)).toEqual(['exists', 'exists', 'found', 'found']);
    expect(rows.map(checkedByDefault)).toEqual([false, false, true, true]);
  });
  it('키 없는 내 기록과 이름이 같으면 찾은 테마도 이미 있어요', () => {
    expect(rowStatus(go('월야애담', [played({ themeName: '월야 애담' })]).rows[0])).toBe('exists');
  });
  it('서버가 같은 테마로 볼 줄끼리 합친다 — 같은 키, 또는 키 없이 같은 이름', () => {
    const r = go('메모리컴퍼니 | 키이스케이프 | 2024-02-01\n메모리컴퍼니 | 강남점 | 2023-02-01\n동네테마 | 가 |\n동네 테마 | 나 | 2020-01-01\n셜록 | 제로월드 강남\n셜록 | 넥스트');
    expect(r.merged).toBe(2);
    expect(r.rows.map((x) => [x.line.theme, x.line.date])).toEqual([
      ['메모리컴퍼니', '2023-02-01'], ['동네테마', '2020-01-01'], ['셜록', null], ['셜록', null],
    ]);
  });
  it('매장을 골라야 하는 줄은 합치지 않는다', () => {
    expect(go('셜록\n셜록 | 제로월드').rows).toHaveLength(2);
  });
  it('날짜 문제는 확인 필요지만 저장할 수 있다(기본 체크는 빼 둠), 이름 문제는 저장 불가', () => {
    const { rows } = go('메모리컴퍼니 | | 2099-01-01\n | 매장\n' + '가'.repeat(41));
    expect(rows.map(rowStatus)).toEqual(['check', 'check', 'check']);
    expect(rows.map(blocked)).toEqual([false, true, true]);
    expect(rows.map(checkedByDefault)).toEqual([false, false, false]);
    expect(toInput(rows[0]).playedOn).toBeNull();
  });
  it('매장 40자 초과는 직접 기록이면 저장 불가, 찾음이면 테마의 지점을 보내 저장 가능', () => {
    const s = '가'.repeat(41);
    const { rows } = go(`없는테마 | ${s}\n메모리컴퍼니 | ${s}`);
    expect(rows.map(blocked)).toEqual([true, false]);
    expect(toInput(rows[1]).branchName).toBe('강남점');
  });
  it('요약 수', () => {
    const { rows } = go('메모리컴퍼니\n셜록\n그림자\n월야애담', [played({ themeName: '월야애담' })]);
    const checked = new Set(rows.flatMap((r, i) => (checkedByDefault(r) ? [i] : [])));
    expect(bulkSummary(rows, checked)).toEqual({ total: 4, save: 2, exists: 1, check: 1 });
  });
  it('raceKey 는 보낼 이름 정규화', () => {
    expect(raceKey(go('메모리 컴퍼니').rows[0])).toBe('메모리컴퍼니');
  });
});

describe('storeFits', () => {
  const t = ref('x', '키이스케이프', '강남점');
  it.each(['키이스케이프 강남점', '키이스케이프강남', '강남', '강남점', '키이스케이프', '강남 키이스케이프', '키이 스케이프 강남'])('%s 는 맞음', (s) => {
    expect(storeFits(s, t)).toBe(true);
  });
  it.each(['홍대', '제로월드', ''])('%s 는 안 맞음', (s) => {
    expect(storeFits(s, t)).toBe(false);
  });
});

describe('AI 정리 문구', () => {
  it('형식과 자리 표시가 들어 있다', () => {
    expect(AI_PROMPT).toContain('"테마 | 매장 | 날짜"');
    expect(AI_PROMPT.endsWith('(여기에 내 기록을 붙여 넣기)')).toBe(true);
  });
});

/* ── 동시 실행기 ── 가짜 일(손으로 끝내는 약속)로 동시 수·실패·멈춤을 본다 */
function deferredWork() {
  const pend = new Map<number, { res: (v: string) => void; rej: (e: unknown) => void }>();
  let inFlight = 0, peak = 0;
  const started: number[] = [];
  const work = (n: number) => new Promise<string>((res, rej) => {
    inFlight++; peak = Math.max(peak, inFlight); started.push(n);
    pend.set(n, { res: (v) => { inFlight--; res(v); }, rej: (e) => { inFlight--; rej(e); } });
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { work, pend, started, tick, peak: () => peak };
}

describe('runPool', () => {
  it('한 번에 4개까지, 끝나는 대로 다음', async () => {
    const d = deferredWork();
    const items = Array.from({ length: 10 }, (_, i) => i);
    const seen: number[] = [];
    const p = runPool(items, d.work, { limit: 4, onSettle: (n) => seen.push(n) });
    await d.tick();
    expect(d.started).toEqual([0, 1, 2, 3]);
    d.pend.get(1)!.res('a');
    await d.tick();
    expect(d.started).toEqual([0, 1, 2, 3, 4]);
    for (let i = 0; i < 10; i++) { d.pend.get(i)?.res('ok'); await d.tick(); }
    for (let i = 0; i < 10; i++) { d.pend.get(i)?.res('ok'); await d.tick(); }
    const r = await p;
    expect(d.peak()).toBe(4);
    expect(r.ok).toHaveLength(10);
    expect(r.failed).toEqual([]);
    expect(r.left).toEqual([]);
    expect(seen[seen.length - 1]).toBe(10);
  });
  it('개별 실패는 모으고 계속한다', async () => {
    const r = await runPool([1, 2, 3, 4, 5, 6], async (n) => { if (n % 2 === 0) throw new Error('e' + n); return n; }, { limit: 4 });
    expect(r.ok.map((x) => x.item).sort()).toEqual([1, 3, 5]);
    expect(r.failed.map((x) => (x.error as Error).message).sort()).toEqual(['e2', 'e4', 'e6']);
    expect(r.fatal).toBeNull();
  });
  it('fatal(401·403)이면 새로 보내지 않고 멈춘다 — 보내지 못한 것과 fatal 낸 것은 left', async () => {
    const calls: number[] = [];
    const isFatal = (e: unknown) => (e as { status?: number }).status === 401;
    const r = await runPool([1, 2, 3, 4, 5, 6, 7, 8], async (n) => {
      calls.push(n);
      if (n === 2) throw Object.assign(new Error('x'), { status: 401 });
      await new Promise((res) => setTimeout(res, 5));
      return n;
    }, { limit: 2, isFatal });
    expect(r.fatal).toMatchObject({ status: 401 });
    expect(calls).toEqual([1, 2]);
    expect(r.ok.map((x) => x.item)).toEqual([1]);
    expect(r.left.sort()).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
  it('signal 이 서면 새로 보내지 않는다 — 이미 보낸 것은 결과에 남는다', async () => {
    const d = deferredWork();
    const signal = { aborted: false };
    const p = runPool([0, 1, 2, 3, 4, 5, 6], d.work, { limit: 4, signal });
    await d.tick();
    signal.aborted = true;
    for (const i of [0, 1, 2, 3]) d.pend.get(i)!.res('ok');
    const r = await p;
    expect(d.started).toEqual([0, 1, 2, 3]);
    expect(r.stopped).toBe(true);
    expect(r.ok).toHaveLength(4);
    expect(r.left).toEqual([4, 5, 6]);
  });
  it('같은 열쇠는 동시에 보내지 않는다(다른 것을 먼저 보낸다)', async () => {
    const d = deferredWork();
    const key = (n: number) => (n < 3 ? 'same' : 'k' + n);
    const p = runPool([0, 1, 2, 3, 4], d.work, { limit: 4, keyOf: key });
    await d.tick();
    expect(d.started).toEqual([0, 3, 4]);
    d.pend.get(0)!.res('ok');
    await d.tick();
    expect(d.started).toEqual([0, 3, 4, 1]);
    d.pend.get(1)!.res('ok'); await d.tick();
    for (const i of [2, 3, 4]) d.pend.get(i)!.res('ok');
    const r = await p;
    expect(r.ok).toHaveLength(5);
  });
  it('일이 동기로 던져도 실패로 모은다, 빈 목록은 바로 끝', async () => {
    const r = await runPool([1], () => { throw new Error('sync'); });
    expect(r.failed).toHaveLength(1);
    expect(await runPool([], async () => 1)).toMatchObject({ ok: [], failed: [], left: [], fatal: null, stopped: false });
  });
});

/* 400줄 읽기·맞추기 시간 — 화면이 버벅이지 않을 만큼(넉넉히 200ms 안) */
describe('성능', () => {
  it('400줄 × 테마 3000개', () => {
    const themes = Array.from({ length: 3000 }, (_, i) => ref(`테마${i}`, `매장${i % 40}`, `지점${i % 7}점`, `k${i}`));
    const mine = Array.from({ length: 300 }, (_, i) => played({ id: i, themeKey: `k${i * 3}`, themeName: `테마${i * 3}` }));
    const text = Array.from({ length: 400 }, (_, i) => `${i + 1}. 테마${i * 5} | 매장${i % 40} 지점${i % 7} | 2023-0${(i % 9) + 1}-1${i % 9}`).join('\n');
    const t0 = performance.now();
    const { rows } = matchBulk(P(text).lines, themes, mine);
    const ms = performance.now() - t0;
    expect(rows).toHaveLength(400);
    expect(ms).toBeLessThan(200);
  });
});

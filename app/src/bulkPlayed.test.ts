import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT, BULK_MAX_LINES, blocked, bulkSummary, checkedByDefault, choose, closeAsk, matchBulk, parseBulk, parseDate, raceKey, retryable,
  rowStatus, runPool, storeFits, storeRelated, toInput,
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
    const r = P('메모리컴퍼니 | 키이스케이프 강남점 | 2024-03-15\n월야애담 | 비트포비아 홍대 |\n그림자 없는 상점 | |');
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
  it('줄 앞 번호·기호를 뗀다 — 숫자가 이어지는 이름은 그대로, 숫자뿐인 줄은 테마 이름이 아니에요', () => {
    const r = P('1. 메모리컴퍼니\n2) 월야애담\n3)그림자\n- 데드맨\n• 셜록\n* 비밀의 화원\n· 고백\n1999\n2.5차원 | 매장 |');
    expect(r.lines.map((l) => l.theme)).toEqual(['메모리컴퍼니', '월야애담', '그림자', '데드맨', '셜록', '비밀의 화원', '고백', '1999', '2.5차원']);
    expect(r.lines[7].issues).toEqual(['notname']);
    expect(r.lines[8].issues).toEqual([]);
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
    expect(r.lines.map((l) => l.issues)).toEqual([['noname'], ['noname'], ['long', 'format'], ['storeLong']]);
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
    expect(toInput(rows[0])).toEqual({ themeKey: 'k-mem', themeName: '메모리컴퍼니', branchName: '강남점', playedOn: '2024-03-15', source: 'MANUAL' });
  });
  it('적은 매장이 매장·지점 어느 쪽과라도 겹치면 찾음, 전혀 다르면 적은 매장 그대로 직접 기록(키 없이)', () => {
    for (const s of ['키이스케이프', '강남', '서울 강남', '강남역', '키이 강남', '키스케 강남']) expect(rowStatus(go(`메모리컴퍼니 | ${s}`).rows[0])).toBe('found');
    expect(rowStatus(go('월야애담 | 비트포비아 홍대').rows[0])).toBe('found');
    for (const s of ['셜록홈즈 신촌', '서울', '역삼']) {
      const r = go(`메모리컴퍼니 | ${s} | 2024-01-01`).rows[0];
      expect(rowStatus(r)).toBe('direct');
      expect(toInput(r)).toEqual({ themeKey: null, themeName: '메모리컴퍼니', branchName: s, playedOn: '2024-01-01', source: 'MANUAL' });
    }
  });
  it('같은 이름 여러 개 — 딱 맞는 것 하나, 아니면 너그럽게 맞는 것 하나면 찾음, 하나도 안 맞으면 직접 기록', () => {
    expect(go('셜록 | 강남').rows[0].ref?.themeKey).toBe('z-sher-gn');
    expect(go('셜록 | 넥스트에디션 신촌').rows[0].ref?.themeKey).toBe('n-sher');
    const d = go('셜록 | 아무데나').rows[0];
    expect([d.pick, d.ref, rowStatus(d), toInput(d).branchName]).toEqual([false, null, 'direct', '아무데나']);
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
    const { rows } = go('메모리컴퍼니 |\n그림자없는상점 | 동네\n셜록 | 제로월드 홍대\n월야애담 |', mine);
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
    const { rows } = go(`없는테마 | ${s}\n메모리컴퍼니 | 키이스케이프 강남점 ${s}`);
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

/* ── 검토 수정(6cfcdad) — 검토자 확인용 입력을 그대로 가져와 새 규칙의 기대값을 적었다.
   원칙: 잘못 읽혔을 수 있는 줄은 기본 체크로 저장되지 않는다 ── */
const cut = (t: string) => P(t).lines.map((l) => [l.theme, l.store, l.date ?? l.rawDate, l.issues.join(',')]);

describe('검토 수정 — 구분자', () => {
  it('전각 ｜ · ¦ 도 구분자 — 칸 글자는 NFKC 하지 않는다(저장되는 이름 그대로)', () => {
    expect(cut('메모리컴퍼니 ｜ 강남 ｜ 2024-03-15')).toEqual([['메모리컴퍼니', '강남', '2024-03-15', '']]);
    expect(cut('메모리컴퍼니｜강남｜2024.03.15')).toEqual([['메모리컴퍼니', '강남', '2024-03-15', '']]);
    expect(cut('메모리컴퍼니 ¦ 강남 ¦ 2024-03-15')).toEqual([['메모리컴퍼니', '강남', '2024-03-15', '']]);
    expect(cut('ＭＥＭＯＲＹ ｜ 키이스케이프　강남')).toEqual([['ＭＥＭＯＲＹ', '키이스케이프　강남', '', '']]);
  });
  it('\\| 는 글자 | (구분자 아님)', () => {
    expect(cut('A\\|B | 강남 | 2024-03-15')).toEqual([['A|B', '강남', '2024-03-15', '']]);
  });
  it('탭 — 줄 앞뒤 탭을 지우지 않는다(시트의 빈 첫 칸은 테마 없음)', () => {
    expect(cut('메모리컴퍼니\t강남\t2024-03-15\n월야\t\t\n\t강남\t2024-01-01')).toEqual([
      ['메모리컴퍼니', '강남', '2024-03-15', ''], ['월야', '', '', ''], ['', '강남', '2024-01-01', 'noname'],
    ]);
  });
  it('CRLF·앞뒤 | 섞임', () => {
    expect(cut('메모리컴퍼니 | 강남 | 2024-03-15\r\n월야애담 | | \r\n')).toEqual([['메모리컴퍼니', '강남', '2024-03-15', ''], ['월야애담', '', '', '']]);
    expect(cut('메모리컴퍼니 | 강남 | 2024-03-15 |')).toEqual([['메모리컴퍼니', '강남', '2024-03-15', '']]);
    expect(cut('메모리컴퍼니 || 2024-03-15')).toEqual([['메모리컴퍼니', '', '2024-03-15', '']]);
    expect(cut('| 메모리컴퍼니 | 강남 | 2024-03-15')[0][3]).toBe('noname');
  });
});

describe('검토 수정 — 머리줄로 칸 맞추기', () => {
  it.each([
    ['마크다운 표', '| 테마 | 매장 | 날짜 |\n|---|---|---|\n| 메모리컴퍼니 | 키이스케이프 강남점 | 2024-03-15 |', ['메모리컴퍼니', '키이스케이프 강남점', '2024-03-15', '']],
    ['앞뒤 공백·정렬 구분 줄', '| 테마 | 매장 | 날짜 |   \n| :--- | :---: | ---: |\n| 메모리컴퍼니 | 키이스케이프 강남점 | 2024-03-15 |  ', ['메모리컴퍼니', '키이스케이프 강남점', '2024-03-15', '']],
    ['바깥 | 없는 표', '테마 | 매장 | 날짜\n--- | --- | ---\n메모리컴퍼니 | 강남 | 2024.3.15(금)', ['메모리컴퍼니', '강남', '2024-03-15', '']],
    ['# 번호 칸', '| # | 테마 | 매장 | 날짜 |\n|---|---|---|---|\n| 1 | 메모리컴퍼니 | 강남 | 2024-03-15 |', ['메모리컴퍼니', '강남', '2024-03-15', '']],
    ['No 칸, 매장 칸 없음', '| No | 테마 | 날짜 |\n|---|---|---|\n| 1 | 메모리컴퍼니 | 2024-03-15 |', ['메모리컴퍼니', '', '2024-03-15', '']],
    ['매장·지점 따로 → 이어 붙임', '| 테마 | 매장 | 지점 | 날짜 |\n|---|---|---|---|\n| 메모리컴퍼니 | 키이스케이프 | 강남점 | 2024-03-15 |', ['메모리컴퍼니', '키이스케이프 강남점', '2024-03-15', '']],
    ['비고 칸은 버림', '| 테마 | 매장 | 날짜 | 비고 |\n|---|---|---|---|\n| 메모리컴퍼니 | 강남 | 2024-03-15 | 재밌음! |', ['메모리컴퍼니', '강남', '2024-03-15', '']],
    ['순서가 다른 머리줄', '날짜 | 매장 | 테마 | 평점\n2024-03-15 | 강남 | 메모리컴퍼니 | 5', ['메모리컴퍼니', '강남', '2024-03-15', '']],
    ['탭 머리줄', '테마\t매장\t날짜\n메모리컴퍼니\t강남\t2024-03-15', ['메모리컴퍼니', '강남', '2024-03-15', '']],
    ['영어 머리줄', 'Theme | Store | Date\nA | B | 2024-01-01', ['A', 'B', '2024-01-01', '']],
    ['테마 이름 · 매장(지점) · 플레이 날짜', '테마 이름 | 매장(지점) | 플레이 날짜\nA | B | 2024-01-01', ['A', 'B', '2024-01-01', '']],
    ['테마명 · 방문 날짜', '테마명 | 매장 | 방문 날짜\nA | B | 2024-01-01', ['A', 'B', '2024-01-01', '']],
    ['방탈출 테마 · 카페', '방탈출 테마 | 카페 | 일자\n셜록 | 홍대 | 2024-01-01', ['셜록', '홍대', '2024-01-01', '']],
    ['``` 안의 표', '```markdown\n| 테마 | 매장 | 날짜 |\n|---|---|---|\n| a테마 | b | 2024-03-15 |\n```', ['a테마', 'b', '2024-03-15', '']],
  ])('%s', (_, text, want) => {
    expect(cut(text)).toEqual([want]);
  });
  it('# 제목 줄·머리줄 자체는 건너뛴다, 인사말 뒤에 나온 표 머리줄도', () => {
    expect(cut('# 내 방탈출 기록\n## 2024년\n메모리컴퍼니 | 강남 |\n월야애담 | 홍대 |')).toEqual([['메모리컴퍼니', '강남', '', ''], ['월야애담', '홍대', '', '']]);
    expect(cut('정리했어요.\n\n| 번호 | 테마 | 날짜 |\n|---|---|---|\n| 1 | 메모리컴퍼니 | 2024-03-15 |').slice(1)).toEqual([['메모리컴퍼니', '', '2024-03-15', '']]);
  });
});

describe('검토 수정 — 머리줄이 없을 때 칸 배정', () => {
  it('날짜 모양 칸은 자리와 상관없이 날짜, 번호 칸은 버리고, 남은 칸을 테마 → 매장', () => {
    expect(cut('2024-03-15 | 메모리컴퍼니 | 강남')).toEqual([['메모리컴퍼니', '강남', '2024-03-15', '']]);
    expect(cut('2024-03-15 | 메모리컴퍼니')).toEqual([['메모리컴퍼니', '', '2024-03-15', '']]);
    expect(cut('1 | 메모리컴퍼니 | 2024-03-15')).toEqual([['메모리컴퍼니', '', '2024-03-15', '']]);
    expect(cut('12 | 메모리컴퍼니 | 키이스케이프 | 2024-03-15')).toEqual([['메모리컴퍼니', '키이스케이프', '2024-03-15', '']]);
    expect(cut('2024. 3. 15. | 메모리컴퍼니')).toEqual([['메모리컴퍼니', '', '2024-03-15', '']]);
  });
  it('남는 칸은 조용히 버린다', () => {
    expect(cut('메모리 | 컴퍼니 | 강남 | 2024-03-15')).toEqual([['메모리', '컴퍼니', '2024-03-15', '']]);
    expect(cut('A|B | 강남 | 2024-03-15')).toEqual([['A', 'B', '2024-03-15', '']]);
  });
  it('날짜 모양 칸이 없으면 셋째 칸이 날짜 자리 — 못 읽으면 날짜를 확인해 주세요', () => {
    expect(cut('메모리 | 강남 | 3/15')).toEqual([['메모리', '강남', '3/15', 'date']]);
    expect(cut('메모리 | 강남 | 2024-03-15 14:30')).toEqual([['메모리', '강남', '2024-03-15 14:30', 'date']]);
  });
  it('테마 자리가 날짜·숫자뿐이면 테마 이름이 아니에요(체크 불가)', () => {
    const themes = [ref('메모리컴퍼니', '키이스케이프', '강남점', 'k-mem')];
    for (const t of ['2024-03-15', '2024-03-15\n2024-04-01', '1999 | 강남 | 2024-03-15', '1 2 3 | 강남 |', '1 | 2024-03-15', '7']) {
      const { rows } = matchBulk(P(t).lines, themes, []);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.line.issues).toContain('notname');
        expect([rowStatus(r), blocked(r), checkedByDefault(r)]).toEqual(['check', true, false]);
      }
    }
  });
});

describe('검토 수정 — 잡음 줄은 기본 체크 해제', () => {
  const themes = [ref('메모리컴퍼니', '키이스케이프', '강남점', 'k-mem'), ref('월야애담', '비트포비아', '홍대던전점', 'b-wol')];
  const look = (t: string) => matchBulk(P(t).lines, themes, []).rows.map((r) => [r.line.theme, rowStatus(r), checkedByDefault(r), blocked(r), r.line.issues.join(',')]);

  it('AI 인사말·맺음말(문장) — 체크 안 됨, 고를 수는 있다', () => {
    expect(look('네, 정리해 드릴게요!\n\n메모리컴픈니 | 강남 | 2024-03-15\n\n총 1개입니다.')).toEqual([
      ['네, 정리해 드릴게요!', 'check', false, false, 'talk'],
      ['메모리컴픈니', 'direct', true, false, ''],
      ['총 1개입니다.', 'check', false, false, 'talk'],
    ]);
    expect(look('네, 정리해 드릴게요!\n메모리컴퍼니 | 강남 | 2024-03-15\n총 1개입니다.').map((r) => r[2])).toEqual([false, true, false]);
  });
  it('문장 판정 — 콜론·물음표로 끝남, "정리했"·"총 n개" 포함. 날짜 칸의 마침표는 아님', () => {
    expect(look('아래처럼 정리했어요\n내 기록 목록:\n총 12 개\n메모리컴퍼니\n월야애담').map((r) => r[4])).toEqual(['talk', 'talk', 'talk', '', '']);
    expect(look('메모리컴퍼니 | 강남 | 2024. 3. 15.')[0]).toEqual(['메모리컴퍼니', 'found', true, false, '']);
  });
  it('구분자 있는 줄이 절반 이상이면 구분자 없는 줄은 형식이 달라요(체크 안 됨, 고를 수는 있다)', () => {
    expect(look('메모리컴퍼니 | 강남 |\n월야애담 | 홍대 |\n여기까지 기록\n그림자 없는 상점')).toEqual([
      ['메모리컴퍼니', 'found', true, false, ''],
      ['월야애담', 'found', true, false, ''],
      ['여기까지 기록', 'check', false, false, 'format'],
      ['그림자 없는 상점', 'check', false, false, 'format'],
    ]);
  });
  it('구분자 있는 줄이 절반 미만이면(테마 이름 목록) 지금처럼 체크', () => {
    expect(look('메모리컴퍼니\n월야애담\n그림자 없는 상점 | 동네').map((r) => [r[1], r[2]])).toEqual([['found', true], ['found', true], ['direct', true]]);
  });
  it('잘못 읽혔을 수 있는 줄은 멀쩡한 줄과 합치지 않는다', () => {
    const r = matchBulk(P('메모리컴퍼니 | 강남 | 2024-03-15\n메모리컴퍼니.').lines, themes, []);
    expect(r.merged).toBe(0);
    expect(r.rows.map(checkedByDefault)).toEqual([true, false]);
  });
});

describe("검토 수정 — '모두'는 고를 수 있는 줄만", () => {
  it('찾음·직접 기록만 — 확인 필요(날짜·형식·문장 포함)·이미 있어요는 빠진다', () => {
    const themes = [ref('메모리컴퍼니', '키이스케이프', '강남점', 'k-mem')];
    const { rows } = matchBulk(P('메모리컴퍼니 | 강남 | 2024-03-15\n동네테마 | 동네 |\n이미한것 | | \n날짜틀림 | | 2099-01-01\n형식다름\n안녕하세요.').lines, themes,
      [played({ themeName: '이미한것' })]);
    expect(rows.map(rowStatus)).toEqual(['found', 'direct', 'exists', 'check', 'check', 'check']);
    expect(rows.flatMap((r, i) => (checkedByDefault(r) ? [i] : []))).toEqual([0, 1]);
  });
});

describe('검토 수정 — 줄 합치기는 키 있는 줄을 남긴다', () => {
  const themes = [ref('메모리컴퍼니', '키이스케이프', '강남점', 'k-mem')];
  it('키 없는 줄이 먼저여도 키 있는 줄이 남는다(날짜는 가장 이른 것)', () => {
    const r = matchBulk(P('메모리컴퍼니 | 서울 | 2023-01-01\n메모리컴퍼니 | 강남 | 2024-01-01').lines, themes, []);
    expect(r.merged).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(toInput(r.rows[0])).toEqual({ themeKey: 'k-mem', themeName: '메모리컴퍼니', branchName: '강남점', playedOn: '2023-01-01', source: 'MANUAL' });
  });
  it('키 있는 줄이 먼저면 그대로, 이미 있어요도 키로 다시 본다', () => {
    const r = matchBulk(P('메모리컴퍼니 | 강남\n메모리컴퍼니 | 서울 | 2022-05-05').lines, themes, [played({ themeKey: 'k-mem', themeName: '메모리컴퍼니' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ ref: { themeKey: 'k-mem' }, exists: true });
    expect(r.rows[0].line.date).toBe('2022-05-05');
  });
  it('입력 줄을 바꾸지 않는다', () => {
    const lines = P('메모리컴퍼니 | 서울 | 2023-01-01\n메모리컴퍼니 | 강남 | 2024-01-01').lines;
    const before = JSON.stringify(lines);
    matchBulk(lines, themes, []);
    expect(JSON.stringify(lines)).toBe(before);
  });
  it('1000줄 — 같은 이름 키 없는 줄 500쌍을 합친다(빠르게)', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `테마${i % 500} | 매장${i} | 2024-01-${String((i % 28) + 1).padStart(2, '0')}`).join('\n');
    const lines = P(text).lines;
    expect(lines).toHaveLength(1000);
    const t0 = performance.now();
    const r = matchBulk(lines, themes, []);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.rows).toHaveLength(500);
    expect(r.merged).toBe(500);
    expect(r.rows[0].line.date).toBe('2024-01-01');
  });
});

describe('검토 수정 — 작은 것', () => {
  it.each([
    ['2024-03-15 금', '2024-03-15'], ['2024년 3월 15일 금요일', '2024-03-15'], ['2024-03-15 (금요일)', '2024-03-15'],
    ['2024. 3. 15. (금)', '2024-03-15'], ['20240315 금', '2024-03-15'],
  ])('요일 꼬리 %s → %s', (s, iso) => {
    expect(parseDate(s, TODAY)).toEqual({ iso, bad: false });
  });
  it('띄어쓰기 없는 번호 떼기 — 10.그림자, 3.월야애담2. 뒤가 숫자면 그대로(2.5차원)', () => {
    expect(cut('1. 메모리컴퍼니 | 강남 | 2024-03-15\n2) 월야애담\n10.그림자\n3.월야애담2\n2.5차원').map((l) => l[0]))
      .toEqual(['메모리컴퍼니', '월야애담', '그림자', '월야애담2', '2.5차원']);
  });
  it('다시 보낼 실패 — 400(이름 문제)은 빼고, 나머지(5xx·연결 끊김)는 다시', () => {
    expect(retryable(Object.assign(new Error('x'), { status: 400, body: { error: 'BAD_PLAYED' } }))).toBe(false);
    expect(retryable(Object.assign(new Error('x'), { status: 500 }))).toBe(true);
    expect(retryable(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('닫기 전에 묻기 — 붙여 넣은 글이 있거나 미리 보기면, 저장 중이면', () => {
    expect(closeAsk('paste', false, false)).toBeNull();
    expect(closeAsk('paste', true, false)).toBe('붙여 넣은 내용이 사라져요. 닫을까요?');
    expect(closeAsk('preview', false, false)).toBe('붙여 넣은 내용이 사라져요. 닫을까요?');
    expect(closeAsk('save', true, true)).toBe('저장을 멈추고 닫을까요?');
    expect(closeAsk('save', true, false)).toBeNull();
  });
  it('storeRelated — 매장이나 지점 한쪽과 겹치면', () => {
    const t = ref('x', '키이스케이프', '강남점');
    expect(['서울 강남', '강남역', '키이', '키이스케이프 홍대'].map((s) => storeRelated(s, t))).toEqual([true, true, true, true]);
    expect(['서울', '역삼', ''].map((s) => storeRelated(s, t))).toEqual([false, false, false]);
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

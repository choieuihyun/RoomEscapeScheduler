/**
 * test/acceptance.mjs(2026-08-31 기준, index.html @core 구간을 정규식으로 잘라 실행)의
 * 전체 검사 내용을 Vitest로 그대로 옮긴 버전 — core.ts를 직접 import한다.
 * 정규식 추출 해킹이 진짜 import로 바뀐 것 말고는 검사 내용을 하나도 바꾸지 않았다.
 * index.html은 이 파일과 무관하게 계속 서빙되고, 원본 test/acceptance.mjs도 그대로 남아
 * 있다 — 두 테스트가 같은 검사를 각자의 구현(구 JS / 신 TS)에 대해 통과시켜야
 * "이식이 행동을 안 바꿨다"는 걸 증명한다.
 */
import { describe, expect, it } from 'vitest';
import {
  fmt,
  mdWeekday,
  monthGrid,
  moveCost,
  pairKey,
  parseSessions,
  search,
  sessionsToText,
  SORTS,
  toISO,
  type SearchTheme,
} from './core';

describe('[1] 회차 텍스트 파싱 (requirements.md §2.2)', () => {
  it('오전/오후 표기 없음 → 오름차순 12시간 보정', () => {
    expect(parseSessions('10:30, 12:00, 1:30, 3:00').map(s => fmt(s.t)))
      .toEqual(['10:30', '12:00', '13:30', '15:00']);
  });

  it('오전·오후 표기 + 매진 플래그', () => {
    expect(parseSessions('오전 10:30 매진 오후 12:00 오후 1:30 매진').map(s => fmt(s.t) + (s.soldout ? '/매진' : '')))
      .toEqual(['10:30/매진', '12:00', '13:30/매진']);
  });

  it('오후 12시 = 12:00, 오전 12시 = 00:00', () => {
    expect(parseSessions('오후 12:00 오전 12:30').map(s => fmt(s.t))).toEqual(['00:30', '12:00']);
  });

  it('인접 중복 = 같은 칸 두 번 읽힘 → 접는다', () => {
    expect(parseSessions('10:30 10:30 12:00').map(s => fmt(s.t))).toEqual(['10:30', '12:00']);
  });

  it('떨어진 중복 = 오후 한 바퀴 → 보존 (숫자만 인식된 캡처)', () => {
    // 실제 예약 화면(범계 8/22)을 한글 없이 숫자만 읽었을 때의 결과 —
    // 마지막 10:30 은 오후라서 22:30 이어야 한다.
    expect(parseSessions('10:30 12:00 1:30 3:00 4:30 6:00 7:30 9:00 10:30').map(s => fmt(s.t)))
      .toEqual(['10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30']);
  });

  it('달력 날짜 숫자는 회차로 오인하지 않음', () => {
    // 콜론 없는 토큰은 무시한다.
    expect(parseSessions('8. 22 2026.8 20 21 22 23 24 25 10:30 12:00 1:30').map(s => fmt(s.t)))
      .toEqual(['10:30', '12:00', '13:30']);
  });

  it('빈 입력', () => {
    expect(parseSessions('').map(s => fmt(s.t))).toEqual([]);
  });

  it('12시간 보정된 항목에 fixed 표시', () => {
    // 보정한 항목에는 표시가 남아야 한다 — 화면에서 "친 것과 다르게 읽혔다" 를 알려주는 근거다.
    expect(parseSessions('10:00 1:10 3:40').map(s => !!s.fixed)).toEqual([false, true, true]);
  });

  it('보정이 필요 없으면 표시 없음', () => {
    expect(parseSessions('10:00 13:10 15:40').map(s => !!s.fixed)).toEqual([false, false, false]);
  });

  it('오전/오후 표기가 있으면 보정 자체를 하지 않음', () => {
    expect(parseSessions('오전 10:00 오후 1:10').map(s => !!s.fixed)).toEqual([false, false]);
  });

  it('순서가 섞이면 자정을 넘긴 값이 생김 (화면 경고 근거)', () => {
    expect(parseSessions('15:40 10:00 13:10').some(s => s.t >= 24 * 60)).toBe(true);
  });

  it('순서대로면 자정을 넘지 않음', () => {
    expect(parseSessions('10:00 13:10 15:40').some(s => s.t >= 24 * 60)).toBe(false);
  });
});

/* ── 2. 인수 기준: requirements.md §7 기준 조합 ── */
const T = (name: string, dur: number, times: string[]): SearchTheme => ({
  name,
  dur,
  sessions: times.map(t => {
    const [h, mi] = t.split(':').map(Number);
    return { t: h * 60 + mi, soldout: false };
  }),
});

const themes: SearchTheme[] = [
  T('범계', 75, ['10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30']),
  T('왓 어 트립', 70, ['10:20', '11:45', '13:10', '14:35', '16:00', '17:25', '18:50', '20:15', '21:40', '23:05']),
  T('몽', 70, ['10:50', '12:10', '13:30', '14:50', '16:10', '17:30', '18:50', '20:10', '21:30', '22:50']),
];
const opts = { startMin: null, endMax: null, minGap: 0, maxGap: null, excludeSoldout: false, minCount: 3 };

const { out, capped } = search(themes, opts);
const best = [...out].sort(SORTS.find(s => s.k === 'gap')!.f)[0];
const seq = best.steps.map(s => `${fmt(s.start)} ${s.name}`).join(' → ');

describe('[2] 인수 기준 (§7 검증 케이스)', () => {
  it('조합 발견', () => {
    expect(out.length).toBeGreaterThan(0);
  });

  it('탐색 한도 미도달', () => {
    expect(capped).toBe(false);
  });

  it('"공백 적은 순" 1위 = 카드 순서 고정 후 최적해', () => {
    // requirements.md §7 의 최적해(13:30 범계 → 14:50 몽 → 16:00 왓 어 트립)는 순서를
    // 범계→몽→왓어트립 로 뒤바꿔야 나온다 — §4.14 후기로 도구가 더는 순서를 안 바꾸고
    // 카드 배치 순서(여기선 범계,왓어트립,몽) 그대로만 탐색하므로 도달 불가능해졌다.
    // 지금 배치 순서 안에서 나오는 최적해로 교체한다.
    expect(seq).toBe('10:30 범계 → 11:45 왓 어 트립 → 13:30 몽');
  });

  it('공백 총합 35분', () => { expect(best.total).toBe(35); });
  it('개별 공백 [0, 35]', () => { expect(best.gaps).toEqual([0, 35]); });
  it('종료 14:40', () => { expect(fmt(best.end)).toBe('14:40'); });
  it('최소 공백 0분', () => { expect(best.minGap).toBe(0); });
});

describe('[3] 조건 필터 (§2.1 F-07)', () => {
  it('최소 공백 20분 → 모든 결과가 20분 이상', () => {
    const minGap20 = search(themes, { ...opts, minGap: 20 }).out;
    expect(minGap20.every(r => r.minGap >= 20)).toBe(true);
  });

  it('13:00~20:00 창 → 범위 밖 결과 없음', () => {
    const win = search(themes, { ...opts, startMin: 13 * 60, endMax: 20 * 60 }).out;
    expect(win.every(r => r.start >= 13 * 60 && r.end <= 20 * 60)).toBe(true);
  });

  const soldout = themes.map((t, i) => i === 0
    ? { ...t, sessions: t.sessions.map(s => ({ ...s, soldout: true })) } : t);

  it('한 테마 전 회차 매진 → 3개 조합 불가 (앱은 항상 제외한다)', () => {
    expect(search(soldout, { ...opts, excludeSoldout: true }).out.length).toBe(0);
  });

  it('excludeSoldout 를 끄면 다시 성립 (탐색기 자체의 동작 확인)', () => {
    expect(search(soldout, { ...opts, excludeSoldout: false }).out.length).toBeGreaterThan(0);
  });

  const partial = search(themes, { ...opts, minCount: 2 }).out;
  it('부분 조합 허용(F-08) → 2개짜리·3개짜리 모두 포함', () => {
    expect(partial.some(r => r.count === 2) && partial.some(r => r.count === 3)).toBe(true);
  });
});

describe('[3.5] 식사 공백 · 순서 제약', () => {
  const MEAL = { from: 11 * 60 + 30, to: 14 * 60, min: 40 };
  const meal = search(themes, { ...opts, meal: MEAL }).out;
  const hasMealGap = (r: (typeof meal)[number]) => r.steps.some((s, i) =>
    i > 0 && Math.min(s.start, MEAL.to) - Math.max(r.steps[i - 1].end, MEAL.from) >= MEAL.min);

  it('식사 공백 요구 → 전부 11:30~14:00 사이에 40분 이상 확보', () => {
    expect(meal.length > 0 && meal.every(hasMealGap)).toBe(true);
  });

  it('식사 공백은 조합을 줄인다', () => {
    expect(meal.length).toBeLessThan(out.length);
  });

  it('최대 공백 20분 + 식사 공백 40분 → 모순이라 결과 없음', () => {
    // 요구하는 공백이므로, 억제하는 조건(최대 공백)과 모순이면 결과가 없어야 한다
    expect(search(themes, { ...opts, meal: MEAL, maxGap: 20 }).out.length).toBe(0);
  });

  it('모든 결과가 배열 순서(오름차순 인덱스)로만 나온다 — 순서를 도구가 바꾸지 않는다', () => {
    // 카드 배치 순서 고정 (§4.14 후기): "자리 고정" 은 없어졌고, 순서는 항상 배열 순서 그대로다.
    expect(out.every(r => r.steps.every((s, k) => k === 0 || s.i > r.steps[k - 1].i))).toBe(true);
  });

  const partial = search(themes, { ...opts, minCount: 2 }).out;
  it('부분 조합도 상대 순서를 유지한 채 일부만 건너뛴다', () => {
    // 부분 조합(F-08)도 순서는 지키되 건너뛰기만 허용한다 — 재배열은 안 된다
    expect(partial.every(r => r.steps.every((s, k) => k === 0 || s.i > r.steps[k - 1].i))).toBe(true);
  });

  it('첫 카드를 건너뛴 부분 조합도 존재한다 (건너뛰기 = 배제, 재배열 아님)', () => {
    expect(partial.some(r => r.count === 2 && r.steps[0].i !== 0)).toBe(true);
  });
});

describe('[3.6] 매장 간 이동시간', () => {
  it('같은 매장 → 0분', () => { expect(moveCost('키이스', '키이스', 10, null)).toBe(0); });
  it('다른 매장 → 10분', () => { expect(moveCost('키이스', '넥스트', 10, null)).toBe(10); });
  it('매장을 안 적은 쪽이 있으면 0분 (모르는 것을 지어내지 않는다)', () => {
    expect(moveCost('', '넥스트', 10, null)).toBe(0);
  });
  it('반대 방향도 마찬가지', () => { expect(moveCost('키이스', '', 10, null)).toBe(0); });
  it('이동시간 0분 설정이면 안 붙는다', () => { expect(moveCost('키이스', '넥스트', 0, null)).toBe(0); });
  it('앞뒤 공백은 같은 매장으로 본다', () => { expect(moveCost(' 키이스 ', '키이스', 10, null)).toBe(0); });

  const P = (t: SearchTheme, place: string): SearchTheme => ({ ...t, place });
  const placed = [P(themes[0], 'A'), P(themes[1], 'B'), P(themes[2], 'A')]; // 범계=A, 왓어트립=B, 몽=A
  const base = search(placed, { ...opts, minGap: 0, moveMin: 0 }).out;
  const moved = search(placed, { ...opts, minGap: 0, moveMin: 30 }).out;

  it('이동 30분을 걸어도 조합은 남는다', () => { expect(moved.length).toBeGreaterThan(0); });
  it('이동시간은 조합을 줄인다', () => { expect(moved.length).toBeLessThan(base.length); });

  it('매장이 바뀌는 자리는 전부 30분 이상 확보된다', () => {
    const gapOK = (r: (typeof moved)[number]) => r.steps.every((s, i) => {
      if (!i) return true;
      const g = s.start - r.steps[i - 1].end;
      const need = r.steps[i - 1].place === s.place ? 0 : 30;
      return g >= need;
    });
    expect(moved.every(gapOK)).toBe(true);
  });

  it('step.move 는 매장이 바뀔 때만 채워진다', () => {
    expect(moved.every(r => r.steps.every((s, i) =>
      i === 0 || (r.steps[i - 1].place === s.place ? s.move === 0 : s.move === 30)))).toBe(true);
  });

  const both = search(placed, { ...opts, minGap: 10, moveMin: 30 }).out;
  it('최소 공백 10분 + 이동 30분 → 매장이 바뀌면 40분 이상', () => {
    expect(both.every(r => r.steps.every((s, i) =>
      i === 0 || (s.start - r.steps[i - 1].end) >= 10 + (s.move || 0)))).toBe(true);
  });

  it('minWait 는 이동을 뺀 값이라 최소 공백(10분) 이상이다', () => {
    expect(both.every(r => r.minWait >= 10)).toBe(true);
  });

  it('moveTotal 은 각 구간 이동의 합이다', () => {
    expect(moved.some(r => r.moveTotal > 0) && moved.every(r =>
      r.moveTotal === r.steps.reduce((a, x) => a + (x.move || 0), 0))).toBe(true);
  });

  it('쌍 키는 방향에 상관없다 (걷는 시간은 대칭이다)', () => {
    expect(pairKey('A', 'B')).toBe(pairKey('B', 'A'));
  });

  const MAP = { [pairKey('A', 'B')]: 30, [pairKey('B', 'C')]: 5 };
  it('지정한 쌍은 그 값을 쓴다', () => { expect(moveCost('A', 'B', 99, MAP)).toBe(30); });
  it('반대 방향도 같은 값', () => { expect(moveCost('B', 'A', 99, MAP)).toBe(30); });
  it('다른 쌍은 다른 값', () => { expect(moveCost('B', 'C', 99, MAP)).toBe(5); });
  it('지정 안 한 쌍은 기본값으로 떨어진다', () => { expect(moveCost('A', 'C', 99, MAP)).toBe(99); });
  it('같은 매장이면 표에 있든 없든 0분', () => { expect(moveCost('A', 'A', 99, MAP)).toBe(0); });
  it('기본값이 0이어도 지정한 쌍은 살아 있다', () => {
    expect(moveCost('A', 'B', 0, { [pairKey('A', 'B')]: 20 })).toBe(20);
  });

  const three = [P(themes[0], 'A'), P(themes[1], 'B'), P(themes[2], 'C')];
  const perPair = search(three, {
    ...opts, minGap: 0, moveMin: 0,
    moveMap: { [pairKey('A', 'B')]: 30, [pairKey('B', 'C')]: 5 },
  }).out;
  it('쌍별 이동시간으로도 조합이 남는다', () => { expect(perPair.length).toBeGreaterThan(0); });
  it('A↔B 는 30분, B↔C 는 5분, A↔C 는 0분이 각각 지켜진다', () => {
    expect(perPair.every(r => r.steps.every((s, i) => {
      if (!i) return true;
      const g = s.start - r.steps[i - 1].end;
      const k = pairKey(r.steps[i - 1].place, s.place);
      const need = r.steps[i - 1].place === s.place ? 0
        : (({ [pairKey('A', 'B')]: 30, [pairKey('B', 'C')]: 5 } as Record<string, number>)[k] ?? 0);
      return g >= need && s.move === need;
    }))).toBe(true);
  });

  it('매장을 안 적으면 이동시간 설정은 결과를 바꾸지 않는다', () => {
    expect(search(themes, { ...opts, minGap: 0, moveMin: 60 }).out.length)
      .toBe(search(themes, { ...opts, minGap: 0, moveMin: 0 }).out.length);
  });
});

describe('[3.7] 순차 배정 — 확정된 회차 제외 (§4.29, F-14)', () => {
  const idThemes = themes.map((t, i) => ({ ...t, id: i + 1 }));

  // 팀1이 "13:30 범계 → 14:50 몽 → 16:00 왓 어 트립" 을 확정했다고 하자.
  // 팀2 계산에서는 이 세 회차(테마id+시각)가 후보에서 빠져야 한다.
  const takenFromBest = new Set(best.steps.map(s => idThemes[s.i].id + '|' + s.start));
  const team2 = search(idThemes, { ...opts, taken: takenFromBest }).out;

  it('제외해도 다른 조합은 남는다', () => { expect(team2.length).toBeGreaterThan(0); });

  it('팀1이 쓴 (테마,시각) 조합은 팀2 결과 어디에도 나오지 않는다', () => {
    expect(team2.every(r => r.steps.every(s => !takenFromBest.has(idThemes[s.i].id + '|' + s.start)))).toBe(true);
  });

  it('팀1이 확정한 바로 그 시퀀스는 팀2 후보에서 완전히 빠진다', () => {
    expect(team2.some(r => r.steps.map(s => `${fmt(s.start)} ${s.name}`).join(' → ') === seq)).toBe(false);
  });

  it('범계 자체가 빠지는 게 아니라, 팀1이 쓴 그 시각만 빠진다 (테마 단위가 아니라 슬롯 단위)', () => {
    // 같은 테마를 "다른" 시각에는 다시 쓸 수 있어야 한다 — 슬롯 단위 제외이지, 테마 단위 제외가 아니다.
    expect(team2.some(r => r.steps.some(s => s.name === '범계'))).toBe(true);
  });

  it('taken 없음 → 평소와 결과 개수 동일', () => {
    expect(search(idThemes, opts).out.length).toBe(out.length);
  });

  it('빈 taken → 평소와 동일', () => {
    expect(search(idThemes, { ...opts, taken: new Set<string>() }).out.length).toBe(out.length);
  });

  it('id 없는 테마 배열은 taken 이 있어도 아무 영향이 없다', () => {
    // 방어적 동작 확인
    expect(search(themes, { ...opts, taken: takenFromBest }).out.length).toBe(out.length);
  });
});

describe('[4] 비기능 요구 (§2.4)', () => {
  it('테마 3개 계산 100ms 이내', () => {
    const t0 = performance.now();
    search(themes, opts);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('테마 5개 계산 100ms 이내, minCount=5 → 전부 5개 포함, 상한 미도달', () => {
    // 요구 범위의 상단(테마 5개)에서 재측정한다.
    const five = [...themes,
      T('테마 D', 65, ['10:00', '11:20', '12:40', '14:00', '15:20', '16:40', '18:00', '19:20', '20:40', '22:00']),
      T('테마 E', 60, ['10:40', '11:55', '13:10', '14:25', '15:40', '16:55', '18:10', '19:25', '20:40', '21:55']),
    ];
    const t1 = performance.now();
    const five5 = search(five, { ...opts, minCount: 5 });
    expect(performance.now() - t1).toBeLessThan(100);
    expect(five5.out.length).toBeGreaterThan(0);
    expect(five5.out.every(r => r.count === 5)).toBe(true);
  });
});

describe('[5] 정렬 기준 (§2.3)', () => {
  it('정렬 기준 5종', () => {
    expect(SORTS.map(s => s.k)).toEqual(['gap', 'end', 'even', 'late', 'safe']);
  });

  it.each(SORTS)('"$label" 1위는 3개 테마 전부 포함', (s) => {
    const top = [...out].sort(s.f)[0];
    expect(top && top.count === 3).toBe(true);
  });

  it('"빨리 끝나는 순" 1위 종료 ≤ "공백 적은 순" 1위 종료', () => {
    const byEnd = [...out].sort(SORTS.find(s => s.k === 'end')!.f)[0];
    expect(byEnd.end).toBeLessThanOrEqual(best.end);
  });

  it('"여유 있는 순" 1위 최소공백 ≥ 기준', () => {
    const bySafe = [...out].sort(SORTS.find(s => s.k === 'safe')!.f)[0];
    expect(bySafe.minGap).toBeGreaterThanOrEqual(best.minGap);
  });
});

describe('[8] 서버에서 불러오기 (F-15)', () => {
  // 서버 응답 모양 그대로 (서버 저장소 작업명세서 §4.4).
  // t 는 자정부터의 분이라 카드 내부 형식과 같다 — 변환이 없다.
  const apiSessions = [
    { t: 635, soldout: false },   // 10:35
    { t: 710, soldout: false },   // 11:50
    { t: 1095, soldout: true },   // 18:15
    { t: 1335, soldout: true },   // 22:15
  ];
  const loadedRaw = sessionsToText(apiSessions.map(x => ({ t: x.t, soldout: !!x.soldout })));

  it('raw 왕복에서 매진이 살아남는다 — 공유 링크·자동저장이 이 경로를 탄다', () => {
    expect(parseSessions(loadedRaw).map(s => fmt(s.t) + (s.soldout ? '/매진' : '')))
      .toEqual(['10:35', '11:50', '18:15/매진', '22:15/매진']);
  });

  // 매진 회차를 카드에 남기는 것과 계산에 넣는 것은 다르다 (기획 §4.30).
  // 남겨두되 excludeSoldout 이 후보에서 빼는지 확인한다.
  const loadedThemes: SearchTheme[] = [
    { id: 1, name: 'A', dur: 65, place: '플레이33 건대점', sessions: parseSessions(loadedRaw) },
    {
      id: 2, name: 'B', dur: 60, place: '플레이33 건대점',
      sessions: parseSessions(sessionsToText([{ t: 790, soldout: false }, { t: 1095, soldout: true }])),
    },
  ];
  const twoOpts = { startMin: null, endMax: null, minGap: 0, maxGap: null, excludeSoldout: true, minCount: 2 };
  const loadedOut = search(loadedThemes, twoOpts).out;

  it('매진을 뺀 회차로 조합이 성립한다', () => { expect(loadedOut.length).toBeGreaterThan(0); });
  it('어떤 조합에도 매진 회차가 들어가지 않는다', () => {
    expect(loadedOut.every(r => r.steps.every(st => !st.soldout))).toBe(true);
  });

  it('같은 지점끼리는 이동시간 0 — 서버가 일관된 매장명을 주므로 자동으로 맞는다', () => {
    expect(moveCost('플레이33 건대점', '플레이33 건대점', 10, {})).toBe(0);
  });
  it('지점이 다르면 기본 이동시간이 붙는다', () => {
    expect(moveCost('플레이33 건대점', '플레이33 홍대점', 10, {})).toBe(10);
  });
});

describe('[9] 캘린더 그리드 유틸', () => {
  it('toISO — 로컬 Date를 "YYYY-MM-DD"로', () => {
    expect(toISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISO(new Date(2026, 8, 30))).toBe('2026-09-30');
  });

  it('monthGrid — 칸 수는 항상 7의 배수', () => {
    for (let m = 0; m < 12; m++) expect(monthGrid(2026, m).length % 7).toBe(0);
  });

  it('monthGrid — 이번 달 1일과 마지막 날이 그리드 안에 있다', () => {
    const grid = monthGrid(2026, 8); // 9월, 1일은 화요일
    expect(grid.map(toISO)).toContain('2026-09-01');
    expect(grid.map(toISO)).toContain('2026-09-30');
    expect(toISO(grid[0])).toBe('2026-08-30'); // 앞을 이전 달로 채움 (일요일 시작)
  });

  it('monthGrid — 윤년 2월(29일)도 정확히 채운다', () => {
    const grid = monthGrid(2028, 1); // 2028은 윤년
    const isos = grid.map(toISO);
    expect(isos).toContain('2028-02-29');
    expect(isos).not.toContain('2028-02-30');
  });

  it('monthGrid — 평년 2월(28일)도 정확히 채운다', () => {
    const grid = monthGrid(2026, 1);
    const isos = grid.map(toISO);
    expect(isos).toContain('2026-02-28');
    expect(isos.filter(d => d.startsWith('2026-02')).length).toBe(28);
  });
});

describe('[10] mdWeekday — 테마 카드 날짜 표시 (§4.41)', () => {
  it('"YYYY-MM-DD"를 "M/D(요일)"로', () => {
    expect(mdWeekday('2026-09-01')).toBe('9/1(화)');
    expect(mdWeekday('2026-09-03')).toBe('9/3(목)');
  });
});

/**
 * 인수 테스트 — 의존성 0개.  실행:  npm test   (또는 node test/acceptance.mjs)
 *
 * index.html 의 @core 구간(순수 로직)만 잘라내 그대로 실행한다.
 * 로직을 별도 파일로 복사하지 않으므로 앱과 테스트가 어긋날 수 없다.
 * → @core 구간에 document/window를 넣으면 이 테스트가 즉시 깨진다. 그게 의도다.
 */
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/@core:start[\s\S]*?\*\/([\s\S]*?)\/\*[\s\S]{0,80}?@core:end/);
if (!m) { console.error('index.html에서 @core 구간을 찾지 못했습니다.'); process.exit(1); }
const core = new Function(m[1] + '\nreturn {pad,fmt,parseClock,parseSessions,sessionsToText,search,SORTS,moveCost,pairKey};')();
const { fmt, parseSessions, search, SORTS, moveCost, pairKey } = core;

let fail = 0;
const ok = (cond, name, extra='') => {
  console.log(`${cond ? '  PASS' : '✗ FAIL'}  ${name}${cond || !extra ? '' : '\n         ' + extra}`);
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(JSON.stringify(got) === JSON.stringify(want), name, `got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);

/* ── 1. 회차 텍스트 파싱 (requirements.md §2.2) ── */
console.log('\n[1] 회차 텍스트 파싱');
eq(parseSessions('10:30, 12:00, 1:30, 3:00').map(s => fmt(s.t)),
   ['10:30','12:00','13:30','15:00'],
   '오전/오후 표기 없음 → 오름차순 12시간 보정');

eq(parseSessions('오전 10:30 매진 오후 12:00 오후 1:30 매진').map(s => fmt(s.t) + (s.soldout ? '/매진' : '')),
   ['10:30/매진','12:00','13:30/매진'],
   '오전·오후 표기 + 매진 플래그');

eq(parseSessions('오후 12:00 오전 12:30').map(s => fmt(s.t)), ['00:30','12:00'],
   '오후 12시 = 12:00, 오전 12시 = 00:00');

eq(parseSessions('10:30 10:30 12:00').map(s => fmt(s.t)), ['10:30','12:00'],
   '인접 중복 = 같은 칸 두 번 읽힘 → 접는다');

// 떨어져 있는 중복은 접으면 안 된다. 실제 예약 화면(범계 8/22)을 한글 없이
// 숫자만 읽었을 때의 결과 — 마지막 10:30 은 오후라서 22:30 이어야 한다.
eq(parseSessions('10:30 12:00 1:30 3:00 4:30 6:00 7:30 9:00 10:30').map(s => fmt(s.t)),
   ['10:30','12:00','13:30','15:00','16:30','18:00','19:30','21:00','22:30'],
   '떨어진 중복 = 오후 한 바퀴 → 보존 (숫자만 인식된 캡처)');

// 달력 영역 숫자가 섞여 들어와도 회차로 오인하지 않는다 (콜론 없는 토큰은 무시)
eq(parseSessions('8. 22 2026.8 20 21 22 23 24 25 10:30 12:00 1:30').map(s => fmt(s.t)),
   ['10:30','12:00','13:30'],
   '달력 날짜 숫자는 회차로 오인하지 않음');

eq(parseSessions('').map(s => fmt(s.t)), [], '빈 입력');

// 보정한 항목에는 표시가 남아야 한다 — 화면에서 "친 것과 다르게 읽혔다" 를 알려주는 근거다.
eq(parseSessions('10:00 1:10 3:40').map(s => !!s.fixed), [false, true, true],
   '12시간 보정된 항목에 fixed 표시');
eq(parseSessions('10:00 13:10 15:40').map(s => !!s.fixed), [false, false, false],
   '보정이 필요 없으면 표시 없음');
eq(parseSessions('오전 10:00 오후 1:10').map(s => !!s.fixed), [false, false],
   '오전/오후 표기가 있으면 보정 자체를 하지 않음');

// 순서를 섞어 넣으면 자정을 넘는 값이 나온다 — 화면이 경고할 수 있어야 한다.
ok(parseSessions('15:40 10:00 13:10').some(s => s.t >= 24 * 60),
   '순서가 섞이면 자정을 넘긴 값이 생김 (화면 경고 근거)');
ok(!parseSessions('10:00 13:10 15:40').some(s => s.t >= 24 * 60),
   '순서대로면 자정을 넘지 않음');

/* ── 2. 인수 기준: requirements.md §7 기준 조합 ── */
console.log('\n[2] 인수 기준 (§7 검증 케이스)');
const T = (name, dur, times) => ({ name, dur, sessions: times.map(t => {
  const [h, mi] = t.split(':').map(Number); return { t: h * 60 + mi, soldout: false };
}) });

const themes = [
  T('범계',     75, ['10:30','12:00','13:30','15:00','16:30','18:00','19:30','21:00','22:30']),
  T('왓 어 트립', 70, ['10:20','11:45','13:10','14:35','16:00','17:25','18:50','20:15','21:40','23:05']),
  T('몽',       70, ['10:50','12:10','13:30','14:50','16:10','17:30','18:50','20:10','21:30','22:50']),
];
const opts = { startMin: null, endMax: null, minGap: 0, maxGap: null, excludeSoldout: false, minCount: 3 };

const t0 = performance.now();
const { out, capped } = search(themes, opts);
const ms = performance.now() - t0;

ok(out.length > 0, `조합 발견 (${out.length.toLocaleString()}개, ${Math.round(ms)}ms)`);
ok(!capped, '탐색 한도 미도달');

const best = [...out].sort(SORTS.find(s => s.k === 'gap').f)[0];
const seq = best.steps.map(s => `${fmt(s.start)} ${s.name}`).join(' → ');

eq(seq, '13:30 범계 → 14:50 몽 → 16:00 왓 어 트립', '"공백 적은 순" 1위 = 검증된 최적해');
eq(best.total, 5,   '공백 총합 5분');
eq(best.gaps, [5, 0], '개별 공백 [5, 0]');
eq(fmt(best.end), '17:10', '종료 17:10');
eq(best.minGap, 0,  '최소 공백 0분');

/* ── 3. 조건 필터 (§2.1 F-07) ── */
console.log('\n[3] 조건 필터');
const minGap20 = search(themes, { ...opts, minGap: 20 }).out;
ok(minGap20.every(r => r.minGap >= 20), '최소 공백 20분 → 모든 결과가 20분 이상');

const window = search(themes, { ...opts, startMin: 13 * 60, endMax: 20 * 60 }).out;
ok(window.every(r => r.start >= 13 * 60 && r.end <= 20 * 60), '13:00~20:00 창 → 범위 밖 결과 없음');

const soldout = themes.map((t, i) => i === 0
  ? { ...t, sessions: t.sessions.map(s => ({ ...s, soldout: true })) } : t);
eq(search(soldout, { ...opts, excludeSoldout: true }).out.length, 0,
   '한 테마 전 회차 매진 → 3개 조합 불가 (앱은 항상 제외한다)');
ok(search(soldout, { ...opts, excludeSoldout: false }).out.length > 0,
   'excludeSoldout 를 끄면 다시 성립 (탐색기 자체의 동작 확인)');

const partial = search(themes, { ...opts, minCount: 2 }).out;
ok(partial.some(r => r.count === 2) && partial.some(r => r.count === 3),
   '부분 조합 허용(F-08) → 2개짜리·3개짜리 모두 포함');

/* ── 3.5 식사 공백 · 순서 제약 ── */
console.log('\n[3.5] 식사 공백 · 순서 제약');
const MEAL = { from: 11 * 60 + 30, to: 14 * 60, min: 40 };
const meal = search(themes, { ...opts, meal: MEAL }).out;
const hasMealGap = r => r.steps.some((s, i) =>
  i > 0 && Math.min(s.start, MEAL.to) - Math.max(r.steps[i - 1].end, MEAL.from) >= MEAL.min);
ok(meal.length > 0 && meal.every(hasMealGap),
   `식사 공백 요구 → 전부 11:30~14:00 사이에 40분 이상 확보 (${meal.length}개)`);
ok(meal.length < out.length, `식사 공백은 조합을 줄인다 (${out.length} → ${meal.length})`);

// 요구하는 공백이므로, 억제하는 조건(최대 공백)과 모순이면 결과가 없어야 한다
eq(search(themes, { ...opts, meal: MEAL, maxGap: 20 }).out.length, 0,
   '최대 공백 20분 + 식사 공백 40분 → 모순이라 결과 없음');

// 자리 잠금: lockPos 는 0부터 센 순서. 개념 하나로 첫 타·마지막·가운데·전체 고정을 다 덮는다.
const lockAt = (...pos) => themes.map((t, i) => pos.includes(i) ? { ...t, lockPos: i } : t);

const lf = search(lockAt(0), opts).out;
ok(lf.length > 0 && lf.every(r => r.steps[0].name === '범계'),
   `0번 자리 잠금 → 전부 범계로 시작 (${lf.length}개)`);
ok(lf.length < out.length, '자리 잠금은 조합을 줄인다');

const ll = search(lockAt(2), opts).out;
ok(ll.length > 0 && ll.every(r => r.steps[r.steps.length - 1].name === '몽'),
   `마지막 자리 잠금 → 전부 몽으로 끝 (${ll.length}개)`);
ok(ll.every(r => r.steps.slice(0, -1).every(s => s.name !== '몽')),
   '잠근 테마가 다른 자리에 끼는 조합은 생기지 않는다');

// 드롭다운(첫 타/마지막)으로는 표현할 수 없던 것 — 가운데 자리 고정
const lm = search(lockAt(1), opts).out;
ok(lm.length > 0 && lm.every(r => r.steps[1].name === '왓 어 트립'),
   `가운데 자리 잠금 → 전부 2번째가 왓 어 트립 (${lm.length}개)`);

// 전부 잠그면 "이 순서 그대로" 가 된다
const la = search(lockAt(0, 1, 2), opts).out;
ok(la.length > 0 && la.every(r => r.steps.map(s => s.name).join('>') === '범계>왓 어 트립>몽'),
   `전부 잠금 → 순서 그대로, 회차만 탐색 (${la.length}개)`);

// 잠금 + 식사 공백 동시 적용
const bo = search(lockAt(0, 2), { ...opts, meal: MEAL }).out;
ok(bo.every(r => r.steps[0].name === '범계' && r.steps[2].name === '몽' && hasMealGap(r)),
   `자리 잠금 + 식사 공백 동시 적용 (${bo.length}개)`);

/* ── 3.6 매장 간 이동시간 ── */
console.log('\n[3.6] 매장 간 이동시간');

// moveCost 단독
eq(moveCost('키이스', '키이스', 10), 0, '같은 매장 → 0분');
eq(moveCost('키이스', '넥스트', 10), 10, '다른 매장 → 10분');
eq(moveCost('', '넥스트', 10), 0, '매장을 안 적은 쪽이 있으면 0분 (모르는 것을 지어내지 않는다)');
eq(moveCost('키이스', '', 10), 0, '반대 방향도 마찬가지');
eq(moveCost('키이스', '넥스트', 0), 0, '이동시간 0분 설정이면 안 붙는다');
eq(moveCost(' 키이스 ', '키이스', 10), 0, '앞뒤 공백은 같은 매장으로 본다');

// 매장을 붙인 테마로 탐색
const P = (t, place) => ({ ...t, place });
const placed = [P(themes[0], 'A'), P(themes[1], 'B'), P(themes[2], 'A')];   // 범계=A, 왓어트립=B, 몽=A
const base = search(placed, { ...opts, minGap: 0, moveMin: 0 }).out;
const moved = search(placed, { ...opts, minGap: 0, moveMin: 30 }).out;

ok(moved.length > 0, `이동 30분을 걸어도 조합은 남는다 (${moved.length}개)`);
ok(moved.length < base.length, `이동시간은 조합을 줄인다 (${base.length} → ${moved.length})`);

// 매장이 바뀌는 자리마다 실제로 30분 이상 비어 있어야 한다
const gapOK = r => r.steps.every((s, i) => {
  if (!i) return true;
  const g = s.start - r.steps[i - 1].end;
  const need = r.steps[i - 1].place === s.place ? 0 : 30;
  return g >= need;
});
ok(moved.every(gapOK), '매장이 바뀌는 자리는 전부 30분 이상 확보된다');

// 같은 매장끼리는 이동이 안 붙는다
ok(moved.every(r => r.steps.every((s, i) => i === 0 || (r.steps[i - 1].place === s.place ? s.move === 0 : s.move === 30))),
   'step.move 는 매장이 바뀔 때만 채워진다');

// 최소 공백과 더해진다 (대체가 아니라 누적)
const both = search(placed, { ...opts, minGap: 10, moveMin: 30 }).out;
ok(both.every(r => r.steps.every((s, i) =>
     i === 0 || (s.start - r.steps[i - 1].end) >= 10 + (s.move || 0))),
   '최소 공백 10분 + 이동 30분 → 매장이 바뀌면 40분 이상');

// minWait: 이동을 뺀 "실제로 쉬는 시간"
ok(both.every(r => r.minWait >= 10),
   'minWait 는 이동을 뺀 값이라 최소 공백(10분) 이상이다');
ok(moved.some(r => r.moveTotal > 0) && moved.every(r =>
     r.moveTotal === r.steps.reduce((a, x) => a + (x.move || 0), 0)),
   'moveTotal 은 각 구간 이동의 합이다');

// 쌍마다 다른 값 — A↔B 10분, B↔C 7분 처럼
eq(pairKey('A','B'), pairKey('B','A'), '쌍 키는 방향에 상관없다 (걷는 시간은 대칭이다)');
const MAP = { [pairKey('A','B')]: 30, [pairKey('B','C')]: 5 };
eq(moveCost('A','B', 99, MAP), 30, '지정한 쌍은 그 값을 쓴다');
eq(moveCost('B','A', 99, MAP), 30, '반대 방향도 같은 값');
eq(moveCost('B','C', 99, MAP), 5,  '다른 쌍은 다른 값');
eq(moveCost('A','C', 99, MAP), 99, '지정 안 한 쌍은 기본값으로 떨어진다');
eq(moveCost('A','A', 99, MAP), 0,  '같은 매장이면 표에 있든 없든 0분');
eq(moveCost('A','B', 0, { [pairKey('A','B')]: 20 }), 20,
   '기본값이 0이어도 지정한 쌍은 살아 있다');

// 세 매장짜리 탐색에서 쌍별 값이 실제로 지켜지는가
const three = [P(themes[0],'A'), P(themes[1],'B'), P(themes[2],'C')];
const perPair = search(three, { ...opts, minGap: 0, moveMin: 0,
                                moveMap: { [pairKey('A','B')]: 30, [pairKey('B','C')]: 5 } }).out;
ok(perPair.length > 0, `쌍별 이동시간으로도 조합이 남는다 (${perPair.length}개)`);
ok(perPair.every(r => r.steps.every((s, i) => {
     if (!i) return true;
     const g = s.start - r.steps[i - 1].end;
     const k = pairKey(r.steps[i - 1].place, s.place);
     const need = r.steps[i - 1].place === s.place ? 0
                : ({ [pairKey('A','B')]: 30, [pairKey('B','C')]: 5 }[k] ?? 0);
     return g >= need && s.move === need;
   })), 'A↔B 는 30분, B↔C 는 5분, A↔C 는 0분이 각각 지켜진다');

// 매장을 아무도 안 적으면 이동시간 설정이 있어도 아무 일이 없어야 한다
eq(search(themes, { ...opts, minGap: 0, moveMin: 60 }).out.length,
   search(themes, { ...opts, minGap: 0, moveMin: 0 }).out.length,
   '매장을 안 적으면 이동시간 설정은 결과를 바꾸지 않는다');

/* ── 3.7 순차 배정: 팀이 확정한 회차 제외 (§4.29, F-14) ── */
console.log('\n[3.7] 순차 배정 — 확정된 회차 제외');
const idThemes = themes.map((t, i) => ({ ...t, id: i + 1 }));

// 팀1이 "13:30 범계 → 14:50 몽 → 16:00 왓 어 트립" 을 확정했다고 하자.
// 팀2 계산에서는 이 세 회차(테마id+시각)가 후보에서 빠져야 한다.
const takenFromBest = new Set(best.steps.map(s => idThemes[s.i].id + '|' + s.start));
const team2 = search(idThemes, { ...opts, taken: takenFromBest }).out;

ok(team2.length > 0, `제외해도 다른 조합은 남는다 (${team2.length}개)`);
ok(team2.every(r => r.steps.every(s => !takenFromBest.has(idThemes[s.i].id + '|' + s.start))),
   '팀1이 쓴 (테마,시각) 조합은 팀2 결과 어디에도 나오지 않는다');
ok(!team2.some(r => r.steps.map(s => `${fmt(s.start)} ${s.name}`).join(' → ') === seq),
   '팀1이 확정한 바로 그 시퀀스는 팀2 후보에서 완전히 빠진다');

// 같은 테마를 "다른" 시각에는 다시 쓸 수 있어야 한다 — 슬롯 단위 제외이지, 테마 단위 제외가 아니다.
ok(team2.some(r => r.steps.some(s => s.name === '범계')),
   '범계 자체가 빠지는 게 아니라, 팀1이 쓴 그 시각만 빠진다 (테마 단위가 아니라 슬롯 단위)');

// taken 이 없거나 빈 Set 이면 원래 결과와 동일해야 한다 (팀 나누기를 꺼도 평소처럼 동작)
eq(search(idThemes, opts).out.length, out.length, 'taken 없음 → 평소와 결과 개수 동일');
eq(search(idThemes, { ...opts, taken: new Set() }).out.length, out.length, '빈 taken → 평소와 동일');

// id 가 없는 테마(id:null/undefined)는 taken 이 있어도 걸리지 않는다 — 방어적 동작 확인
eq(search(themes, { ...opts, taken: takenFromBest }).out.length, out.length,
   'id 없는 테마 배열은 taken 이 있어도 아무 영향이 없다');

/* ── 4. 비기능 요구 (§2.4) ── */
console.log('\n[4] 비기능 요구');
ok(ms < 100, `테마 3개 계산 100ms 이내 (실측 ${Math.round(ms)}ms)`);

// 요구 범위의 상단(테마 5개)에서 재측정한다. N! x M^N 이 실제로 무는 지점이고,
// KEEP_CAP(50000) 에 걸리는지도 여기서 드러난다.
const five = [...themes,
  T('테마 D', 65, ['10:00','11:20','12:40','14:00','15:20','16:40','18:00','19:20','20:40','22:00']),
  T('테마 E', 60, ['10:40','11:55','13:10','14:25','15:40','16:55','18:10','19:25','20:40','21:55']),
];
const t1 = performance.now();
const five5 = search(five, { ...opts, minCount: 5 });
const ms5 = performance.now() - t1;
ok(ms5 < 100, `테마 5개 계산 100ms 이내 (실측 ${Math.round(ms5)}ms, 조합 ${five5.out.length.toLocaleString()}개)`);
console.log(`         탐색 한도 도달: ${five5.capped ? '예 — 문서의 "6개 이상" 서술 확인 필요' : '아니오'}`);
ok(five5.out.length > 0, '테마 5개 전부 들어가는 조합 존재');
ok(five5.out.every(r => r.count === 5), 'minCount=5 → 모든 결과가 5개 포함');

/* ── 5. 정렬 기준 (§2.3) ── */
console.log('\n[5] 정렬 기준');
eq(SORTS.map(s => s.k), ['gap','end','even','late','safe'], '정렬 기준 5종');
for (const s of SORTS) {
  const top = [...out].sort(s.f)[0];
  ok(top && top.count === 3, `"${s.label}" 1위는 3개 테마 전부 포함`);
}
const byEnd = [...out].sort(SORTS.find(s => s.k === 'end').f)[0];
ok(byEnd.end <= best.end, `"빨리 끝나는 순" 1위 종료(${fmt(byEnd.end)}) ≤ "공백 적은 순" 1위 종료(${fmt(best.end)})`);
const bySafe = [...out].sort(SORTS.find(s => s.k === 'safe').f)[0];
ok(bySafe.minGap >= best.minGap, `"여유 있는 순" 1위 최소공백(${bySafe.minGap}분) ≥ 기준(${best.minGap}분)`);

console.log(fail ? `\n실패 ${fail}건\n` : '\n전부 통과\n');
process.exit(fail ? 1 : 0);

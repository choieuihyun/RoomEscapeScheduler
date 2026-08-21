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
const core = new Function(m[1] + '\nreturn {pad,fmt,parseClock,parseSessions,sessionsToText,search,SORTS};')();
const { fmt, parseSessions, search, SORTS } = core;

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
  T('에이트립', 70, ['10:20','11:45','13:10','14:35','16:00','17:25','18:50','20:15','21:40','23:05']),
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

eq(seq, '13:30 범계 → 14:50 몽 → 16:00 에이트립', '"공백 적은 순" 1위 = 검증된 최적해');
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
   '한 테마 전 회차 매진 + 매진 제외 → 3개 조합 불가');
ok(search(soldout, { ...opts, excludeSoldout: false }).out.length > 0,
   '매진 제외 해제 → 다시 조합 성립');

const partial = search(themes, { ...opts, minCount: 2 }).out;
ok(partial.some(r => r.count === 2) && partial.some(r => r.count === 3),
   '부분 조합 허용(F-08) → 2개짜리·3개짜리 모두 포함');

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

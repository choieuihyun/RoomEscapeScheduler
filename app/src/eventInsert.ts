/* 결과 카드의 "이 일정에 넣기" — 일정 상세에서 시작한 계산의 결과를 그 일정의 구간으로 바꾼다.
   누를 때 받는다(진입 청크 크기). 저장은 일정 수정(§4.7, version 비교) 한 번이다. */
import { dayLabel, eventTitle, isUndecided, rangeLabel } from './clubEvents';
import type { PathStep } from './core';
import { formFromEvent, formFromSteps, toInput } from './eventForm';
import { stepCards, type EventCtx } from './eventFlow';
import type { Scheduler } from './scheduler/useScheduler';
import { conflictOf, errorCode, getEvent, sayClub, type EventDto, type EventInput } from './server';
import { showToast } from './toast';
import type { UseClubEventsReturn } from './useClubEvents';

const clip = (t: string) => [...t.trim()].slice(0, 40).join('');

export type InsertPlan = { input: EventInput; confirm: string; done: string } | { error: string };

/* 일정 + 결과 → 수정 본문. 수정 창·"이 날짜로 정하기"와 같은 길(formFromEvent → toInput)이라 제목·위치·정원·메모는 그대로 간다.
   - 구간은 결과로 통째로 바꾼다(테마 키 포함). 테마가 바뀌니 예약은 "예약 전"으로.
   - 날짜는 결과 날짜(없으면 ctxDate, 그래도 없으면 정해진 일정 날짜). 미정 일정은 이 날짜로 정한다 —
     candidatesTouched 가 false 라 candidates 를 보내지 않아 서버가 후보·응답을 그대로 둔다(§4.8 ★, 정하기와 같다).
   - 자정 넘긴 첫 회차면 formFromSteps 가 날짜를 다음날로 옮긴다(결과 카드 → 일정 등록과 같다).
   confirm: 덮어쓰거나 날짜·예약 표시·일정 시각이 바뀌거나, 미정 일정을 후보에 없는 날로 정하면 묻는 글(없으면 빈 문자열). */
export function planInsert(ev: EventDto, steps: PathStep[], keys: (string | null)[], date: string | null): InsertPlan {
  const day = date ?? ev.date;
  if (!day) return { error: '어느 날 회차인지 몰라서 날짜를 정할 수 없어요. 협의 도우미나 회차 불러오기로 넣은 테마로 계산해 주세요.' };
  const s = formFromSteps(day, steps, keys);
  /* 고칠 창이 없으니 이름·지점은 저장 한도(40자)로 자른다(테마 찾아 넣기와 같다) — 넘으면 막다른 오류가 된다 */
  const segs = s.segs.map((g) => ({ ...g, themeName: clip(g.themeName), branchName: clip(g.branchName) }));
  const r = toInput({
    ...formFromEvent(ev), dateMode: 'fixed', date: s.date, dateMoved: s.dateMoved, origDate: s.origDate,
    allDay: false, segs, booked: false,
  });
  if ('error' in r) return r;
  const n = ev.segments.length;
  const lines: string[] = [];
  /* 미정 일정인데 결과 날짜가 후보에 없으면 — 아무도 되는지 답하지 않은 날로 정해진다.
     자정 뒤 첫 회차로 날짜를 하루 옮겼으면 옮기기 전 날(그 밤)로 본다 — 후보 날 밤의 24:30 은 후보 안이다 */
  const night = s.origDate ?? s.date;
  if (isUndecided(ev) && !ev.candidates.some((c) => c.date === night)) lines.push(`후보에 없는 날짜예요. ${dayLabel(night)}로 정할까요?`);
  if (n > 0) lines.push(`지금 테마 ${n}개를 이 결과로 바꿔요.`);
  /* 구간 없이 일정 시각만 있던 일정 — 시각은 이제 테마에서 읽는다(일정 시각은 비워 보낸다) */
  if (n === 0 && ev.startMin !== null) lines.push(`일정 시각(${rangeLabel(ev.startMin, ev.endMin)})은 테마 시각으로 바뀌어요.`);
  if (ev.date !== null && ev.date !== s.date) lines.push(`일정 날짜도 ${dayLabel(ev.date)}에서 ${dayLabel(s.date)}로 바뀌어요.`);
  if (ev.booked && n > 0) lines.push('예약 완료 표시는 예약 전으로 돌아가요.');
  const done = `'${eventTitle(ev)}' 일정에 테마 ${r.input.segments.length}개를 `
    + (isUndecided(ev) ? `넣고 ${dayLabel(s.date)}에 하기로 정했어요.` : '넣었어요.');
  return { input: r.input, confirm: lines.join('\n'), done };
}

/* 넣은 뒤 문맥을 어떻게 하나 — 성공·지워진 일정이면 끝, 충돌·그 밖의 실패면 그대로 두어 다시 누를 수 있게 */
export type InsertOutcome = 'ok' | 'gone' | 'conflict' | 'error' | 'cancel';
export const ctxAfter = (ctx: EventCtx | null, out: InsertOutcome): EventCtx | null => (out === 'ok' || out === 'gone' ? null : ctx);

/* 지금 일정 — 목록에 있으면 그 값, 없으면(캘린더 범위 밖) 한 건 받아 목록에 넣는다 */
async function liveEvent(id: number, club: UseClubEventsReturn): Promise<EventDto> {
  const hit = club.events.find((e) => e.id === id);
  if (hit) return hit;
  const t = await (await import('./cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  const ev = await getEvent(id, t);
  club.adopt(ev);
  return ev;
}

/* 넣기 한 번. 수정 실패는 서버 문구를 토스트로 — 충돌이면 받은 최신 일정을 목록에 넣어 다시 누르면 새 내용 위에 넣게 한다.
   끝나면 문맥을 ctxAfter 로 맞춘다(그 사이 다른 일정 문맥으로 바뀌었으면 그대로) */
export async function insertResult(
  ctx: EventCtx, steps: PathStep[], s: Pick<Scheduler, 'themesReady' | 'themes'>, club: UseClubEventsReturn,
  setCtx: (f: (cur: EventCtx | null) => EventCtx | null) => void, onDone: (ev: EventDto) => void,
): Promise<void> {
  const out = await run();
  setCtx((cur) => (cur?.id === ctx.id ? ctxAfter(cur, out) : cur));

  async function run(): Promise<InsertOutcome> {
    try {
      const ev = await liveEvent(ctx.id, club);
      if (!ev.canManage) { showToast('만든 사람이나 운영진만 테마를 바꿀 수 있어요.'); return 'cancel'; }
      const c = stepCards(steps, s.themesReady, s.themes);
      const p = planInsert(ev, steps, c.keys, c.date ?? ctx.date);
      if ('error' in p) { showToast(p.error); return 'cancel'; }
      if (p.confirm && !confirm(p.confirm)) return 'cancel';
      const next = await club.update(ev.id, p.input, ev.version);
      showToast(p.done);
      onDone(next);
      return 'ok';
    } catch (e) {
      showToast(sayClub(e));
      const latest = conflictOf(e);
      if (latest) { club.adopt(latest); return 'conflict'; }
      return errorCode(e) === 'NO_SUCH_EVENT' ? 'gone' : 'error';
    }
  }
}

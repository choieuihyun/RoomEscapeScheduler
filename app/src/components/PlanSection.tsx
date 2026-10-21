import { useState } from 'react';
import { fmt } from '../core';
import type { Plan } from '../cloud';
import type { UseAuthReturn } from '../useAuth';
import type { UsePlansReturn } from '../usePlans';
import type { Scheduler } from '../scheduler/useScheduler';
import { Ic } from './Ic';

/* "내 일정" 목록 — index.html의 #planSec + renderPlans() 이식. */
function PlanRow({ p, plans, s }: { p: Plan; plans: UsePlansReturn; s: Scheduler }) {
  const wish = p.status === 'wish';
  const busy = p.id != null && plans.busyIds.has(p.id);
  const seq = (p.steps || []).map((x, i) => <span key={i}><b>{fmt(x.start)}</b> {x.name}</span>);

  return (
    <div className={'plan ' + (wish ? 'wish' : 'done')}>
      <span className="pd">{p.date || ''}</span>
      <span className={'tag ' + (wish ? 'wish' : 'done')}>{wish ? '하고 싶음' : '다녀옴'}</span>
      <span className="pspan">{fmt(p.start)} → {fmt(p.end)} · {p.count}연방 · 대기 {p.total}분</span>
      <span className="pbtns">
        <button
          className="btn" type="button"
          onClick={() => {
            if (s.loadSnapshot(p.snapshot, p.date)) window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >불러오기</button>
        <button
          className="btn" type="button" disabled={busy}
          onClick={() => p.id && plans.flip(p.id)}
        >{wish ? '다녀옴으로' : '하고 싶음으로'}</button>
        <button
          className="btn" type="button" disabled={busy}
          onClick={() => {
            if (p.id && confirm(`${p.date} 일정을 지울까요?`)) plans.remove(p.id);
          }}
        >삭제</button>
      </span>
      <span className="pseq">
        {seq.map((el, i) => <span key={i}>{i > 0 && '  →  '}{el}</span>)}
        {'  →  '}<b>{fmt(p.end)}</b> 종료
      </span>
      {p.memo && <span className="pmemo">{p.memo}</span>}
    </div>
  );
}

/* 내 일정(2026-10-21 개편, 늦게 받는 청크) — 결과 아래 접힌 한 줄 "내 일정 · 저장한 일정 n개 ›", 누르면 지금까지의 목록 */
export function PlanSection({ auth, plans, s }: { auth: UseAuthReturn; plans: UsePlansReturn; s: Scheduler }) {
  const [open, setOpen] = useState(false);
  if (!auth.me) return null;
  const n = plans.plans.length;
  return (
    <section className="cz-plans" id="planSec" aria-label="내 일정">
      <button className="cz-sum cz-plans-sum" type="button" aria-expanded={open} aria-controls="czPlans" onClick={() => setOpen(o => !o)}>
        <Ic n="save" />
        <span className="cz-sum-t">
          <span className="cz-sum-1">내 일정</span>
          <span className="cz-sum-2">{n ? `저장한 일정 ${n}개` : '결과에서 저장을 누르면 여기 모여요'}</span>
        </span>
        <Ic n={open ? 'cup' : 'cright'} />
      </button>
      {open && (
        <div className="plans" id="czPlans">
          {n === 0 ? (
            <div className="empty">아직 저장한 일정이 없어요. 결과에서 <b>저장</b>을 눌러 보세요.</div>
          ) : (
            plans.plans.map(p => <PlanRow key={p.id} p={p} plans={plans} s={s} />)
          )}
        </div>
      )}
    </section>
  );
}

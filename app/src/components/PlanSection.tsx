import { fmt } from '../core';
import type { Plan } from '../cloud';
import type { UseAuthReturn } from '../useAuth';
import type { UsePlansReturn } from '../usePlans';
import type { Scheduler } from '../scheduler/useScheduler';

/* "내 일정" 목록 — index.html의 #planSec + renderPlans() 이식. */
function PlanRow({ p, plans, s }: { p: Plan; plans: UsePlansReturn; s: Scheduler }) {
  const wish = p.status === 'wish';
  const busy = p.id != null && plans.busyIds.has(p.id);
  const seq = (p.steps || []).map((x, i) => <span key={i}><b>{fmt(x.start)}</b> {x.name}</span>);

  return (
    <div className={'plan ' + (wish ? 'wish' : 'done')}>
      <span className="pd">{p.date || ''}</span>
      <span className={'tag ' + (wish ? 'wish' : 'done')}>{wish ? '하고 싶음' : '했음'}</span>
      <span className="pspan">{fmt(p.start)} → {fmt(p.end)} · {p.count}연방 · 공백 {p.total}분</span>
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
        >{wish ? '했음으로' : '하고 싶음으로'}</button>
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

export function PlanSection({ auth, plans, s }: { auth: UseAuthReturn; plans: UsePlansReturn; s: Scheduler }) {
  if (!auth.me) return null;
  return (
    <section className="sec" id="planSec">
      <div className="sec-head">
        <h2>내 일정</h2>
        <b className="count">{plans.plans.length ? plans.plans.length + '건' : ''}</b>
        <span>결과 카드의 <b className="hi">저장</b>을 누르면 여기에 쌓입니다</span>
      </div>
      <div className="plans">
        {plans.plans.length === 0 ? (
          <div className="empty">아직 저장한 일정이 없습니다. 결과 카드의 <b>저장</b>을 눌러 보세요.</div>
        ) : (
          plans.plans.map(p => <PlanRow key={p.id} p={p} plans={plans} s={s} />)
        )}
      </div>
    </section>
  );
}

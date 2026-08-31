import { pad } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';
import { MoveTimeGrid, moveHint } from './MoveTimeGrid';
import { TeamPanel } from './TeamPanel';

export function ConditionsPanel({ s }: { s: Scheduler }) {
  const hint = moveHint(s);

  return (
    <section className="sec">
      <div className="sec-head"><h2>조건</h2></div>
      <div className="opts">
        <div className="opt">
          <label>
            가장 이른 시작
            <button
              className="mini" type="button"
              onClick={() => {
                const d = new Date();
                s.setOption('oStart', pad(d.getHours()) + ':' + pad(d.getMinutes()));
              }}
            >지금부터</button>
          </label>
          <input className="mono" placeholder="13:00" value={s.options.oStart} onChange={e => s.setOption('oStart', e.target.value)} />
        </div>
        <div className="opt">
          <label>가장 늦은 종료</label>
          <input className="mono" placeholder="22:00" value={s.options.oEnd} onChange={e => s.setOption('oEnd', e.target.value)} />
        </div>
        <div className="opt">
          <label>최소 공백 (분)</label>
          <input className="mono" value={s.options.oMinGap} onChange={e => s.setOption('oMinGap', e.target.value)} />
        </div>
        <div className="opt">
          <label>최대 공백 (분)</label>
          <input className="mono" placeholder="90" value={s.options.oMaxGap} onChange={e => s.setOption('oMaxGap', e.target.value)} />
        </div>
        <div className="opt">
          <label>기본 이동시간 (분)</label>
          <input className="mono" value={s.options.oMove} onChange={e => s.setOption('oMove', e.target.value)} />
        </div>
      </div>
      <p className={hint.className}>{hint.content}</p>
      <MoveTimeGrid s={s} />
      <div className="checks">
        <label className="chk">
          <input type="checkbox" checked={s.options.oPartial} onChange={e => s.setOption('oPartial', e.target.checked)} />
          일부 테마만 넣은 조합도 계산
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.options.oMeal} onChange={e => s.setOption('oMeal', e.target.checked)} />
          식사 시간 확보
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.options.oTeam} onChange={e => s.setOption('oTeam', e.target.checked)} />
          여러 팀으로 나눠 배정
        </label>
      </div>
      <div className={'mealrow' + (s.options.oMeal ? ' on' : '')}>
        <input className="mono" value={s.options.oMealFrom} onChange={e => s.setOption('oMealFrom', e.target.value)} />
        <span className="lb">~</span>
        <input className="mono" value={s.options.oMealTo} onChange={e => s.setOption('oMealTo', e.target.value)} />
        <span className="lb">사이에</span>
        <input className="mono" value={s.options.oMealMin} onChange={e => s.setOption('oMealMin', e.target.value)} />
        <span className="lb">분 이상 공백을 남긴다</span>
      </div>
      <TeamPanel s={s} />
      <div className="run">
        <button className="btn-go" id="go" type="button" onClick={() => s.runSearch()}>조합 계산</button>
        <button className="btn" id="shareBtn" type="button" onClick={s.copyShareLink}>링크 복사</button>
        <span className="note">{s.runNote}</span>
      </div>
    </section>
  );
}

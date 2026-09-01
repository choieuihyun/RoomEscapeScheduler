import { mdWeekday, pad } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';
import { MoveTimeGrid, moveHint } from './MoveTimeGrid';
import { TeamPanel } from './TeamPanel';
import { TimePicker } from './TimePicker';

export function ConditionsPanel({ s }: { s: Scheduler }) {
  const hint = moveHint(s);
  /* 3연방은 보통 같은 날 몰아서 도는데, 세션 시각엔 날짜가 없어(core.ts) 서버에서
     불러온 테마끼리 날짜가 섞여도 계산 자체는 막을 방법이 없다 — 계산 전에
     눈에 띄게 알린다(§4.13/§4.39와 같은 "막지 말고 말한다" 원칙, §4.41). */
  const mismatchDates = [...new Set(s.themes.map(t => t.date).filter((d): d is string => !!d))];

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
          <TimePicker placeholder="13:00" clearable value={s.options.oStart} onChange={v => s.setOption('oStart', v)} />
        </div>
        <div className="opt">
          <label>
            가장 늦은 종료
            <button
              className="mini" type="button"
              onClick={() => s.setOption('oEnd', '23:59')}
            >자정</button>
          </label>
          <TimePicker placeholder="22:00" clearable value={s.options.oEnd} onChange={v => s.setOption('oEnd', v)} />
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
          식사 시간 포함
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.options.oTeam} onChange={e => s.setOption('oTeam', e.target.checked)} />
          여러 팀으로 나눠 배정
        </label>
        <label className="chk" title="회차 시간표 자체는 매진이어도 그대로 있으니, 계산에만 포함시켜 어떤 조합이 되는지 미리 봅니다. 매진 회차가 낀 조합은 타임라인에 매진 표시로 남아 예약이 안 된다는 걸 그대로 보여줍니다 — 취소표를 노려볼 때 씁니다.">
          <input type="checkbox" checked={s.options.oIncludeSoldout} onChange={e => s.setOption('oIncludeSoldout', e.target.checked)} />
          매진 회차도 포함해서 계산
        </label>
      </div>
      <div className={'mealrow' + (s.options.oMeal ? ' on' : '')}>
        <TimePicker value={s.options.oMealFrom} onChange={v => s.setOption('oMealFrom', v)} />
        <span className="lb">~</span>
        <TimePicker value={s.options.oMealTo} onChange={v => s.setOption('oMealTo', v)} />
        <span className="lb">사이에</span>
        <input className="mono" value={s.options.oMealMin} onChange={e => s.setOption('oMealMin', e.target.value)} />
        <span className="lb">분 이상 공백을 남긴다</span>
      </div>
      <TeamPanel s={s} />
      {mismatchDates.length > 1 && (
        <p className="datewarn">
          ⚠ 테마마다 날짜가 달라요 ({mismatchDates.map(d => mdWeekday(d)).join(', ')}) — 같은 날 회차로 맞춰야 정확한 조합이 나옵니다.
        </p>
      )}
      <div className="run">
        <button className="btn-go" id="go" type="button" onClick={() => s.runSearch()}>조합 계산</button>
        <button className="btn" id="shareBtn" type="button" onClick={s.copyShareLink}>링크 복사</button>
        <span className="note">{s.runNote}</span>
      </div>
    </section>
  );
}

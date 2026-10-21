import { useState } from 'react';
import { mdWeekday, pad } from '../core';
import { condSummary } from '../calcView';
import { lazyRetry } from '../lazyRetry';
import type { Scheduler } from '../scheduler/useScheduler';
import { Ic } from './Ic';
import { LazyBoundary } from './LazyBoundary';
import { MoveTimeGrid, moveHint } from './MoveTimeGrid';
import { TimePicker } from './TimePicker';

/* 여러 팀 칸은 켤 때 받는다 — 확정한 팀을 결과 카드(ResultCard)로 그려서, 진입 청크에 결과 코드가 들어오지 않게 */
const TeamPanel = lazyRetry(() => import('./TeamPanel').then(m => ({ default: m.TeamPanel })));
/* 넓은 화면(왼쪽 메뉴)인지 — SchedulerPage 의 WIDE 와 같은 기준. 좁으면 조건을 접어 두고 계산 단추를 아래 탭 위에 고정한다 */
const WIDE = 'not all and (max-width: 900px)';

/* 2단계 조건 · 3단계 계산(2026-10-21 개편) — 좁은 화면은 두 줄 요약으로 접고, 누르면 지금까지의 칸이 전부 펼쳐진다.
   날짜가 섞였다는 경고와 계산 안내(runNote)는 접혀 있어도 보이는 자리에 둔다 */
export function ConditionsPanel({ s }: { s: Scheduler }) {
  const [open, setOpen] = useState(() => matchMedia(WIDE).matches);
  const hint = moveHint(s);
  /* 3연방은 보통 같은 날 몰아서 도는데, 세션 시각엔 날짜가 없어(core.ts) 서버에서
     불러온 테마끼리 날짜가 섞여도 계산 자체는 막을 방법이 없다 — 계산 전에
     눈에 띄게 알린다(§4.13/§4.39와 같은 "막지 말고 말한다" 원칙, §4.41). */
  const mismatchDates = [...new Set(s.themes.map(t => t.date).filter((d): d is string => !!d))];
  const [l1, l2] = condSummary(s.options, s.teams.length);
  /* 좁은 화면은 계산 단추가 화면 아래에 붙어 있다 — 결과가 나오면 결과로 넘겨 준다(팀 확정·취소의 다시 계산에서는 넘기지 않는다) */
  const go = () => {
    s.runSearch();
    const ready = s.themes.filter(t => t.sessions.length && t.dur > 0).length >= 2;
    if (!ready || matchMedia(WIDE).matches) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* 결과 코드는 늦게 받을 수 있다 — 결과가 그려진 뒤에 넘긴다(먼저 넘기면 문서가 짧아 끝까지 못 간다). 2초까지 기다린다 */
    let n = 0;
    const tick = () => {
      if (document.getElementById('results') || ++n > 120) document.getElementById('resultsSec')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <section className="sec cz-sec" id="conds" aria-labelledby="czH2">
      <div className="cz-step">
        <h2 id="czH2"><span className="cz-stepn">2단계</span>조건</h2>
        {open && (
          <button className="cz-fold-btn" type="button" aria-expanded="true" aria-controls="czCond" onClick={() => setOpen(false)}>
            접기<Ic n="cup" />
          </button>
        )}
      </div>
      {!open ? (
        <button className="cz-sum" type="button" aria-expanded="false" aria-controls="czCond" onClick={() => setOpen(true)}>
          <span className="cz-sum-t"><span className="cz-sum-1 mono">{l1}</span><span className="cz-sum-2 mono">{l2}</span></span>
          <span className="sr-only">조건 펼치기</span>
          <Ic n="cright" />
        </button>
      ) : (
        <div className="cz-cond" id="czCond">
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
              <label>최소 대기 (분)</label>
              <input className="mono" value={s.options.oMinGap} onChange={e => s.setOption('oMinGap', e.target.value)} />
            </div>
            <div className="opt">
              <label>최대 대기 (분)</label>
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
            <label className="chk" title="끄면 어떤 테마부터 갈지까지 알아서 찾아 줘요. 켜면 카드에 놓인 순서대로 가는 걸로 보고 시간만 맞춰요. 갈 순서를 이미 정했을 때 켜세요.">
              <input type="checkbox" checked={s.options.oFixedOrder} onChange={e => s.setOption('oFixedOrder', e.target.checked)} />
              순서 그대로 계산
            </label>
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
            <label className="chk" title="매진된 회차도 계산에 넣어서 어떤 조합이 나오는지 미리 봐요. 매진이 낀 조합은 타임라인에 매진으로 표시돼요. 취소표를 노릴 때 쓰세요.">
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
            <span className="lb">분 이상 비워 두기</span>
          </div>
          {s.options.oTeam && <LazyBoundary><TeamPanel s={s} /></LazyBoundary>}
        </div>
      )}
      {mismatchDates.length > 1 && (
        <p className="datewarn">
          테마마다 날짜가 달라요 ({mismatchDates.map(d => mdWeekday(d)).join(', ')}) — 같은 날 회차로 맞춰야 조합이 제대로 나와요.
        </p>
      )}
      <div className="cz-run">
        {s.runNote && <p className="cz-runnote" role="status">{s.runNote}</p>}
        <div className="cz-run-b">
          <button className="btn cz-share" id="shareBtn" type="button" onClick={s.copyShareLink}><Ic n="link" />링크 복사</button>
          <button className="btn-go cz-go" id="go" type="button" onClick={go}><span className="cz-stepn">3단계</span>조합 계산하기</button>
        </div>
      </div>
    </section>
  );
}

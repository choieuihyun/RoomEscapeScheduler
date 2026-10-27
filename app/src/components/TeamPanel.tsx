import { fmt } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';
import { ResultCard } from './ResultCard';

const noop = () => {};

export function TeamPanel({ s }: { s: Scheduler }) {
  return (
    <div className={'teamrow' + (s.options.oTeam ? ' on' : '')}>
      <p className="teamhint">
        여러 팀이 같은 매장들을 나눠서 돌 때 써요. 결과에서 한 조합을 <b>팀 확정</b>하면
        그 회차는 다음 팀 계산에서 빠져요. 팀 수만큼 이어서 누르면 돼요.
      </p>
      <div>
        {s.teams.length === 0 ? (
          <p className="teamempty">아직 확정한 팀이 없어요. 아래 결과에서 <b className="hi">팀 확정</b>을 누르면 여기 모이고, 그 회차는 다음 계산에서 빠져요.</p>
        ) : (
          <>
            {s.teams.map((tm, i) => (
              <div key={i} className="teamcard">
                <div className="teamlabelrow">
                  <p className="teamlabel">{i + 1} 팀</p>
                  <button className="btn-x" type="button" title="이 팀 삭제" onClick={() => s.removeTeam(i)}>×</button>
                </div>
                {tm.row ? (
                  <ResultCard
                    r={tm.row} rank={i} lo={tm.row.start} hi={tm.row.end}
                    span={Math.max(tm.row.end - tm.row.start, 60)}
                    themeCount={tm.row.count} teamModeOn={false} onConfirmTeam={noop}
                    simple
                  />
                ) : (
                  <div className="teamchip">
                    <span className="mono">{fmt(tm.start)} → {fmt(tm.end)}</span>
                    <span className="dim">{tm.steps.map(st => `${st.name} ${fmt(st.t)}`).join(' · ')}</span>
                  </div>
                )}
              </div>
            ))}
            <p className="teamnext">다음은 <b>{s.teams.length + 1} 팀</b> 차례예요 (위 회차는 빼고 계산). 단톡방에 보낼 일정은 결과의 <b>복사</b>를 눌러 두세요.</p>
          </>
        )}
      </div>
      <div className="teamctl">
        <button className="btn" type="button" disabled={!s.teams.length} onClick={s.resetTeams}>전체 초기화</button>
      </div>
    </div>
  );
}

import { fmt } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';
import { ResultCard } from './ResultCard';

const noop = () => {};

export function TeamPanel({ s }: { s: Scheduler }) {
  return (
    <div className={'teamrow' + (s.options.oTeam ? ' on' : '')}>
      <p className="teamhint">
        같은 매장들을 여러 팀이 나눠 도는 경우용. 결과에서 한 조합을 <b>팀 확정</b>하면
        그 회차가 다음 팀 계산에서 빠지고 카드 목록은 다음 팀 후보로 바뀝니다. 팀 수만큼 이어서 누르면 됩니다.
      </p>
      <div>
        {s.teams.length === 0 ? (
          <p className="teamempty">확정된 팀이 아직 없습니다. 아래 결과에서 <b className="hi">팀 확정</b>을 누르면 여기 쌓이고, 그 회차는 다음 계산에서 빠집니다.</p>
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
            <p className="teamnext">다음: <b>{s.teams.length + 1} 팀</b> 후보를 계산합니다 (위 회차는 제외) — 단톡방에 보낼 일정은 위 카드의 <b>복사</b>를 눌러 두세요.</p>
          </>
        )}
      </div>
      <div className="teamctl">
        <button className="btn" type="button" disabled={!s.teams.length} onClick={s.resetTeams}>전체 초기화</button>
      </div>
    </div>
  );
}

import { fmt } from '../core';
import type { UseWatchesReturn } from '../useWatches';

/* F-16 "빈자리 알림" 목록. LoadModal.tsx/PlanSection.tsx와 같은 패턴
   (.modal/.mbox, .loaditem 재사용, 삭제는 confirm() 통과 후). */
export function WatchListModal({ w }: { w: UseWatchesReturn }) {
  return (
    <div
      className={'modal' + (w.open ? ' on' : '')}
      onClick={e => { if (e.target === e.currentTarget) w.close(); }}
    >
      <div className="mbox mbox-wide">
        <h3>빈자리 알림</h3>
        <p className="msub">매진 회차 옆 벨 아이콘으로 건 감시 목록입니다. 자리가 나면 푸시로 알려드려요.</p>
        <div className="loadlist">
          {w.watches.length === 0 ? (
            <div className="lmsg">아직 감시 중인 자리가 없어요.{'\n'}매진 회차 옆의 벨 아이콘을 눌러보세요.</div>
          ) : (
            w.watches.map(watch => {
              const busy = w.busyIds.has(watch.id);
              return (
                <div key={watch.id} className="loaditem">
                  <div className="li-t">
                    <strong>{watch.theme}</strong>
                    <span className="li-m">{watch.branch} · {watch.date} · {fmt(watch.t)}</span>
                    <span className="li-c">
                      {watch.available ? <b>빈자리 있음</b> : '매진'}
                    </span>
                  </div>
                  <button
                    className="btn-x" type="button" title="감시 해제" disabled={busy}
                    onClick={() => { if (confirm(`${watch.theme} ${fmt(watch.t)} 감시를 해제할까요?`)) w.remove(watch.id); }}
                  >×</button>
                </div>
              );
            })
          )}
        </div>
        <div className="loadfoot">
          <span>{w.watches.length}/{w.limit}개 감시 중</span>
        </div>
        <p className="merr">{w.err}</p>
        {w.pushNote && <p className="mnote">{w.pushNote}</p>}
        <div className="mbtns">
          <button className="btn" type="button" onClick={w.close}>닫기</button>
        </div>
        <p className="mnote">알림은 같은 자리에 대해 <b>1시간에 한 번</b>까지만 갑니다. 최대 <b>3개</b>까지 걸 수 있어요.</p>
      </div>
    </div>
  );
}

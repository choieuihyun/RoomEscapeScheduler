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
        <p className="msub">매진된 회차 옆 벨을 눌러 걸어 둔 알림이에요. 자리가 나면 알려 드려요.</p>
        <div className="loadlist">
          {w.watches.length === 0 ? (
            <div className="lmsg">아직 걸어 둔 알림이 없어요.{'\n'}매진된 회차 옆의 벨을 눌러 보세요.</div>
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
                    className="btn-x" type="button" title="빈자리 알림 끄기" disabled={busy}
                    onClick={() => { if (confirm(`${watch.theme} ${fmt(watch.t)} 빈자리 알림을 끌까요?`)) w.remove(watch.id); }}
                  >×</button>
                </div>
              );
            })
          )}
        </div>
        <div className="loadfoot">
          <span>{w.watches.length}/{w.limit}개 걸어 둠</span>
        </div>
        <p className="merr">{w.err}</p>
        {w.pushNote && <p className="mnote">{w.pushNote}</p>}
        <div className="mbtns">
          <button className="btn" type="button" onClick={w.close}>닫기</button>
        </div>
        <p className="mnote">같은 자리 알림은 <b>1시간에 한 번</b>만 가요. 최대 <b>3개</b>까지 걸 수 있어요.</p>
      </div>
    </div>
  );
}

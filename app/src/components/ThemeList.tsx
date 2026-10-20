import type { Scheduler } from '../scheduler/useScheduler';
import type { WatchControl } from '../useWatches';
import { ThemeCard } from './ThemeCard';

export function ThemeList({ s, onOpenLoad, watchCtl }: { s: Scheduler; onOpenLoad: () => void; watchCtl?: WatchControl }) {
  const n = s.themes.length;
  return (
    <section className="sec">
      <div className="sec-head">
        <h2>테마</h2>
        <b className="count">{n >= 2 ? n + '연방' : n + '개'}</b>
        <span>직접 넣을 때는 <b className="hi">매진된 회차는 빼고 넣어 주세요</b></span>
      </div>
      <div className="themes" id="themes">
        {n === 0 ? (
          <div className="empty">아직 테마가 없어요. 아래 ＋ 테마 추가를 눌러 주세요.</div>
        ) : (
          s.themes.map((th, i) => (
            <ThemeCard
              key={th.id} theme={th} index={i}
              onChange={s.updateTheme} onRawChange={s.updateRaw}
              onDelete={s.deleteTheme} onReorder={s.reorderTheme}
              onAttachImages={s.attachImages}
              watchCtl={watchCtl}
              soldIncluded={s.options.oIncludeSoldout}
              total={n}
            />
          ))
        )}
      </div>
      <div className="addrow">
        <button className="btn" id="addTheme" type="button" onClick={s.addTheme}>＋ 테마 추가</button>
        <button className="btn" id="loadBtn" type="button" onClick={onOpenLoad}>테마 불러오기</button>
        {/* 화면이 전제를 말해 주지 않으면 카드 순서가 곧 진행 순서로 읽힌다 — §4.14 가
            드러낸 문제라, 이제 모드마다 다른 문장을 띄운다(§4.46). */}
        <span className="addhint">
          {s.options.oFixedOrder
            ? <><b>카드 순서대로 가요.</b> 번호를 끌어서 순서를 바꾸세요 · <b>×</b> 로 삭제</>
            : <><b>순서는 알아서 찾아 줘요.</b> 아무 순서로 넣어도 돼요 · <b>×</b> 로 삭제</>}
        </span>
      </div>
    </section>
  );
}

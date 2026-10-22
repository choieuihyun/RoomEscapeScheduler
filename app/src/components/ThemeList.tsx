import { useRef } from 'react';
import { themesInfo } from '../calcView';
import type { Scheduler } from '../scheduler/useScheduler';
import type { WatchControl } from '../useWatches';
import { Ic } from './Ic';
import { ThemeCard } from './ThemeCard';

/* 1단계 테마 넣기(2026-10-21 개편) — 카드 목록 + 넣는 길 한 상자(직접 넣기·불러오기·사진 읽기).
   "카톡 붙여넣기"는 직접 넣기와 겹치고 쓰기 어려워 2026-10-22 사용자 요청으로 뺐다.
   비었으면 다음 행동 단추. 사용법 투어가 #loadBtn·#addTheme·#themes 를 가리킨다(빈 상태와 상자가 같이 그려지지 않는다) */
export function ThemeList({ s, onOpenLoad, watchCtl }: { s: Scheduler; onOpenLoad: () => void; watchCtl?: WatchControl }) {
  const n = s.themes.length;
  const imgRef = useRef<HTMLInputElement>(null);
  const photo = () => imgRef.current?.click();
  return (
    <section className="sec cz-sec" aria-labelledby="czH1">
      <div className="cz-step">
        <h2 id="czH1"><span className="cz-stepn">1단계</span>테마 넣기{n > 0 && <span className="cz-cnt">{n}개</span>}</h2>
        {n > 0 && <span className="cz-step-r">{themesInfo(s.themes, s.options.oFixedOrder)}</span>}
      </div>
      {n === 0 ? (
        <div className="cz-empty">
          <Ic n="calc" />
          <p className="cz-empty-t">테마를 넣으면 갈 수 있는 순서를 찾아 드려요</p>
          <p className="cz-empty-s">예약 사이트에서 회차를 불러오거나, 이름과 시간을 직접 넣어요</p>
          <div className="cz-empty-b">
            <button className="btn-go cz-btn" id="loadBtn" type="button" onClick={onOpenLoad}><Ic n="dl" />테마 불러오기</button>
            <button className="btn cz-btn" id="addTheme" type="button" onClick={() => s.addTheme('edit')}><Ic n="plus" />직접 넣기</button>
          </div>
          <div className="cz-empty-x">
            <button className="cz-link" type="button" onClick={photo}><Ic n="cam" />사진 읽기</button>
          </div>
        </div>
      ) : (
        <>
          <div className="cz-list" id="themes">
            {s.themes.map((th, i) => (
              <ThemeCard
                key={th.id} theme={th} index={i}
                onChange={s.updateTheme} onRawChange={s.updateRaw}
                onDelete={s.deleteTheme} onReorder={s.reorderTheme}
                onAttachImages={s.attachImages}
                watchCtl={watchCtl}
                soldIncluded={s.options.oIncludeSoldout}
                total={n}
              />
            ))}
          </div>
          <div className="cz-ways" role="group" aria-label="테마 넣기">
            <button id="addTheme" type="button" onClick={() => s.addTheme('edit')}><Ic n="plus" />직접 넣기</button>
            <button id="loadBtn" type="button" onClick={onOpenLoad}><Ic n="dl" />불러오기</button>
            <button type="button" onClick={photo}><Ic n="cam" />사진 읽기</button>          </div>
        </>
      )}
      <input
        ref={imgRef} type="file" accept="image/*" multiple hidden
        onChange={e => {
          const files = [...(e.target.files || [])];
          e.target.value = '';
          if (files.length) s.addThemeFromImages(files);
        }}
      />
    </section>
  );
}

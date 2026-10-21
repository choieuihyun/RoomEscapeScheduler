import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { fmt } from '../core';
import { foldChips } from '../calcView';
import type { Theme } from '../scheduler/types';
import type { WatchControl } from '../useWatches';
import { Ic } from './Ic';
import { WatchBell } from './WatchBell';

const DRAG_TYPE = 'application/x-theme-index';
/* 한글 조합 중 Enter·Esc 는 조합만 끝낸다 — 그때 닫으면 마지막 글자가 잘린다 */
const ime = (e: KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

export interface ThemeCardProps {
  theme: Theme;
  index: number;
  onChange: (id: number, patch: Partial<Theme>) => void;
  onRawChange: (id: number, raw: string) => void;
  onDelete: (id: number) => void;
  onReorder: (from: number, to: number) => void;
  onAttachImages: (id: number, files: File[]) => void;
  watchCtl?: WatchControl;
  /* 조건의 "매진 회차도 포함해서 계산"이 켜져 있는지 — 매진 칩의 안내가 달라진다 */
  soldIncluded?: boolean;
  total: number;
}

/* 테마 카드(2026-10-21 개편) — 머리 한 줄 "01 · 테마명 · 매장 · 70분 · ⋯" + 회차 칩 두 줄.
   머리 줄을 누르면 그 자리에서 이름·매장·분을 고치고, 시간 글(textarea)·사진 읽기·옮기기·빼기는 ⋯ 메뉴에 둔다.
   회차 해석·매진·빈자리 알림 종·자정 넘김·사진 읽기·끌어서 옮기기는 전과 같다(표시만 바꿨다) */
export function ThemeCard({ theme: th, index, onChange, onRawChange, onDelete, onReorder, onAttachImages, watchCtl, soldIncluded, total }: ThemeCardProps) {
  const [dragState, setDragState] = useState<'' | 'dragging' | 'over' | 'drag'>('');
  const [editing, setEditing] = useState(th.ui === 'edit');
  const [timeOpen, setTimeOpen] = useState(!!th.ui);
  const [menu, setMenu] = useState(false);
  const [all, setAll] = useState(false);
  const [cols, setCols] = useState(5);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = th.name || `테마 ${index + 1}`;

  /* 한 줄에 칩이 몇 칸 들어가는지(폭 따라 바뀐다) — 두 줄을 넘는 회차는 "+n개"로 접는다. 숨은 화면(display:none)에선 재지 않는다 */
  useEffect(() => {
    const g = gridRef.current;
    if (!g || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const t = getComputedStyle(g).gridTemplateColumns;
      if (t && t !== 'none') setCols(t.split(' ').length);
    });
    ro.observe(g);
    return () => ro.disconnect();
  }, []);

  /* 메뉴 — 열리면 첫 항목으로, 바깥을 누르면 닫는다 */
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
    const off = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !moreRef.current?.contains(t)) setMenu(false);
    };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [menu]);

  const closeMenu = (back = true) => { setMenu(false); if (back) moreRef.current?.focus(); };
  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menuRef.current!.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  /* 고치기를 끝내면 이름 줄 단추로 포커스를 돌려준다(키보드로 이어 쓰게) — 그려진 직후에 한 번 */
  const refocus = useRef(false);
  const done = () => { refocus.current = true; setEditing(false); };
  useEffect(() => {
    if (!editing && refocus.current) { refocus.current = false; nameRef.current?.focus(); }
  }, [editing]);

  const n = th.sessions.length;
  const fold = foldChips(n, cols);
  const f = all ? { shown: n, more: 0 } : fold;
  const over = th.sessions.some(s => s.t >= 24 * 60);
  const fixed = th.sessions.some(s => s.fixed);
  const soTitle = soldIncluded ? '매진 — 계산에 넣고 있어요' : '매진 — 계산에서 빠져요';
  /* 자정 넘김 안내는 손으로 넣은 회차만 — 예약 사이트에서 불러온 회차는 날짜를 넘긴 시각이 맞다(+1 칩으로 충분) */
  const note = over && th.source !== 'server'
    ? <p className="cz-note warn">자정을 넘긴 회차(+1)가 있어요. 순서가 섞였으면 <b>오전</b>/<b>오후</b>를 붙여 주세요.</p>
    : fixed ? <p className="cz-note">옅은 파란 칸은 오후로 바꿔 읽은 시간이에요 (예: 1:10 → 13:10)</p> : null;

  return (
    <article
      className={'cz-card' + (editing ? ' editing' : '') + (dragState ? ' ' + dragState : '')}
      aria-label={`테마 ${String(index + 1).padStart(2, '0')}${editing ? ', 고치는 중' : ''}`}
      style={{ '--accent': `var(--accent-${index % 6})` } as CSSProperties}
      onDragOver={e => {
        e.preventDefault();
        setDragState([...e.dataTransfer.types].includes(DRAG_TYPE) ? 'over' : 'drag');
      }}
      onDragLeave={() => setDragState('')}
      onDrop={e => {
        e.preventDefault();
        setDragState('');
        if ([...e.dataTransfer.types].includes(DRAG_TYPE)) {
          const from = +e.dataTransfer.getData(DRAG_TYPE);
          if (!Number.isNaN(from) && from !== index) onReorder(from, index);
          return;
        }
        const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
        if (files.length) onAttachImages(th.id, files);
      }}
    >
      <div className="cz-head">
        {/* 순서 번호 겸 끌어서 옮기는 손잡이(마우스). 터치는 ⋯ 의 위로/아래로 */}
        <span
          className="cz-idx" draggable title="끌어서 순서 바꾸기"
          onDragStart={e => {
            e.dataTransfer.setData(DRAG_TYPE, String(index));
            e.dataTransfer.effectAllowed = 'move';
            setDragState('dragging');
          }}
          onDragEnd={() => setDragState('')}
        >{String(index + 1).padStart(2, '0')}</span>
        {editing ? (
          <div className="cz-edit" onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === 'Escape') && !ime(e)) { e.preventDefault(); e.stopPropagation(); done(); }
          }}>
            <input className="cz-in-name" aria-label="테마 이름" placeholder="테마 이름" value={th.name} autoFocus
              onChange={e => onChange(th.id, { name: e.target.value })} />
            <input className="cz-in-place" aria-label="매장" placeholder="매장" value={th.place}
              title="같은 매장끼리는 이동시간이 없어요. 매장이 다르면 조건에 적은 이동시간을 넣어 계산해요. 비워 두면 이동시간 없이 계산해요"
              onChange={e => onChange(th.id, { place: e.target.value })} />
            <span className="cz-in-durw">
              <input className="cz-in-dur mono" aria-label="소요 시간(분)" value={th.dur} inputMode="numeric"
                onChange={e => onChange(th.id, { dur: Math.max(1, parseInt(e.target.value) || 0) })} />
              <span className="unit" aria-hidden="true">분</span>
            </span>
            <button type="button" className="cz-done" aria-label="고치기 완료" title="고치기 완료" onClick={done}><Ic n="check" /><span className="cz-done-t">완료</span></button>
          </div>
        ) : (
          <>
            <button type="button" className="cz-name" ref={nameRef} onClick={() => setEditing(true)} title="눌러서 이름·매장·분 고치기">
              <span className={'cz-nm' + (th.name ? '' : ' none')}>{th.name || '이름 없는 테마'}</span>
              {th.place && <span className="cz-pl">· {th.place}</span>}
              <span className="cz-du">· {th.dur}분</span>
              <span className="sr-only"> 고치기</span>
            </button>
            <button type="button" className="cz-more" ref={moreRef} aria-label={`${label} 메뉴`} title="더 보기"
              aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}><Ic n="more" /></button>
          </>
        )}
        {menu && (
          <div className="cz-menu" role="menu" aria-label={`${label} 메뉴`} ref={menuRef} onKeyDown={onMenuKey}
            /* Tab 으로 메뉴 밖에 나가면 닫는다. 사파리는 누른 단추에 포커스를 주지 않아 relatedTarget 이 비므로 그때는 두고(누르기를 잃지 않게) 바깥 누르기가 닫는다 */
            onBlur={e => { if (e.relatedTarget && !menuRef.current?.contains(e.relatedTarget as Node)) setMenu(false); }}>
            <button type="button" role="menuitem" onClick={() => { closeMenu(false); setTimeOpen(true); }}><Ic n="pen" />시간 직접 고치기</button>
            <button type="button" role="menuitem" onClick={() => { closeMenu(); fileRef.current?.click(); }}><Ic n="cam" />사진에서 읽기</button>
            <button type="button" role="menuitem" disabled={index === 0} onClick={() => { onReorder(index, index - 1); closeMenu(); }}><Ic n="up" />위로 옮기기</button>
            <button type="button" role="menuitem" disabled={index === total - 1} onClick={() => { onReorder(index, index + 1); closeMenu(); }}><Ic n="down" />아래로 옮기기</button>
            <span className="cz-menu-hr" role="separator" />
            <button type="button" role="menuitem" className="bad" onClick={() => onDelete(th.id)}><Ic n="trash" />이 테마 빼기</button>
          </div>
        )}
      </div>

      <div className="cz-chips" ref={gridRef}>
        {th.sessions.slice(0, f.shown).map((s, k) => (
          <span key={k} className={'cz-chip' + (s.fixed ? ' fix' : '') + (s.soldout ? ' so' : '')}
            title={s.fixed ? '오전/오후가 없어서 오후로 바꿔 읽은 시간이에요' : s.soldout ? soTitle : undefined}>
            <span className="cz-t">{fmt(s.t)}</span>
            {s.t >= 24 * 60 && <><span className="cz-p1" aria-hidden="true">+1</span><span className="sr-only"> 다음날</span></>}
            {s.soldout && <span className="sr-only"> 매진</span>}
            {s.soldout && s.id != null && watchCtl && <WatchBell slotId={s.id} ctl={watchCtl} />}
          </span>
        ))}
        {f.more > 0 && <button type="button" className="cz-chip cz-fold" aria-label={`회차 ${f.more}개 더 보기`} onClick={() => setAll(true)}>+{f.more}개</button>}
        {all && fold.more > 0 && <button type="button" className="cz-chip cz-fold" onClick={() => setAll(false)}>접기</button>}
        {!n && !timeOpen && <button type="button" className="cz-chip cz-fold cz-addt" onClick={() => setTimeOpen(true)}>+ 시간 넣기</button>}
      </div>
      {note}
      {th.source.startsWith('image') && <p className="cz-note warn">사진에서 읽은 시간이에요. 잘못 읽었을 수 있으니 한 번 확인해 주세요.</p>}

      {timeOpen && (
        <div className="cz-time">
          <textarea
            aria-label={`${label} 회차 시간`} autoFocus={!editing}
            placeholder={'10:00  13:10  15:40  17:20  ← 예약 가능한 회차만 (쉼표·줄바꿈도 돼요)\n카톡에서 복사한 글이나 예약 화면 캡처를 붙여넣어도 돼요 (Ctrl+V)'}
            value={th.raw}
            onChange={e => onRawChange(th.id, e.target.value)}
            onPaste={e => {
              const item = [...e.clipboardData.items].find(it => it.type.startsWith('image/'));
              if (!item) return;             // 텍스트 붙여넣기는 그대로 통과
              e.preventDefault();
              const file = item.getAsFile();
              if (file) onAttachImages(th.id, [file]);
            }}
          />
          <div className="cz-time-foot">
            <button type="button" className="btn cz-sm" onClick={() => fileRef.current?.click()}>
              <Ic n="cam" />{th.source.startsWith('image') && n ? '사진 더 넣기' : '사진 넣기'}
            </button>
            <label className="chk mini" title="켜 두면 새 사진의 회차를 원래 회차에 더해요. 끄면 원래 회차를 지우고 새 사진으로 바꿔요">
              <input type="checkbox" checked={th.mergeMode} onChange={e => onChange(th.id, { mergeMode: e.target.checked })} /> 이미지 여러장 넣기
            </label>
            <button type="button" className="btn cz-sm cz-time-x" onClick={() => setTimeOpen(false)}>닫기</button>
          </div>
        </div>
      )}
      {th.busy && <p className="busy cz-msg" role="status">{th.busy}</p>}
      {th.err && <p className="err cz-msg" role="alert">{th.err}</p>}
      <input
        ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={e => {
          const files = [...(e.target.files || [])];
          e.target.value = '';       // 같은 파일을 다시 골라도 change가 뜨도록
          if (files.length) onAttachImages(th.id, files);
        }}
      />
    </article>
  );
}

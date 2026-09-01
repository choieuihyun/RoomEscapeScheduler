import { useState, type CSSProperties } from 'react';
import { fmt } from '../core';
import type { Theme } from '../scheduler/types';
import type { WatchControl } from '../useWatches';

/* F-16 감시 토글 — 라인 아이콘 하나(벨)로 켜짐/꺼짐만 가른다.
   서버 로드 회차(session.id 있음)에만 뜬다 — 수동 입력·이미지 인식엔 감시를
   걸 slotId 자체가 없다(작업명세서 §4.5). */
function WatchBell({ slotId, ctl }: { slotId: number; ctl: WatchControl }) {
  const on = ctl.isWatching(slotId);
  const disabled = ctl.busy(slotId) || (!on && ctl.atLimit) || !ctl.loggedIn;
  const title = !ctl.loggedIn
    ? '로그인하면 감시할 수 있어요'
    : on ? '감시 해제'
    : ctl.atLimit ? '최대 3개까지 감시할 수 있어요 — 목록에서 하나를 지워주세요'
    : '빈자리 알림 걸기';
  return (
    <button
      type="button" className={'watch-toggle' + (on ? ' on' : '')} disabled={disabled} title={title}
      onClick={e => { e.stopPropagation(); ctl.toggle(slotId); }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>
  );
}

const DRAG_TYPE = 'application/x-theme-index';

function fmtDay(t: number): string {
  return t >= 24 * 60 ? '다음날 ' + fmt(t) : fmt(t);
}

function ChipLine({ th }: { th: Theme }) {
  const avail = th.sessions.filter(s => !s.soldout).length;
  const sold = th.sessions.length - avail;
  const src = th.source === 'image'
    ? (th.imgCount > 1 ? `사진 ${th.imgCount}장에서 읽음` : '사진에서 읽음')
    : th.source === 'image-edited' ? '사진 → 수정함'
    : th.source === 'server' ? '불러옴'
    : th.source === 'server-edited' ? '불러옴 → 수정함'
    : th.sessions.length ? '직접 입력' : '';
  return (
    <span className="chip">
      {src && <span className="src">{src}</span>}
      {src && ' · '}
      {th.sessions.length ? (
        <>회차 <b>{avail}</b>{sold ? <> · 매진 <i>{sold}</i></> : null} </>
      ) : '회차 없음'}
    </span>
  );
}

function ParsedSessions({ th, watchCtl }: { th: Theme; watchCtl?: WatchControl }) {
  if (!th.sessions.length) {
    return <div className="parsed"><span className="hint">시간을 넣으면 해석 결과가 여기 표시됩니다</span></div>;
  }
  const over = th.sessions.some(s => s.t >= 24 * 60);
  const fixed = th.sessions.some(s => s.fixed);
  const sold = th.sessions.filter(s => s.soldout).length;
  return (
    <div className="parsed">
      {th.sessions.map((s, i) => {
        const cls = 't' + (s.t >= 24 * 60 ? ' over' : '') + (s.fixed ? ' fix' : '') + (s.soldout ? ' so' : '');
        const title = s.fixed ? '오전/오후 표기가 없어 12시간 보정된 값입니다' : undefined;
        return (
          <span key={i} className={cls} title={title}>
            {fmtDay(s.t)}{s.soldout ? ' 매진' : ''}
            {s.soldout && s.id != null && watchCtl && <WatchBell slotId={s.id} ctl={watchCtl} />}
          </span>
        );
      })}
      {sold > 0 && <span className="note">매진으로 읽힌 {sold}개는 계산에서 제외됩니다</span>}
      {over ? (
        <span className="warn">자정을 넘긴 회차가 있습니다. 이른 시간부터 순서대로 넣었는지 확인해 주세요 — 순서가 섞였다면 <b>오전</b>/<b>오후</b>를 붙이면 순서와 무관하게 정확해집니다.</span>
      ) : fixed ? (
        <span className="note">파란색은 12시간 보정된 값입니다 (예: 1:10 → 13:10)</span>
      ) : null}
      {th.fresh && <span className="note">서버에서 불러온 값입니다 · {th.fresh}</span>}
      {th.source.startsWith('image') && (
        <span className="warn">사진에서 읽은 값입니다 — 시간이 제대로 맞는지 한 번 확인해 주세요. 인식이 부정확할 수 있습니다.</span>
      )}
    </div>
  );
}

export interface ThemeCardProps {
  theme: Theme;
  index: number;
  onChange: (id: number, patch: Partial<Theme>) => void;
  onRawChange: (id: number, raw: string) => void;
  onDelete: (id: number) => void;
  onReorder: (from: number, to: number) => void;
  onAttachImages: (id: number, files: File[]) => void;
  watchCtl?: WatchControl;
}

export function ThemeCard({ theme: th, index, onChange, onRawChange, onDelete, onReorder, onAttachImages, watchCtl }: ThemeCardProps) {
  const [dragState, setDragState] = useState<'' | 'dragging' | 'over' | 'drag'>('');

  return (
    <div
      className={'card' + (dragState === 'dragging' ? ' dragging' : dragState === 'over' ? ' over' : dragState === 'drag' ? ' drag' : '')}
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
      <div className="card-top">
        <span
          className="idx"
          draggable
          onDragStart={e => {
            e.dataTransfer.setData(DRAG_TYPE, String(index));
            e.dataTransfer.effectAllowed = 'move';
            setDragState('dragging');
          }}
          onDragEnd={() => setDragState('')}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <input
          className="i-name" placeholder="테마 이름" value={th.name}
          onChange={e => onChange(th.id, { name: e.target.value })}
        />
        <input
          className="i-dur mono" value={th.dur} inputMode="numeric"
          onChange={e => onChange(th.id, { dur: Math.max(1, parseInt(e.target.value) || 0) })}
        />
        <span className="unit">분</span>
        <button className="btn-x" title="삭제" type="button" onClick={() => onDelete(th.id)}>×</button>
      </div>
      <div className="placerow">
        <span className="plb">매장</span>
        <input
          className="i-place" placeholder="비워두면 이동시간을 안 붙입니다" value={th.place}
          title="같은 매장끼리는 이동시간이 0 입니다. 매장이 다르면 조건의 이동시간이 붙습니다"
          onChange={e => onChange(th.id, { place: e.target.value })}
        />
      </div>
      <textarea
        placeholder={'10:00  13:10  15:40  17:20  ← 예약 가능한 회차만 (쉼표·줄바꿈도 됨)\n또는 예약 화면 캡처를 붙여넣기 (Ctrl+V)'}
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
      <ParsedSessions th={th} watchCtl={watchCtl} />
      <div className="card-foot">
        <label className="btn-img">
          {th.source.startsWith('image') && th.sessions.length ? '이미지 추가' : '이미지 첨부'}
          <input
            type="file" accept="image/*" multiple
            onChange={e => {
              const files = [...(e.target.files || [])];
              e.target.value = '';       // 같은 파일을 다시 골라도 change가 뜨도록
              if (files.length) onAttachImages(th.id, files);
            }}
          />
        </label>
        <label className="chk mini" title="켜두면 새 이미지가 있던 회차에 이어 붙습니다. 꺼두면 새 이미지가 있던 값을 지우고 대신합니다">
          <input type="checkbox" checked={th.mergeMode} onChange={e => onChange(th.id, { mergeMode: e.target.checked })} /> 이미지 여러장 넣기
        </label>
        <ChipLine th={th} />
        <span className="busy">{th.busy}</span>
        <span className="err">{th.err}</span>
      </div>
    </div>
  );
}

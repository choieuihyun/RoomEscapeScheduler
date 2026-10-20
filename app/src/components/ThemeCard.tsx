import { useState, type CSSProperties } from 'react';
import { fmt, mdWeekday } from '../core';
import type { Theme } from '../scheduler/types';
import type { WatchControl } from '../useWatches';
import { WatchBell } from './WatchBell';

const DRAG_TYPE = 'application/x-theme-index';

/* 카드 아래 한 줄 요약 — 어디서 가져왔는지는 위 안내 줄이 말하므로 숫자만 */
function ChipLine({ th }: { th: Theme }) {
  const avail = th.sessions.filter(s => !s.soldout).length;
  const sold = th.sessions.length - avail;
  return (
    <span className="chip">
      {th.sessions.length ? (
        <>예약 가능 <b>{avail}</b>{sold ? <> · 매진 <i>{sold}</i></> : null} </>
      ) : '회차 없음'}
    </span>
  );
}

/* 회차 표(2026-10-20) — 알약을 줄줄이 흘리면 줄마다 들쭉날쭉해서 읽기 어려웠다. 같은 폭 칸의 격자로 세우고
   시작 시각을 크게, 끝 시각은 작고 흐리게(좁은 화면은 뺀다). 회차가 많거나 자정을 넘기면 오전·오후·저녁·다음날로
   줄을 나눈다. 매진은 흐린 글자 + 취소선 + 작은 "매진". */
const PERIODS: [string, number][] = [['오전', 12 * 60], ['오후', 18 * 60], ['저녁', 24 * 60], ['다음날', Infinity]];
const GROUP_AT = 8;

function ParsedSessions({ th, watchCtl, soldIncluded }: { th: Theme; watchCtl?: WatchControl; soldIncluded?: boolean }) {
  if (!th.sessions.length) {
    return <div className="parsed"><span className="hint">시간을 넣으면 여기에 정리돼서 보여요</span></div>;
  }
  const over = th.sessions.some(s => s.t >= 24 * 60);
  const fixed = th.sessions.some(s => s.fixed);
  const sold = th.sessions.filter(s => s.soldout).length;
  const grouped = over || th.sessions.length >= GROUP_AT;
  const rows = grouped
    ? PERIODS.map(([label, end], i) => ({
      label, items: th.sessions.filter(s => s.t < end && s.t >= (i ? PERIODS[i - 1][1] : 0)),
    })).filter(r => r.items.length)
    : [{ label: '', items: th.sessions }];
  return (
    <div className="parsed">
      <div className="slots">
        {rows.map(r => (
          <div key={r.label} className="slot-row">
            {grouped && <span className="slot-lb">{r.label}</span>}
            <div className="slot-grid">
              {r.items.map(s => {
                const cls = 't' + (s.fixed ? ' fix' : '') + (s.soldout ? ' so' : '');
                const title = s.fixed ? '오전/오후가 없어서 오후로 바꿔 읽은 시간이에요' : undefined;
                return (
                  <span key={th.sessions.indexOf(s)} className={cls} title={title}>
                    <span className="t-s">{fmt(s.t)}</span>
                    {s.soldout ? <span className="t-so">매진</span> : <span className="t-end">~{fmt(s.t + th.dur)}</span>}
                    {s.soldout && s.id != null && watchCtl && <WatchBell slotId={s.id} ctl={watchCtl} />}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {sold > 0 && (
        <span className="note">
          {soldIncluded ? '매진 회차도 계산에 넣고 있어요.' : <>매진 회차는 계산에서 빠져요. 넣으려면 아래에서 '매진 회차도 포함해서 계산'을 선택해 주세요.</>}
        </span>
      )}
      {over ? (
        <span className="warn">자정을 넘긴 회차가 있어요. 이른 시간부터 차례로 넣었는지 확인해 주세요 — 순서가 섞였으면 <b>오전</b>/<b>오후</b>를 붙이면 정확해져요.</span>
      ) : fixed ? (
        <span className="note">옅은 파란 칸은 오후로 바꿔 읽은 시간이에요 (예: 1:10 → 13:10)</span>
      ) : null}
      {(th.fresh || th.date) && (
        <span className="note">
          예약 사이트에서 불러왔어요{th.fresh && <> · {th.fresh}</>}{th.date && <> · <b>{mdWeekday(th.date)}</b> 회차</>}
        </span>
      )}
      {th.source.startsWith('image') && (
        <span className="warn">사진에서 읽은 시간이에요. 잘못 읽었을 수 있으니 한 번 확인해 주세요.</span>
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
  /* 조건의 "매진 회차도 포함해서 계산"이 켜져 있는지 — 매진 안내 문구가 달라진다 */
  soldIncluded?: boolean;
  total: number;
}

export function ThemeCard({ theme: th, index, onChange, onRawChange, onDelete, onReorder, onAttachImages, watchCtl, soldIncluded, total }: ThemeCardProps) {
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
        {/* 드래그는 터치에서 안 먹힌다(HTML5 DnD가 마우스 전용) — 버튼은 어디서나 된다. */}
        <div className="reorder-btns">
          <button type="button" title="위로" disabled={index === 0} onClick={() => onReorder(index, index - 1)}>▲</button>
          <button type="button" title="아래로" disabled={index === total - 1} onClick={() => onReorder(index, index + 1)}>▼</button>
        </div>
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
          className="i-place" placeholder="비워 두면 이동시간 없이 계산해요" value={th.place}
          title="같은 매장끼리는 이동시간이 없어요. 매장이 다르면 조건에 적은 이동시간을 넣어 계산해요"
          onChange={e => onChange(th.id, { place: e.target.value })}
        />
      </div>
      <textarea
        placeholder={'10:00  13:10  15:40  17:20  ← 예약 가능한 회차만 (쉼표·줄바꿈도 돼요)\n예약 화면 캡처를 붙여넣어도 돼요 (Ctrl+V)'}
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
      <ParsedSessions th={th} watchCtl={watchCtl} soldIncluded={soldIncluded} />
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
        <label className="chk mini" title="켜 두면 새 사진의 회차를 원래 회차에 더해요. 끄면 원래 회차를 지우고 새 사진으로 바꿔요">
          <input type="checkbox" checked={th.mergeMode} onChange={e => onChange(th.id, { mergeMode: e.target.checked })} /> 이미지 여러장 넣기
        </label>
        <ChipLine th={th} />
        <span className="busy">{th.busy}</span>
        <span className="err">{th.err}</span>
      </div>
    </div>
  );
}

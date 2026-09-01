import { useEffect, useRef, useState } from 'react';

/* native <input type="time">의 스피너 화살표가 불편하다는 요청으로 만든
   대체 컴포넌트 — 클릭하면 30분 단위 후보가 드롭다운으로 뜨고, 직접
   타이핑도 그대로 된다(Notion Calendar 스타일). 값 형식은 기존과 동일한
   "HH:MM" 문자열이라 ConditionsPanel의 나머지 로직(parseClock 등)은
   손댈 필요가 없다. */

const OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function normalize(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

export function TimePicker({
  value, onChange, placeholder, clearable,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('.tp-opt.on') as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' });
  }, [open]);

  const commit = (raw: string) => {
    const n = normalize(raw);
    if (n != null) onChange(n);
    else setDraft(value); // 못 알아들은 입력은 되돌린다
  };

  return (
    <div className="tpicker" ref={boxRef}>
      <input
        className="mono" placeholder={placeholder} value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => { commit(draft); setOpen(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(draft); setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setDraft(value); setOpen(false); }
        }}
      />
      {open && (
        <div className="tp-list" ref={listRef}>
          {clearable && (
            <div
              className={'tp-opt tp-clear' + (value === '' ? ' on' : '')}
              onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); }}
            >제한 없음</div>
          )}
          {OPTIONS.map(t => (
            <div
              key={t} className={'tp-opt' + (t === value ? ' on' : '')}
              onMouseDown={e => { e.preventDefault(); onChange(t); setOpen(false); }}
            >{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

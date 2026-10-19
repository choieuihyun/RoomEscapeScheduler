import { useEffect, useRef, useState } from 'react';
import type { PushBannerData } from '../swLink';
import { PUSH_BANNER_EVT as EVT } from '../toast';

/* 앱 탭이 보이는 동안 온 푸시를 화면 위쪽 띠로 보인다(작업명세서 §4.10). 이때는 서비스 워커가 알림을 띄우지 않아
   이게 없으면 테스트 알림을 보내도 아무 일이 없는 것처럼 보인다. 토스트와 따로 둔다 — 단추(열기·닫기)가 있고 더 오래 남는다.
   8초 뒤 사라지고, 마우스·포커스가 안에 있는 동안은 기다린다. 새 알림이 오면 앞 것을 바꾼다. */

const SHOW_MS = 8000;

export function PushBanner({ onOpen }: { onOpen: (eventId: number) => void }) {
  const [item, setItem] = useState<(PushBannerData & { seq: number }) | null>(null);
  const [held, setHeld] = useState({ hover: false, focus: false });

  useEffect(() => {
    let seq = 0;
    const on = (e: Event) => setItem({ ...(e as CustomEvent<PushBannerData>).detail, seq: ++seq });
    addEventListener(EVT, on);
    return () => removeEventListener(EVT, on);
  }, []);

  /* 잡혀 있지 않을 때만 시계가 돈다 — 놓으면 8초를 다시 센다 */
  const hold = held.hover || held.focus;
  const seq = item?.seq;
  useEffect(() => {
    if (seq === undefined || hold) return;
    const t = window.setTimeout(() => setItem((cur) => (cur?.seq === seq ? null : cur)), SHOW_MS);
    return () => clearTimeout(t);
  }, [seq, hold]);

  const boxRef = useRef<HTMLDivElement>(null);
  const close = () => { setItem(null); setHeld({ hover: false, focus: false }); };

  return (
    /* 늘 떠 있는 aria-live 칸 — 안에 들어온 글을 화면 읽기 프로그램이 읽는다 */
    <div className="pushbanner-wrap" aria-live="polite" role="status">
      {item && (
        <div
          key={item.seq} ref={boxRef} className="pushbanner"
          onMouseEnter={() => setHeld((h) => ({ ...h, hover: true }))}
          onMouseLeave={() => setHeld((h) => ({ ...h, hover: false }))}
          onFocus={() => setHeld((h) => ({ ...h, focus: true }))}
          onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setHeld((h) => ({ ...h, focus: false })); }}
        >
          <svg className="pushbanner-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <div className="pushbanner-txt">
            <b>{item.title}</b>
            {item.body && <span>{item.body}</span>}
          </div>
          {item.eventId !== null && (
            <button type="button" className="pushbanner-open" onClick={() => { onOpen(item.eventId!); close(); }}>열기</button>
          )}
          <button type="button" className="pushbanner-x" aria-label="알림 닫기" onClick={close}>×</button>
        </div>
      )}
    </div>
  );
}

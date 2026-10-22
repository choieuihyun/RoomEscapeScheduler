import { useEffect, useRef, type ReactNode } from 'react';
import { useBackClose } from '../backStack';
import type { Guide } from '../installPrompt';
import { isIOS } from '../pushState';

/* 앱 설치 안내 — 브라우저가 설치 창을 띄워 주지 않는 곳에서 "앱 설치"를 누르면 뜬다(2026-10-22).
   알림 켜기 안내(PushGuide)와 같은 모양·같은 문구 관용(카카오톡 메뉴는 ⋮).
   - 아이폰·아이패드: 공유 → 홈 화면에 추가 → 홈 화면의 Floduler 로 열기
   - 카카오톡 안: 다른 브라우저로 열기가 먼저. 아이폰이면 이어서 홈 화면 단계, 아니면 열린 브라우저에서 다시 "앱 설치" */

const IOS_STEPS: ReactNode[] = [
  <>사파리 아래쪽 <b>공유</b> 단추를 눌러요(안 보이면 <b>⋯</b> 안에 있어요)</>,
  <><b>홈 화면에 추가</b>를 누르고 <b>추가</b></>,
  <>홈 화면에 생긴 <b>Floduler</b> 아이콘으로 열기</>,
];
const KAKAO_STEP = <>오른쪽 위 <b>⋮</b> → <b>다른 브라우저로 열기</b></>;

export function InstallGuide({ kind, onClose }: { kind: Guide; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useBackClose(true, onClose); // 뒤로 가기로 닫는다

  /* 열리면 단추로, 닫히면 열기 전 자리로 포커스. 단추가 하나라 Tab 은 그 단추에 머문다. Esc 로 닫는다 */
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const btn = boxRef.current?.querySelector<HTMLButtonElement>('button');
    btn?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') { e.preventDefault(); btn?.focus(); }
      else if (e.key === 'Escape' && !e.isComposing) onClose();
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); back?.focus?.(); };
  }, [onClose]);

  const ios = isIOS(navigator.userAgent, navigator.maxTouchPoints || 0);
  const steps = kind === 'ios' ? IOS_STEPS
    : ios ? [KAKAO_STEP, ...IOS_STEPS]
    : [KAKAO_STEP, <>열린 브라우저에서 <b>앱 설치</b>를 다시 눌러요</>];
  const sub = kind === 'ios'
    ? '홈 화면에 추가하면 앱처럼 바로 열려요. 아이폰은 그래야 일정 알림도 받을 수 있어요. 아래 순서대로 한 번만 해 주세요.'
    : '카카오톡 안에서는 설치할 수 없어요. 다른 브라우저로 먼저 열어 주세요.';

  return (
    <div className="modal on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox pg-box" ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ig-h">
        <h3 id="ig-h">{kind === 'ios' ? '홈 화면에 추가하기' : '앱 설치'}</h3>
        <p className="msub pg-sub">{sub}</p>
        <ol className="pg-steps">
          {steps.map((s, i) => (
            <li key={i}><span className="pg-n" aria-hidden="true">{i + 1}</span><div>{s}</div></li>
          ))}
        </ol>
        <div className="mbtns col">
          <button type="button" className="btn-go pg-go" onClick={onClose}>알겠어요</button>
        </div>
        {kind === 'ios' && <p className="pg-note">크롬 등 다른 브라우저는 주소창 옆 공유 단추에서 찾을 수 있어요.</p>}
      </div>
    </div>
  );
}

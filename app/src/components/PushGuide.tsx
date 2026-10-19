import { useEffect, useRef, type ReactNode } from 'react';
import type { UsePushDeviceReturn } from '../usePushDevice';

/* 일정 알림 켜기 안내 (작업명세서 §4.10, 목업 ④ 오른쪽). 승인된 멤버에게 이 기기에서 한 번 저절로 뜨고,
   내 정보 "이 기기 알림"의 "자세히"로 다시 연다.
   - 아이폰 사파리 탭: 홈 화면에 추가 → 거기서 열기 → 알림 켜기, 세 단계. 이 탭에선 알림을 켤 수 없어 "알림 켜기" 단추는 없다
     (홈 화면 앱은 저장소가 따로라 거기서 열면 이 안내가 다시 뜨고, 그때는 "알림 켜기"가 있다).
   - 카카오톡 안: "다른 브라우저로 열기"가 먼저. 아이폰이면 이어서 홈 화면 단계.
   - 그 밖: "알림 켜기" 하나. */

const WHAT = '일정 전날, 자리가 다 찼을 때, 예약이 끝났을 때 알려 드려요.';
const HOME_STEPS: ReactNode[] = [
  <>사파리 아래쪽 <b>공유</b> 단추 → <b>홈 화면에 추가</b></>,
  <>홈 화면에 생긴 <b>Floduler</b> 아이콘으로 열기</>,
  <>거기서 <b>알림 켜기</b>를 누르고 <b>허용</b></>,
];
const KAKAO_STEP = <>오른쪽 위 <b>⋮</b> → <b>다른 브라우저로 열기</b></>;

export function PushGuide({ push }: { push: UsePushDeviceReturn }) {
  const v = push.guide;
  const boxRef = useRef<HTMLDivElement>(null);

  /* 열리면 첫 단추로, 닫히면 열기 전 자리로 포커스를 옮긴다 */
  useEffect(() => {
    if (v === null) return;
    const back = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { back?.focus?.(); };
  }, [v]);

  /* 닫혀 있을 땐 그리지 않는다 — 다른 창처럼 .modal 을 숨겨 두었다가 .on 으로 바꾸면, 숨김이 풀리는 중이라
     첫 단추에 포커스가 들어가지 않을 때가 있었다(헤드리스 실측, 들쭉날쭉) */
  if (v === null) return null;

  let sub: ReactNode = WHAT;
  let steps: ReactNode[] = [];
  let note: ReactNode = null;
  if (v === 'ios') {
    sub = `${WHAT} 아이폰은 아래 순서대로 한 번만 해 주세요.`;
    steps = HOME_STEPS;
    note = '카카오톡 안에서 열었다면 오른쪽 위 ⋮ → 다른 브라우저로 열기를 먼저 해 주세요.';
  } else if (v === 'kakao') {
    sub = `${WHAT} 카카오톡 안에서는 알림을 받을 수 없어요. 아래 순서대로 한 번만 해 주세요.`;
    steps = push.ios ? [KAKAO_STEP, ...HOME_STEPS] : [KAKAO_STEP, <>열린 브라우저에서 <b>알림 켜기</b>를 누르고 <b>허용</b></>];
  } else if (v === 'unsupported') {
    sub = `${WHAT} 이 브라우저에선 알림을 받을 수 없어요. 크롬이나 사파리로 열어 주세요.`;
  } else if (v === 'denied') {
    sub = <>{WHAT} 지금은 이 사이트 알림이 막혀 있어요. 브라우저 설정에서 이 사이트 알림을 허용해 주세요.</>;
  }

  const enable = async () => { if (await push.enable()) push.closeGuide(); };

  return (
    <div
      className="modal on"
      onClick={(e) => { if (e.target === e.currentTarget) push.closeGuide(); }}
    >
      <div className="mbox pg-box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="pg-h">
        <h3 id="pg-h">일정 알림 켜기</h3>
        <p className="msub pg-sub">{sub}</p>
        {steps.length > 0 && (
          <ol className="pg-steps">
            {steps.map((s, i) => (
              <li key={i}><span className="pg-n" aria-hidden="true">{i + 1}</span><div>{s}</div></li>
            ))}
          </ol>
        )}
        <div className="mbtns col">
          {v === 'enable' ? (
            <>
              <button type="button" className="btn-go pg-go" disabled={push.busy === 'enable'} onClick={() => void enable()}>
                {push.busy === 'enable' ? '켜는 중…' : '알림 켜기'}
              </button>
              <button type="button" className="pg-later" onClick={push.closeGuide}>나중에 할게요</button>
            </>
          ) : (
            <button type="button" className="btn-go pg-go" onClick={push.closeGuide}>알겠어요</button>
          )}
        </div>
        {note && <p className="pg-note">{note}</p>}
      </div>
    </div>
  );
}

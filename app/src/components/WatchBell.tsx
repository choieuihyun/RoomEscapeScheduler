import type { WatchControl } from '../useWatches';

/* F-16 감시 토글 — 라인 아이콘 하나(벨)로 켜짐/꺼짐만 가른다.
   서버 로드 회차(session.id 있음)에만 뜬다 — 수동 입력·이미지 인식엔 감시를
   걸 slotId 자체가 없다(작업명세서 §4.5).

   ThemeCard(회차 칩)와 ResultCard(타임라인 매진 블록) 양쪽이 같은 것을 쓴다.
   블록 쪽은 .blk-watch 로 절대배치되고 아이콘이 1px 작다는 차이뿐이라
   한 벌로 합쳤다 — 눌렀을 때의 안내 문구가 두 벌로 갈리지 않게 하려는 목적이
   더 크다.

   **비활성으로 막지 않는다.** 예전에는 로그인 전·한도 초과일 때 disabled 로
   두고 이유를 title 툴팁에만 적었는데, 폰에는 hover 가 없어서 이유를 볼 방법이
   자체가 없었다(opacity .35 라 아이콘도 거의 안 보인다). 그래서 누를 수는 있게
   두고, 이유는 alert 로 말한다 — 판정은 useWatches 의 toggle() 이 한다. */
export function WatchBell({ slotId, ctl, block }: { slotId: number; ctl: WatchControl; block?: boolean }) {
  const on = ctl.isWatching(slotId);
  const size = block ? 11 : 12;
  const title = !ctl.loggedIn
    ? '로그인하면 감시할 수 있어요'
    : on ? '감시 해제'
    : ctl.atLimit ? '최대 3개까지 감시할 수 있어요 — 목록에서 하나를 지워주세요'
    : '빈자리 알림 걸기';
  return (
    <button
      type="button"
      className={'watch-toggle' + (block ? ' blk-watch' : '') + (on ? ' on' : '')}
      disabled={ctl.busy(slotId)} title={title}
      onClick={e => { e.stopPropagation(); ctl.toggle(slotId); }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>
  );
}

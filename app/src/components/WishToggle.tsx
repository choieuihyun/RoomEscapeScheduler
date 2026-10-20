import { myWish, toggleWishFor, useClubStore } from '../clubStore';
import { wishKey, type WishRef } from '../wish';

/* "하고 싶어요" 글 단추(§4.12) — 테마 도우미·테마 찾기·해 본 테마 찾기·같이 가요의 테마 줄.
   서버가 이 기능을 모르거나 내 목록을 아직 못 받았으면 그리지 않는다. 눌러 둔 상태는 aria-pressed */
export function WishToggle({ theme, onDone }: { theme: WishRef; onDone?: () => void }) {
  const s = useClubStore();
  if (s.wishApi !== 'on' || s.wishes === null) return null;
  const on = !!myWish(s.wishes, theme);
  return (
    <button
      type="button" className={'wish-t' + (on ? ' on' : '')} aria-pressed={on} disabled={s.busy.has(wishKey(theme))}
      aria-label={`${theme.themeName} 하고 싶어요`}
      onClick={() => void toggleWishFor(theme).then((ok) => { if (ok) onDone?.(); })}
    >{on ? '하고 싶어요 ✓' : '＋하고 싶어요'}</button>
  );
}

import { useCallback, useState } from 'react';
import { markPlayedInGroups } from '../clubStore';
import { deletePlayed, sayClub } from '../server';
import { showToast } from '../toast';
import type { UseProfileReturn } from '../useProfile';
import { sameTheme, wishKey, type WishRef } from '../wish';

/* "해 봤어요"(2026-10-27 사용자 요청) — 일정 상세의 '참여자가 하고 싶은 테마'와 테마 도우미 줄이 같이 쓴다.
   누르면 내 해 본 테마(§4.9)에 넣고, 눌린 걸 다시 누르면 물어본 뒤 뺀다. 받아 둔 위시 묶음의 해 봄도 바로 고친다.
   화면이 따로 들고 있는 값(도우미 결과 등)은 onDone(새 상태)으로 고친다 */
export function usePlayedMark(profile: UseProfileReturn | null) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = useCallback(async (ref: WishRef, played: boolean, onDone?: (played: boolean) => void) => {
    if (!profile) return;
    if (played && !confirm(`'${ref.themeName}'을(를) 해 본 테마에서 뺄까요?`)) return;
    setBusy(wishKey(ref));
    try {
      if (!played) {
        await profile.add({ themeKey: ref.themeKey, themeName: ref.themeName, branchName: ref.branchName ?? null, source: 'MANUAL' });
        markPlayedInGroups(ref, true);
        onDone?.(true);
        showToast('해 본 테마에 넣었어요.');
      } else {
        const rows = profile.played ?? await profile.reloadPlayed() ?? [];
        const row = rows.find((p) => sameTheme(p, ref));
        if (!row) { showToast('해 본 기록을 찾지 못했어요. 내 정보에서 확인해 주세요.'); return; }
        const t = await (await import('../cloud')).idToken();
        if (!t) { showToast('로그인해 주세요.'); return; }
        await deletePlayed(row.id, t);
        await profile.reloadPlayed();
        markPlayedInGroups(ref, false);
        onDone?.(false);
        showToast('해 본 테마에서 뺐어요.');
      }
    } catch (e) {
      showToast(e instanceof Error && !('body' in e) ? e.message : sayClub(e));
    } finally {
      setBusy(null);
    }
  }, [profile]);
  return { busy, toggle };
}

/* 단추 모양 — '+ 하고 싶어요'(WishToggle)와 같은 크기의 알약. 눌리면 빨강(해 봄 점과 같은 색) */
export function PlayedMark({ theme, played, busy, onClick }: { theme: WishRef; played: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className={'pm-t' + (played ? ' on' : '')} aria-pressed={played} disabled={busy}
      aria-label={`${theme.themeName} ${played ? '해 본 테마에서 빼기' : '해 봤어요'}`} onClick={onClick}>
      {busy ? '…' : played ? '해 봤어요 ✓' : '해 봤어요'}
    </button>
  );
}

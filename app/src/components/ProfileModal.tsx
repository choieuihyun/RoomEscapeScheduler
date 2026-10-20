import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isMissingApi, updateProfile, type ProfileDto } from '../server';
import { showToast } from '../toast';
import type { UseAuthReturn } from '../useAuth';
import { withoutPending, type UseProfileReturn } from '../useProfile';
import { ProfileForm } from './ProfileForm';

export interface ProfileModalProps {
  /* 로그인 뒤 저절로 뜬 "채워 주세요"(닫으면 이번 접속 동안 안 묻는다) — 아니면 사람이 연 고치기 */
  fill: boolean;
  auth: UseAuthReturn;
  /* 해 본 테마 수(방 수 칸 옆 참고) — 내 정보 API 가 없으면 null */
  profile: UseProfileReturn | null;
  onClose: () => void;
  /* 서버가 PUT /api/me/profile 을 모른다(본문 없는 404) — 고치기를 숨긴다 */
  onMissing: () => void;
}

/* 프로필 채우기·고치기 창(§4.11) — 가입 신청 폼과 같은 폼. 저장하면 서버가 준 MeDto 로 바꾼다(별명이 바뀌면 메뉴 이름도). */
export function ProfileModal({ fill, auth, profile, onClose, onMissing }: ProfileModalProps) {
  const uid = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const m = auth.member;
  const played = profile?.played ? withoutPending(profile.played, profile.pendingIds).length : null;
  const title = fill ? '프로필을 채워 주세요' : m?.profile ? '프로필 고치기' : '프로필 채우기';

  const askClose = useCallback(() => {
    if (dirty.current && !confirm('적은 내용이 저장되지 않아요. 닫을까요?')) return;
    onClose();
  }, [onClose]);

  /* 열리면 제목으로, 닫히면 연 단추로 포커스 */
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>('h3')?.focus();
    return () => back?.focus?.();
  }, []);

  /* Esc 로 닫고(한글 조합 중이면 무시), Tab 은 창 안에서만 돈다(BulkModal 과 같게) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.isComposing || e.keyCode === 229) return;
        askClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const box = boxRef.current;
      if (!box) return;
      const fs = [...box.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')]
        .filter((el) => el.offsetParent !== null);
      const first = fs[0], last = fs[fs.length - 1], a = document.activeElement;
      if (!first) return;
      if (!box.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [askClose]);

  const save = async (nickname: string, p: ProfileDto) => {
    const t = await (await import('../cloud')).idToken();
    if (!t) throw new Error('로그인해 주세요.');
    try {
      auth.adoptMember(await updateProfile(nickname, p, t));
    } catch (e) {
      if (!isMissingApi(e)) throw e;
      showToast('서버가 아직 프로필 고치기를 몰라요. 잠시 뒤에 다시 해 주세요.');
      onMissing();
      return;
    }
    showToast('프로필을 저장했어요.');
    onClose();
  };

  return createPortal(
    <div className="modal on bk-modal pfm-modal">
      <div className="mbox bk-box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={uid + 'h'}>
        <div className="bk-head">
          <h3 id={uid + 'h'} tabIndex={-1}>{title}</h3>
          <button type="button" className="bk-x" aria-label="닫기" onClick={askClose}>×</button>
        </div>
        <ProfileForm
          seed={{ nickname: m?.nickname ?? null, profile: m?.profile }} nickLabel="별명" nickHint="오픈채팅방에서 쓰는 닉네임" submitLabel="저장" playedCount={played}
          lead={<p className="pfm-lead">{fill ? '동호회 멤버들에게 보여 줄 프로필을 채워 주세요. 닫아도 앱은 그대로 쓸 수 있고, 다음에 들어올 때 다시 여쭤요.'
            : '멤버 목록에서 승인된 멤버들에게 보여요.'}</p>}
          onSubmit={save} onCancel={askClose} cancelLabel={fill ? '나중에 할게요' : '닫기'} dirtyRef={dirty}
        />
      </div>
    </div>,
    document.body,
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { listMembers, memberAction, sayClub, setMemberRole, type MeDto, type MemberDto } from './server';
import { showToast } from './toast';

/* 멤버 관리(운영진) 화면의 데이터 — 서버 계약은 작업명세서 §4.6.
   목록은 화면에 들어올 때와 처리한 뒤에만 불러온다(실시간 갱신 없음). */

/** 메뉴 "멤버 관리"를 보는 사람 — 승인된 운영진만. 서버가 모든 API 에서 다시 본다. */
export const isClubAdmin = (m: MeDto | null): boolean => m?.role === 'ADMIN' && m.status === 'APPROVED';

/** 화면에 쓰는 이름 — 닉네임이 없으면 uid 앞 8자 */
export const memberName = (m: { uid: string; nickname?: string | null }): string =>
  m.nickname?.trim() || m.uid.slice(0, 8);

const nickKey = (m: MemberDto): string => (m.nickname ?? '').trim().toLowerCase();

/* 같은 사람이 계정을 여러 개 만들어 신청했을 때 운영진이 눈치채도록 — 승인 대기 줄 중
   닉네임(앞뒤 공백 제거, 대소문자 무시)이 다른 대기·멤버 줄과 같은 줄의 uid. 거절·내보낸
   줄과는 비교하지 않는다(이미 정리된 신청이다). */
export function sameNicknameUids(members: MemberDto[]): Set<string> {
  const live = members.filter(m => (m.status === 'PENDING' || m.status === 'APPROVED') && nickKey(m));
  const count = new Map<string, number>();
  for (const m of live) count.set(nickKey(m), (count.get(nickKey(m)) ?? 0) + 1);
  return new Set(live.filter(m => m.status === 'PENDING' && count.get(nickKey(m))! > 1).map(m => m.uid));
}

export function splitMembers(all: MemberDto[]) {
  return {
    pending: all.filter(m => m.status === 'PENDING'),
    members: all.filter(m => m.status === 'APPROVED'),
    past: all.filter(m => m.status === 'REJECTED' || m.status === 'REMOVED'),
  };
}

/* ISO-8601 UTC → 한국 시간 "10월 19일 14:02". 서버 시각은 UTC 로 오고, 사용자는 한국에 있다고
   본다(기기 시간대에 맡기지 않는다 — 해외 기기로 열어도 운영진끼리 같은 시각을 본다). */
export function formatKst(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

async function token(): Promise<string> {
  const t = await (await import('./cloud')).idToken();
  if (!t) throw new Error('로그인해 주세요.');
  return t;
}

export function useMembers(isAdmin: boolean, active: boolean, onNotAdmin: () => void) {
  const [list, setList] = useState<MemberDto[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const all = await listMembers('ALL', await token());
      if (my === seq.current) { setList(all); setErr(''); }
    } catch (e) {
      if (my !== seq.current) return;
      setErr(sayClub(e));
      if ((e as { body?: { error?: string } })?.body?.error === 'NOT_ADMIN') onNotAdmin();
    }
  }, [onNotAdmin]);

  /* 운영진이 되는 순간(메뉴 숫자 배지용)과 멤버 관리 화면을 드나들 때 새로 받는다 */
  useEffect(() => { if (isAdmin) void Promise.resolve().then(reload); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */ }, [isAdmin, active, reload]);

  /* 처리 하나 — 성공하면 토스트 후 새로 고침, 실패는 서버 문구 그대로. BAD_STATE 는 다른
     운영진이 먼저 처리해 목록이 낡았다는 뜻이라 문구대로 자동으로 새로 불러온다. */
  const run = useCallback(async (uid: string, fn: (t: string) => Promise<unknown>, done: string) => {
    setBusy(b => new Set(b).add(uid));
    setErr('');
    try {
      await fn(await token());
      showToast(done);
      await reload();
    } catch (e) {
      const code = (e as { body?: { error?: string } })?.body?.error;
      /* 낡은 목록은 먼저 새로 받는다 — 새로 받으면 오류 문구가 지워지므로 그 뒤에 띄운다 */
      if (code === 'BAD_STATE' || code === 'NO_SUCH_MEMBER') await reload();
      setErr(sayClub(e));
      if (code === 'NOT_ADMIN') onNotAdmin();
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(uid); return n; });
    }
  }, [reload, onNotAdmin]);

  const act = useCallback((m: MemberDto, action: 'approve' | 'reject' | 'remove') => {
    const name = memberName(m);
    const done = { approve: `${name} 님을 승인했어요.`, reject: `${name} 님을 거절했어요.`, remove: `${name} 님을 내보냈어요.` }[action];
    return run(m.uid, t => memberAction(m.uid, action, t), done);
  }, [run]);

  const setRole = useCallback((m: MemberDto, role: 'ADMIN' | 'MEMBER') =>
    run(m.uid, t => setMemberRole(m.uid, role, t),
      role === 'ADMIN' ? `${memberName(m)} 님을 운영진으로 지정했어요.` : `${memberName(m)} 님의 운영진을 해제했어요.`), [run]);

  return { list: isAdmin ? list : null, err, busy, reload, act, setRole };
}

export type UseMembersReturn = ReturnType<typeof useMembers>;

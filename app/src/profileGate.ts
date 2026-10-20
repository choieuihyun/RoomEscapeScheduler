import type { MeDto } from './server';

/* 멤버 프로필(§4.11)을 언제 묻고 보일지 — 진입 청크라 판정만 둔다(목록·검사·계산은 지연 청크 memberProfile.ts).
   MeDto.profile 이 없으면(undefined) 서버가 아직 프로필을 모른다 — 그때는 묻지도, 멤버 목록·랭킹도 열지 않는다.
   null 이면 서버는 알지만 이 사람이 아직 안 채운 것이다. */
type M = Pick<MeDto, 'status' | 'profile'> | null;

const joined = (m: M): m is Pick<MeDto, 'status' | 'profile'> => !!m && (m.status === 'PENDING' || m.status === 'APPROVED');

export const profileApiOn = (m: M): boolean => !!m && m.profile !== undefined;

/* 고칠 수 있다 — 서버가 PUT /api/me/profile 을 받는 상태(가입 신청한 사람·승인 멤버) */
export const canEditProfile = (m: M): boolean => joined(m) && m.profile !== undefined;

/* 로그인 뒤 "프로필을 채워 주세요" 창을 띄울 사람 */
export const needsProfile = (m: M): boolean => joined(m) && m.profile === null;

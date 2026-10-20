/* 좁은 화면 더보기(§4.60)의 그룹·행 목록 — 누가 무엇을 보는지만 정한다. 오른쪽 숫자·칩은 화면이 붙인다.
   - 내 기록: 승인 멤버이고 서버가 해 본 테마 API 를 알 때(profileOn)
   - 알림: 승인 멤버(clubOn)
   - 운영진: 운영진만
   - 설정: 늘(로그아웃·계정 기능 꺼짐 포함)
   - 계정: 로그인했을 때. 연결 행은 왼쪽 메뉴 계정 자리(AcctWidget)와 같은 규칙 — 연결 동작은 아이디 계정만,
     소셜 로그인 계정이면 붙은 것만 "연결됨"으로 보인다. 카카오 연결은 서버 일이라 member 가 null 이면 뺀다.
   - 로그아웃: 맨 아래 따로 떨어진 그룹(제목 없음) */
export type MoreRowId = 'played' | 'past' | 'push' | 'members' | 'dark' | 'tour' | 'kakao' | 'google' | 'join' | 'logout';
export type MoreGroupId = 'records' | 'alerts' | 'admin' | 'settings' | 'account' | 'out';
export interface MoreRow {
  id: MoreRowId;
  label: string;
  /* 연결 행: 'link' 면 누르면 연결, 'done' 이면 오른쪽에 "연결됨"만 */
  link?: 'link' | 'done';
}
export interface MoreGroup { id: MoreGroupId; title: string; rows: MoreRow[] }

export function moreGroups(o: {
  loggedIn: boolean; profileOn: boolean; clubOn: boolean; isAdmin: boolean;
  member: { status: string; kakaoLinked: boolean } | null; providerIds: string[];
}): MoreGroup[] {
  const groups: MoreGroup[] = [];
  if (o.loggedIn && o.profileOn) {
    groups.push({ id: 'records', title: '내 기록', rows: [
      { id: 'played', label: '해 본 테마' }, { id: 'past', label: '지난 동호회 일정' }] });
  }
  if (o.loggedIn && o.clubOn) groups.push({ id: 'alerts', title: '알림', rows: [{ id: 'push', label: '이 기기 알림' }] });
  if (o.loggedIn && o.isAdmin) groups.push({ id: 'admin', title: '운영진', rows: [{ id: 'members', label: '멤버 관리' }] });
  groups.push({ id: 'settings', title: '설정', rows: [{ id: 'dark', label: '다크 모드' }, { id: 'tour', label: '사용법 보기' }] });
  if (!o.loggedIn) return groups;

  const isPassword = o.providerIds.includes('password');
  const account: MoreRow[] = [];
  const linkRow = (id: 'kakao' | 'google', name: string, linked: boolean) => {
    if (linked) account.push({ id, label: name, link: 'done' });
    else if (isPassword) account.push({ id, label: `${name} 연결`, link: 'link' });
  };
  if (o.member !== null) linkRow('kakao', '카카오', o.member.kakaoLinked);
  linkRow('google', '구글', o.providerIds.includes('google.com'));
  if (o.member?.status === 'NONE' || o.member?.status === 'REJECTED') account.push({ id: 'join', label: '가입 신청' });
  if (account.length) groups.push({ id: 'account', title: '계정', rows: account });
  groups.push({ id: 'out', title: '', rows: [{ id: 'logout', label: '로그아웃' }] });
  return groups;
}

import { todayKst } from '../clubEvents';
import { ageKst, birthLabel, lifeLabel, mbtiLabel } from '../memberProfile';
import type { ProfileDto } from '../server';

/* 내 프로필 한 덩이(§4.11) — 좁은 화면 더보기의 프로필 카드와 넓은 화면 내 정보의 프로필 카드가 같이 쓴다.
   undefined(서버가 프로필을 모름)면 아무것도 안 그린다. null 이면 "프로필을 채워 주세요 ›" (고칠 수 있을 때만). */
export function ProfileFacts({ p, onEdit }: { p: ProfileDto | null | undefined; onEdit?: () => void }) {
  if (p === undefined) return null;
  if (p === null) {
    return onEdit ? (
      <button type="button" className="pfx-fill" onClick={onEdit}>
        <span>멤버들에게 보여 줄 프로필을 채워 주세요</span><i aria-hidden="true">›</i>
      </button>
    ) : null;
  }
  const today = todayKst();
  return (
    <div className="pfx">
      <dl className="pfx-dl">
        <div><dt>이름</dt><dd>{p.realName}</dd></div>
        <div><dt>나이</dt><dd>만 {ageKst(p.birthDate, today)}세 <span className="pfx-sub">· 생일 {birthLabel(p.birthDate)}</span></dd></div>
        <div><dt>MBTI</dt><dd>{mbtiLabel(p.mbti)}</dd></div>
        <div><dt>방 수</dt><dd>{p.roomCount.toLocaleString('ko-KR')}개</dd></div>
        <div className="wide"><dt>장르</dt><dd className="pfx-genres">{p.genres.map((g) => <span key={g} className="pfx-g">{g}</span>)}</dd></div>
        <div className="wide"><dt>인생 테마</dt><dd>{lifeLabel(p.lifeTheme)}</dd></div>
      </dl>
      {onEdit && <button type="button" className="btn pfx-edit" onClick={onEdit}>프로필 고치기</button>}
    </div>
  );
}

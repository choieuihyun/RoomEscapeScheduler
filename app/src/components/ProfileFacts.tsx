import { birthLabel, lifeLabel, mbtiLabel, yearLabel } from '../memberProfile';
import type { ProfileDto } from '../server';

/* 내 프로필 한 덩이(§4.11) — 좁은 화면 더보기의 프로필 카드와 넓은 화면 내 정보의 프로필 카드가 같이 쓴다.
   undefined(서버가 프로필을 모름)면 아무것도 안 그린다. null 이면 "프로필을 채워 주세요 ›" (고칠 수 있을 때만).
   residenceOn: 서버가 거주지역 칸을 아는지(MeDto.residenceOn) — 모르면(옛 서버) 채워 달라는 줄을 띄우지 않는다.
   알고 비어 있으면 "거주지역을 채워 주세요 ›"(고칠 수 있을 때만, 누르면 프로필 고치기 — 따로 창을 띄우지는 않는다) */
export function ProfileFacts({ p, onEdit, residenceOn }: { p: ProfileDto | null | undefined; onEdit?: () => void; residenceOn?: boolean }) {
  if (p === undefined) return null;
  if (p === null) {
    return onEdit ? (
      <button type="button" className="pfx-fill" onClick={onEdit}>
        <span>멤버들에게 보여 줄 프로필을 채워 주세요</span><i aria-hidden="true">›</i>
      </button>
    ) : null;
  }
  return (
    <div className="pfx">
      <dl className="pfx-dl">
        <div><dt>이름</dt><dd>{p.realName}</dd></div>
        <div><dt>나이</dt><dd>{yearLabel(p.birthDate)} <span className="pfx-sub">· 생일 {birthLabel(p.birthDate)}</span></dd></div>
        <div><dt>MBTI</dt><dd>{mbtiLabel(p.mbti)}</dd></div>
        <div><dt>방 수</dt><dd>{p.roomCount.toLocaleString('ko-KR')}개</dd></div>
        {p.residence && <div className="wide"><dt>거주지역</dt><dd>{p.residence}</dd></div>}
        <div className="wide"><dt>장르</dt><dd className="pfx-genres">{p.genres.map((g) => <span key={g} className="pfx-g">{g}</span>)}</dd></div>
        <div className="wide"><dt>인생 테마</dt><dd>{lifeLabel(p.lifeTheme)}</dd></div>
      </dl>
      {residenceOn && !p.residence && onEdit && (
        <button type="button" className="pfx-fill pfx-fill-res" onClick={onEdit}>
          <span>거주지역을 채워 주세요</span><i aria-hidden="true">›</i>
        </button>
      )}
      {onEdit && <button type="button" className="btn pfx-edit" onClick={onEdit}>프로필 고치기</button>}
    </div>
  );
}

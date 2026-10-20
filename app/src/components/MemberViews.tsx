import { useState } from 'react';
import type { View } from '../useView';
import { PeoplePage } from './PeoplePage';
import { ProfileModal, type ProfileModalProps } from './ProfileModal';
import { RankingPage } from './RankingPage';

/* 멤버 목록·랭킹 화면과 프로필 창(§4.11)을 한 청크로 — SchedulerPage(진입 청크)에는 지연 컴포넌트 하나만 둔다.
   화면은 처음 들어갈 때 그리고 이후엔 숨기기만 한다(찾기 글자·받아 둔 달이 남게 — SchedulerPage 의 다른 화면과 같다). */
/* 가입 창(AuthModal)·더보기·내 정보도 프로필 폼·덩이를 여기서 가져간다 — 따로 가져가면 청크가 둘 더 생기고
   진입 청크의 미리 받기 목록이 그만큼 길어진다(진입 크기 한도). 이렇게 하면 이 모듈들이 한 청크에 모인다 */
export { ProfileForm } from './ProfileForm';
export { ProfileFacts } from './ProfileFacts';

type Pages = {
  part: 'pages'; view: View | null; rankOn: boolean; meUid: string; today: string;
  onBack: () => void; onRankMissing: () => void;
};
type Modal = { part: 'modal' } & ProfileModalProps;

function useEver(on: boolean): boolean {
  const [ever, setEver] = useState(on);
  if (on && !ever) setEver(true);
  return ever || on;
}

export function MemberViews(p: Pages | Modal) {
  return p.part === 'modal' ? <ProfileModal {...p} /> : <ClubPages {...p} />;
}

function ClubPages({ view, rankOn, meUid, today, onBack, onRankMissing }: Pages) {
  const people = useEver(view === 'people');
  const rank = useEver(view === 'ranking');
  return (<>
    {people && (
      <div className={'view' + (view === 'people' ? '' : ' off')}>
        <PeoplePage active={view === 'people'} meUid={meUid} onBack={onBack} />
      </div>
    )}
    {rankOn && rank && (
      <div className={'view' + (view === 'ranking' ? '' : ' off')}>
        <RankingPage active={view === 'ranking'} today={today} meUid={meUid} onBack={onBack} onMissing={onRankMissing} />
      </div>
    )}
  </>);
}

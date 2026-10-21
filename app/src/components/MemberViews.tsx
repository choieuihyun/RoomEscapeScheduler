import { useState } from 'react';
import type { View } from '../useView';
import { MemberCard, type MemberCardProps } from './MemberCard';
import { PeoplePage } from './PeoplePage';
import { ProfileModal, type ProfileModalProps } from './ProfileModal';
import { RankingPage } from './RankingPage';
import { TogetherPage } from './TogetherPage';
import type { EventDto, PlayedDto } from '../server';
import type { FormState } from '../eventForm';

/* 멤버 목록·랭킹·같이 가요 화면과 프로필 창(§4.11·§4.12), 멤버 카드(어디서든 이름을 누르면)를 한 청크로 — SchedulerPage(진입 청크)에는 지연 컴포넌트 하나만 둔다.
   화면은 처음 들어갈 때 그리고 이후엔 숨기기만 한다(찾기 글자·받아 둔 달이 남게 — SchedulerPage 의 다른 화면과 같다). */
/* 가입 창(AuthModal)·더보기·내 정보도 프로필 폼·덩이를 여기서 가져간다 — 따로 가져가면 청크가 둘 더 생기고
   진입 청크의 미리 받기 목록이 그만큼 길어진다(진입 크기 한도). 이렇게 하면 이 모듈들이 한 청크에 모인다 */
export { ProfileForm } from './ProfileForm';
export { ProfileFacts } from './ProfileFacts';

type Pages = {
  part: 'pages'; view: View | null; rankOn: boolean; meUid: string; today: string;
  onBack: () => void; onRankMissing: () => void;
  /* 같이 가요(§4.12) — 서버가 위시 API 를 알 때 */
  togetherOn: boolean; events: EventDto[]; played: PlayedDto[] | null;
  onMakeEvent: (form: FormState) => void; onOpenEvent: (ev: EventDto) => void;
};
type Modal = { part: 'modal' } & ProfileModalProps;
type Card = { part: 'card' } & MemberCardProps;

function useEver(on: boolean): boolean {
  const [ever, setEver] = useState(on);
  if (on && !ever) setEver(true);
  return ever || on;
}

export function MemberViews(p: Pages | Modal | Card) {
  return p.part === 'modal' ? <ProfileModal {...p} /> : p.part === 'card' ? <MemberCard key={p.uid} {...p} /> : <ClubPages {...p} />;
}

function ClubPages({ view, rankOn, meUid, today, onBack, onRankMissing, togetherOn, events, played, onMakeEvent, onOpenEvent }: Pages) {
  const people = useEver(view === 'people');
  const rank = useEver(view === 'ranking');
  const together = useEver(view === 'together');
  return (<>
    {togetherOn && together && (
      <div className={'view' + (view === 'together' ? '' : ' off')}>
        <TogetherPage active={view === 'together'} meUid={meUid} today={today} events={events} played={played}
          onBack={onBack} onMakeEvent={onMakeEvent} onOpenEvent={onOpenEvent} />
      </div>
    )}
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

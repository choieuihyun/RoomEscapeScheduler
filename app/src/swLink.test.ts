import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bannerOf, clickTarget, pickClient, pickLink, swOpenId } from './swLink';

const ROOT = 'https://choieuihyun.github.io/RoomEscapeScheduler/';

/* [알림 data, 기대 링크] — 서비스 워커 사본도 같은 표로 돌린다 */
const CASES: [string, unknown, string][] = [
  ['우리 알림의 data.link', { link: ROOT + '#e=12' }, ROOT + '#e=12'],
  ['SDK 알림 — FCM data.link 가 먼저', { FCM_MSG: { data: { link: ROOT + '#e=3' }, fcmOptions: { link: ROOT + '#e=9' } } }, ROOT + '#e=3'],
  ['SDK 알림 — data 없으면 fcmOptions.link(5단계 전 서버)', { FCM_MSG: { fcmOptions: { link: ROOT + '#e=9' } } }, ROOT + '#e=9'],
  ['SDK 알림 — click_action', { FCM_MSG: { notification: { title: 't', click_action: ROOT + '#e=4' } } }, ROOT + '#e=4'],
  ['빈자리 알림(링크 = 앱 주소)', { FCM_MSG: { fcmOptions: { link: ROOT } } }, ROOT],
  ['링크 없음 → 앱 주소', { FCM_MSG: { notification: { title: 't' } } }, ROOT],
  ['data 없음', undefined, ROOT],
  ['data null', null, ROOT],
  ['FCM_MSG 가 문자열', { FCM_MSG: 'x' }, ROOT],
  ['앱 밖 주소는 버리고 다음 후보', { link: 'https://evil.example/#e=1', FCM_MSG: { fcmOptions: { link: ROOT + '#e=2' } } }, ROOT + '#e=2'],
  ['비슷한 경로도 앱 밖', { link: 'https://choieuihyun.github.io/RoomEscapeSchedulerX/#e=1' }, ROOT],
  ['상대 주소는 앱 주소 기준', { link: '#e=7' }, ROOT + '#e=7'],
  ['빈 문자열·숫자는 건너뜀', { link: '', FCM_MSG: { data: { link: 5 }, fcmOptions: { link: ROOT + '#e=8' } } }, ROOT + '#e=8'],
];

/* public/firebase-messaging-sw.js 의 pickLink·clickTarget 을 꺼내 함수로 만든다 */
function swCopy(): { pickLink: typeof pickLink; clickTarget: typeof clickTarget; pickClient: typeof pickClient } {
  const src = readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8');
  const m = /\/\/ pickLink 시작.*\n([\s\S]*?)\/\/ pickLink 끝/.exec(src);
  if (!m) throw new Error('서비스 워커에서 pickLink 를 못 찾았어요');
  return new Function(`${m[1]}\nreturn { pickLink, clickTarget, pickClient };`)();
}

/* [지금 창 주소, 고른 링크, 기대] */
const TARGETS: [string, string, string, string | null][] = [
  ['빈자리(앱 주소) → 앞으로만', ROOT + '?view=calc', ROOT, null],
  ['일정 링크 아님(#s=) → 앞으로만', ROOT, ROOT + '#s=abc', null],
  ['계산 화면 → 쿼리는 두고 해시만', ROOT + '?view=calc', ROOT + '#e=12', ROOT + '?view=calc#e=12'],
  ['다른 일정 링크 → 해시만 바꿈', ROOT + '?view=calendar#e=3', ROOT + '#e=12', ROOT + '?view=calendar#e=12'],
  ['이미 같은 해시 → 메시지', ROOT + '#e=12', ROOT + '#e=12', 'message'],
  ['#e=0 은 일정 링크가 아니다 → 앞으로만', ROOT, ROOT + '#e=0', null],
  ['#e=000 도 마찬가지', ROOT, ROOT + '#e=000', null],
  ['#e=007 은 7 로 읽는 숫자 → 해시만 바꿈', ROOT, ROOT + '#e=007', ROOT + '#e=007'],
];

describe('pickLink', () => {
  for (const [name, data, want] of CASES) {
    it(name, () => expect(pickLink(data, ROOT)).toBe(want));
  }

  it('서비스 워커 사본도 같은 결과', () => {
    const sw = swCopy();
    for (const [name, data, want] of CASES) expect(sw.pickLink(data, ROOT), name).toBe(want);
  });
});

describe('clickTarget', () => {
  for (const [name, cur, link, want] of TARGETS) {
    it(name, () => expect(clickTarget(cur, link)).toBe(want));
  }

  it('서비스 워커 사본도 같은 결과', () => {
    const sw = swCopy();
    for (const [name, cur, link, want] of TARGETS) expect(sw.clickTarget(cur, link), name).toBe(want);
  });
});

/* 창이 여럿일 때 */
const W = (url: string, o: { visibilityState?: string; focused?: boolean } = {}) => ({ url, ...o });
describe('pickClient', () => {
  const a = W(ROOT + '?a', { visibilityState: 'hidden', focused: false });
  const b = W(ROOT + '?b', { visibilityState: 'hidden', focused: true });
  const c = W(ROOT + '?c', { visibilityState: 'visible', focused: false });
  const other = W('https://evil.example/', { visibilityState: 'visible', focused: true });
  const cases: [string, ReturnType<typeof W>[], ReturnType<typeof W> | undefined][] = [
    ['보이는 창이 우선', [a, b, c], c],
    ['보이는 창이 없으면 포커스된 창', [a, b], b],
    ['둘 다 없으면 첫 창', [a], a],
    ['앱 밖 창은 뽑지 않는다', [other, a], a],
    ['앱 창이 없으면 undefined', [other], undefined],
    ['빈 목록', [], undefined],
  ];
  for (const [name, list, want] of cases) it(name, () => expect(pickClient(list, ROOT)).toBe(want));

  it('서비스 워커 사본도 같은 결과', () => {
    const sw = swCopy();
    for (const [name, list, want] of cases) expect(sw.pickClient(list, ROOT), name).toBe(want);
  });
});

describe('swOpenId', () => {
  it('{ type: open, link } 의 #e= 만 읽는다', () => {
    expect(swOpenId({ type: 'open', link: ROOT + '#e=12' })).toBe(12);
    expect(swOpenId({ type: 'open', link: ROOT })).toBeNull();
    expect(swOpenId({ type: 'open', link: ROOT + '#s=abc' })).toBeNull();
    expect(swOpenId({ type: 'open' })).toBeNull();
    /* Firebase SDK 가 창에 보내는 메시지 */
    expect(swOpenId({ isFirebaseMessaging: true, messageType: 'notification-clicked', fcmOptions: { link: ROOT + '#e=1' } })).toBeNull();
    expect(swOpenId(null)).toBeNull();
    expect(swOpenId('open')).toBeNull();
  });
});

describe('bannerOf (앱 안 알림 띠)', () => {
  const ROOT = 'https://choieuihyun.github.io/RoomEscapeScheduler/';
  it('notification 의 제목·본문, data.link 의 #e= 로 일정 id', () => {
    expect(bannerOf({
      notification: { title: '내일 일정이 있어요', body: '정모 · 13:40 비밀의 화원' },
      data: { link: `${ROOT}#e=42` },
    })).toEqual({ title: '내일 일정이 있어요', body: '정모 · 13:40 비밀의 화원', eventId: 42 });
  });
  it('data.link 에 일정이 없으면 fcmOptions.link 를 본다, 둘 다 없거나 일정 링크가 아니면 null', () => {
    expect(bannerOf({ notification: { title: 'a' }, data: { link: ROOT }, fcmOptions: { link: `${ROOT}?view=calc#e=7` } })?.eventId).toBe(7);
    expect(bannerOf({ notification: { title: '테스트 알림', body: '잘 와요' } })?.eventId).toBeNull();
    expect(bannerOf({ notification: { title: 'a' }, data: { link: `${ROOT}#s=abc` } })?.eventId).toBeNull();
    expect(bannerOf({ notification: { title: 'a' }, data: { link: `${ROOT}#e=0` } })?.eventId).toBeNull();
  });
  it('data 만 온 메시지는 서비스 워커와 같은 기본 문구', () => {
    expect(bannerOf({ data: {} })).toEqual({ title: '빈자리 알림', body: '감시 중인 회차에 빈자리가 생겼어요.', eventId: null });
    expect(bannerOf({ data: { title: 'x', body: 'y', link: '#e=3' } })).toEqual({ title: 'x', body: 'y', eventId: 3 });
  });
  it('보일 글이 없으면 null, 제목만 비면 "알림"', () => {
    expect(bannerOf(null)).toBeNull();
    expect(bannerOf('x')).toBeNull();
    expect(bannerOf({ notification: {} })).toBeNull();
    expect(bannerOf({ notification: { body: '본문만' } })).toEqual({ title: '알림', body: '본문만', eventId: null });
  });
});

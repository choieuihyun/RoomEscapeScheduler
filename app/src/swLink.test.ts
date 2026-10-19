import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clickTarget, pickLink, swOpenId } from './swLink';

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
function swCopy(): { pickLink: typeof pickLink; clickTarget: typeof clickTarget } {
  const src = readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8');
  const m = /\/\/ pickLink 시작.*\n([\s\S]*?)\/\/ pickLink 끝/.exec(src);
  if (!m) throw new Error('서비스 워커에서 pickLink 를 못 찾았어요');
  return new Function(`${m[1]}\nreturn { pickLink, clickTarget };`)();
}

/* [지금 창 주소, 고른 링크, 기대] */
const TARGETS: [string, string, string, string | null][] = [
  ['빈자리(앱 주소) → 앞으로만', ROOT + '?view=calc', ROOT, null],
  ['일정 링크 아님(#s=) → 앞으로만', ROOT, ROOT + '#s=abc', null],
  ['계산 화면 → 쿼리는 두고 해시만', ROOT + '?view=calc', ROOT + '#e=12', ROOT + '?view=calc#e=12'],
  ['다른 일정 링크 → 해시만 바꿈', ROOT + '?view=calendar#e=3', ROOT + '#e=12', ROOT + '?view=calendar#e=12'],
  ['이미 같은 해시 → 메시지', ROOT + '#e=12', ROOT + '#e=12', 'message'],
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

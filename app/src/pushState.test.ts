import { describe, expect, it } from 'vitest';
import { guideVariant, permissionLabel, pushCard, pushSupport, shouldAutoGuide, type PushEnv } from './pushState';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_KAKAO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5';
const ANDROID_KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 KAKAOTALK/10.8.5 (INAPP)';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const env = (o: Partial<PushEnv>): PushEnv => ({ ua: ANDROID_CHROME, standalone: false, hasNotification: true, hasSW: true, ...o });

describe('pushSupport', () => {
  it('아이폰 사파리에서 홈 화면 앱이 아니면 ios-install — Notification 이 없어도 unsupported 가 아니다', () => {
    expect(pushSupport(env({ ua: IPHONE_SAFARI, hasNotification: false }))).toBe('ios-install');
    expect(pushSupport(env({ ua: IPHONE_SAFARI }))).toBe('ios-install');
  });

  it('아이폰 홈 화면 앱이면 ok', () => {
    expect(pushSupport(env({ ua: IPHONE_SAFARI, standalone: true }))).toBe('ok');
  });

  it('홈 화면 앱이어도 Notification 이 없으면(iOS 16.4 전) unsupported', () => {
    expect(pushSupport(env({ ua: IPHONE_SAFARI, standalone: true, hasNotification: false }))).toBe('unsupported');
  });

  it('카카오톡 안 브라우저면 kakao-inapp — 아이폰이어도 먼저', () => {
    expect(pushSupport(env({ ua: ANDROID_KAKAO }))).toBe('kakao-inapp');
    expect(pushSupport(env({ ua: IPHONE_KAKAO, hasNotification: false }))).toBe('kakao-inapp');
  });

  it('Notification 이나 서비스 워커가 없으면 unsupported', () => {
    expect(pushSupport(env({ hasNotification: false }))).toBe('unsupported');
    expect(pushSupport(env({ hasSW: false }))).toBe('unsupported');
  });

  it('안드로이드 크롬·맥 사파리는 ok, 맥 UA 의 아이패드(터치)는 ios-install', () => {
    expect(pushSupport(env({}))).toBe('ok');
    expect(pushSupport(env({ ua: MAC_SAFARI }))).toBe('ok');
    expect(pushSupport(env({ ua: MAC_SAFARI, touchPoints: 5 }))).toBe('ios-install');
  });
});

describe('permissionLabel', () => {
  it('거부 → 거부됨, 허용만 → 꺼짐, 허용 + 등록 → 켜짐', () => {
    expect(permissionLabel('denied', false)).toBe('거부됨');
    expect(permissionLabel('denied', true)).toBe('거부됨');
    expect(permissionLabel('granted', false)).toBe('꺼짐');
    expect(permissionLabel('granted', true)).toBe('켜짐');
    expect(permissionLabel('default', false)).toBe('꺼짐');
  });
});

describe('pushCard', () => {
  it('받을 수 없는 브라우저면 그 까닭, 아니면 권한·등록 글자, 허용인데 등록을 모르면 확인 중(null)', () => {
    expect(pushCard('ios-install', null, null)).toBe('ios-install');
    expect(pushCard('kakao-inapp', 'granted', true)).toBe('kakao-inapp');
    expect(pushCard('unsupported', null, null)).toBe('unsupported');
    expect(pushCard('ok', 'granted', null)).toBeNull();
    expect(pushCard('ok', 'granted', true)).toBe('켜짐');
    expect(pushCard('ok', 'granted', false)).toBe('꺼짐');
    expect(pushCard('ok', 'default', null)).toBe('꺼짐');
    expect(pushCard('ok', 'denied', null)).toBe('거부됨');
  });
});

describe('guideVariant · shouldAutoGuide', () => {
  it('카카오톡 안 → 아이폰 설치 → 불가 → 거부 → 켜기 차례', () => {
    expect(guideVariant('kakao-inapp', null)).toBe('kakao');
    expect(guideVariant('ios-install', null)).toBe('ios');
    expect(guideVariant('unsupported', null)).toBe('unsupported');
    expect(guideVariant('ok', 'denied')).toBe('denied');
    expect(guideVariant('ok', 'default')).toBe('enable');
    expect(guideVariant('ok', 'granted')).toBe('enable');
  });
  it('이 기기에서 한 번, 허용돼 있으면(켜짐으로 본다) 띄우지 않는다', () => {
    expect(shouldAutoGuide(false, 'ok', 'default')).toBe(true);
    expect(shouldAutoGuide(false, 'ok', 'denied')).toBe(true);
    expect(shouldAutoGuide(false, 'ios-install', null)).toBe(true);
    expect(shouldAutoGuide(false, 'kakao-inapp', 'granted')).toBe(true);
    expect(shouldAutoGuide(false, 'ok', 'granted')).toBe(false);
    expect(shouldAutoGuide(true, 'ok', 'default')).toBe(false);
  });
});

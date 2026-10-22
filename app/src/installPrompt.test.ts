import { describe, expect, it, vi } from 'vitest';
import { canInstall, createInstallStore, installState, type InstallHost } from './installPrompt';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const KAKAO_AND = ANDROID + ' KAKAOTALK 10.8.0';
const KAKAO_IOS = IPHONE + ' KAKAOTALK 10.8.0';

describe('installState', () => {
  it('설치 창 이벤트를 붙잡아 두었으면 native', () => {
    expect(installState({ ua: ANDROID, standalone: false, hasPrompt: true })).toBe('native');
  });
  it('이벤트가 없으면(파이어폭스·맥 사파리 등) none — 단추를 숨긴다', () => {
    expect(installState({ ua: ANDROID, standalone: false, hasPrompt: false })).toBe('none');
    expect(installState({ ua: MAC, standalone: false, hasPrompt: false })).toBe('none');
  });
  it('아이폰·맥 UA 의 아이패드(터치)는 ios', () => {
    expect(installState({ ua: IPHONE, standalone: false, hasPrompt: false })).toBe('ios');
    expect(installState({ ua: MAC, standalone: false, touchPoints: 5, hasPrompt: false })).toBe('ios');
  });
  it('카카오톡 안이면 inapp — 아이폰이어도 먼저', () => {
    expect(installState({ ua: KAKAO_AND, standalone: false, hasPrompt: false })).toBe('inapp');
    expect(installState({ ua: KAKAO_IOS, standalone: false, hasPrompt: false })).toBe('inapp');
  });
  it('홈 화면 앱으로 열었으면 무엇이든 installed', () => {
    expect(installState({ ua: IPHONE, standalone: true, hasPrompt: false })).toBe('installed');
    expect(installState({ ua: ANDROID, standalone: true, hasPrompt: true })).toBe('installed');
  });
  it('canInstall — native·ios·inapp 만 단추', () => {
    expect((['native', 'ios', 'inapp', 'installed', 'none'] as const).map(canInstall)).toEqual([true, true, true, false, false]);
  });
});

/* 가짜 브라우저 — 이벤트를 손으로 보낸다 */
function fakeHost(ua = ANDROID, standalone = false) {
  const fns: Record<string, ((e: Event) => void)[]> = {};
  const host: InstallHost = {
    env: () => ({ ua, standalone, touchPoints: 0 }),
    on: (type, fn) => { (fns[type] ??= []).push(fn); },
  };
  const fire = (type: string, e: Event) => fns[type]?.forEach((f) => f(e));
  return { host, fire };
}
function fakePrompt(outcome: 'accepted' | 'dismissed') {
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
  return e;
}

describe('createInstallStore', () => {
  it('beforeinstallprompt 를 막고(preventDefault) 붙잡아 두면 native, 알린다', () => {
    const { host, fire } = fakeHost();
    const st = createInstallStore(host);
    const sub = vi.fn();
    st.subscribe(sub);
    expect(st.state()).toBe('none');
    const e = fakePrompt('accepted');
    fire('beforeinstallprompt', e);
    expect(e.defaultPrevented).toBe(true);
    expect(st.state()).toBe('native');
    expect(sub).toHaveBeenCalled();
  });

  it('누르면 prompt() 를 부르고 결과를 돌려준다. 한 번 쓴 이벤트는 비운다(취소해도)', async () => {
    const { host, fire } = fakeHost();
    const st = createInstallStore(host);
    const e = fakePrompt('dismissed');
    fire('beforeinstallprompt', e);
    await expect(st.start()).resolves.toBe('dismissed');
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(st.state()).toBe('none');
    await expect(st.start()).resolves.toBeNull();
    expect(e.prompt).toHaveBeenCalledTimes(1);
    /* 다시 오면 다시 붙잡는다 */
    const e2 = fakePrompt('accepted');
    fire('beforeinstallprompt', e2);
    await expect(st.start()).resolves.toBe('accepted');
  });

  it('appinstalled 뒤엔 installed — 붙잡은 이벤트도 비운다', () => {
    const { host, fire } = fakeHost();
    const st = createInstallStore(host);
    fire('beforeinstallprompt', fakePrompt('accepted'));
    fire('appinstalled', new Event('appinstalled'));
    expect(st.state()).toBe('installed');
  });

  it('아이폰·카카오톡은 누르면 안내 창(guide) — 닫으면 null', async () => {
    for (const [ua, want] of [[IPHONE, 'ios'], [KAKAO_AND, 'inapp']] as const) {
      const { host } = fakeHost(ua);
      const st = createInstallStore(host);
      expect(st.guide()).toBeNull();
      await expect(st.start()).resolves.toBeNull();
      expect(st.guide()).toBe(want);
      st.closeGuide();
      expect(st.guide()).toBeNull();
    }
  });

  it('설치한 앱·none 이면 눌러도 아무 일 없다', async () => {
    for (const [ua, standalone] of [[IPHONE, true], [MAC, false]] as const) {
      const { host } = fakeHost(ua, standalone);
      const st = createInstallStore(host);
      await expect(st.start()).resolves.toBeNull();
      expect(st.guide()).toBeNull();
    }
  });
});

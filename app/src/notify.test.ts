import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPushPermission } from './notify';

/* 브라우저가 알림을 지원하고(데스크톱 크롬) 사용자가 권한 창에서 거절하는 상황 */
function stubDeniedPrompt() {
  vi.stubGlobal('window', { Notification: {}, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130', serviceWorker: {}, maxTouchPoints: 0 });
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'denied' });
}

afterEach(() => vi.unstubAllGlobals());

describe('requestPushPermission — 거절 문구는 부르는 쪽에 맞는다', () => {
  it('기본(빈자리 벨)은 빈자리', async () => {
    stubDeniedPrompt();
    expect(await requestPushPermission('t')).toEqual({ ok: false, reason: '알림을 허용해야 빈자리를 알려드릴 수 있어요.' });
  });
  it('일정 알림 안내·내 정보 "알림 켜기"는 일정 소식', async () => {
    stubDeniedPrompt();
    expect(await requestPushPermission('t', 'event')).toEqual({ ok: false, reason: '알림을 허용해야 일정 소식을 알려드릴 수 있어요.' });
  });
});

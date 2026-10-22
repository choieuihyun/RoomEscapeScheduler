/* 앱 설치(PWA) 단추 (2026-10-22 사용자 요청) — 이 기기에서 설치를 어떻게 도울지 정하고, 브라우저의 설치 창 이벤트를 붙잡아 둔다.
   - 크롬·엣지·삼성 인터넷(안드로이드·PC)은 beforeinstallprompt 를 보낸다 — 막아 두었다가(작은 설치 띠가 저절로 뜨지 않게)
     단추를 누르면 그 이벤트로 설치 창을 띄운다. 한 번 쓰면 다시 못 쓴다.
   - 아이폰·아이패드는 이벤트가 없다 — 공유 → 홈 화면에 추가 안내. 카카오톡 안은 다른 브라우저로 열기 안내.
   - 이미 설치한 앱으로 열었으면(홈 화면 앱) 단추·띠를 숨긴다. 그 밖(파이어폭스·맥 사파리 등)도 숨긴다.
   이벤트는 화면 코드(지연 청크)가 오기 전에 올 수 있어서 이 모듈을 읽을 때 바로 듣는다 — 진입 청크에 둔다. */
import { useSyncExternalStore } from 'react';
import { pushEnv } from './notify';
import { isIOS } from './pushState';
import { isKakaoInApp } from './kakao';

export type InstallState = 'native' | 'ios' | 'inapp' | 'installed' | 'none';

export interface InstallEnv {
  ua: string;
  /* 홈 화면 앱으로 열렸는지(navigator.standalone 또는 display-mode: standalone) */
  standalone: boolean;
  touchPoints?: number;
  /* 붙잡아 둔 설치 창 이벤트가 있는지 */
  hasPrompt: boolean;
}

/* 차례: 설치한 앱 → 카카오톡 안(아이폰이어도 먼저 다른 브라우저로) → 브라우저 설치 창 → 아이폰 안내 → 숨김. pushSupport 와 같은 차례 */
export function installState(e: InstallEnv): InstallState {
  if (e.standalone) return 'installed';
  if (isKakaoInApp(e.ua)) return 'inapp';
  if (e.hasPrompt) return 'native';
  if (isIOS(e.ua, e.touchPoints)) return 'ios';
  return 'none';
}

/* 단추·띠를 보일지 */
export const canInstall = (s: InstallState): s is 'native' | 'ios' | 'inapp' => s === 'native' || s === 'ios' || s === 'inapp';

/* lib.dom 에 없는 크롬 이벤트 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type Outcome = 'accepted' | 'dismissed' | null;
export type Guide = 'ios' | 'inapp';

export interface InstallHost {
  env: () => Omit<InstallEnv, 'hasPrompt'>;
  on: (type: 'beforeinstallprompt' | 'appinstalled', fn: (e: Event) => void) => void;
  /* 홈 화면 앱으로 옮겨 갔을 때(PC 크롬의 "앱에서 열기") 다시 본다 */
  onModeChange?: (fn: () => void) => void;
}

/* 붙잡아 둔 이벤트 · 이번 페이지에서 설치했는지 · 열린 안내 창. 테스트는 가짜 host 로 만든다 */
export function createInstallStore(host: InstallHost) {
  let saved: InstallPromptEvent | null = null;
  let installed = false;
  let guide: Guide | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());

  host.on('beforeinstallprompt', (e) => { e.preventDefault(); saved = e as InstallPromptEvent; emit(); });
  /* 설치가 끝나면 이 탭은 브라우저 탭으로 남는다(PC 는 앱 창이 따로 열린다) — 단추를 숨긴다 */
  host.on('appinstalled', () => { saved = null; installed = true; guide = null; emit(); });
  host.onModeChange?.(emit);

  const state = (): InstallState => (installed ? 'installed' : installState({ ...host.env(), hasPrompt: saved !== null }));

  return {
    state,
    guide: () => guide,
    subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    /* 단추를 눌렀을 때 — 브라우저 설치 창이면 그 결과(accepted·dismissed), 안내 창을 열었으면 null */
    async start(): Promise<Outcome> {
      const s = state();
      if (s === 'ios' || s === 'inapp') { guide = s; emit(); return null; }
      const e = saved;
      if (s !== 'native' || !e) return null;
      saved = null; // 한 번만 쓸 수 있다 — 결과와 상관없이 비운다(다시 오면 다시 붙잡는다)
      emit();
      try {
        await e.prompt();
        return (await e.userChoice).outcome;
      } catch {
        return null;
      }
    },
    closeGuide() { if (guide !== null) { guide = null; emit(); } },
  };
}

const store = typeof window === 'undefined' ? null : createInstallStore({
  env: pushEnv,
  on: (type, fn) => addEventListener(type, fn),
  onModeChange: (fn) => matchMedia('(display-mode: standalone)').addEventListener?.('change', fn),
});

const noop = () => () => {};
export function useInstall() {
  const state = useSyncExternalStore(store ? store.subscribe : noop, () => store?.state() ?? 'none');
  const guide = useSyncExternalStore(store ? store.subscribe : noop, () => store?.guide() ?? null);
  return { state, guide };
}

/* 앱 설치 단추·더보기 행·홈 띠가 부른다(SchedulerPage 를 거쳐 — 설치하면 토스트) */
export const startInstall = (): Promise<Outcome> => store?.start() ?? Promise.resolve(null);
/* 안내 창 닫기 — 늘 같은 함수(창의 effect 가 다시 돌지 않게) */
export const closeInstallGuide = (): void => store?.closeGuide();

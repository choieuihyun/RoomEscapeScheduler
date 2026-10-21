import { useLayoutEffect, useRef } from 'react';

/* 뒤로 가기로 창 닫기 — 휴대폰·브라우저의 뒤로 가기가 열린 창·시트·상세를 닫는다(사용자 요청 2026-10-21).
   - 창이 열리면 같은 주소로 기록을 하나 쌓는다. state 는 원래 것에 ov(그 기록에서 열려 있는 창 수)만 더한다 —
     더보기 하위 화면(moreSub)이 지워지지 않게, 주소는 location.href 그대로(#e= 를 잃지 않게).
   - 뒤로 가기로 ov 가 줄면 그 수만큼 맨 위 창부터 닫는다(겹친 창은 맨 위만). 창이 닫지 않겠다고 하면(false — 저장 중,
     "닫을까요?"에서 취소) 기록을 다시 쌓아 창을 둔다.
   - 창을 화면 단추(×·취소·저장 뒤)로 닫으면 우리가 쌓은 기록을 history.go(-n) 로 지운다 — 남기면 다음 뒤로 가기가 한 번 헛돈다.
     그 popstate 는 우리 것이라 다른 듣는 곳(useView·더보기)에 넘기지 않는다(맨 먼저 듣고 멈춘다). onBack 도 부르지 않는다.
   - 앱의 다른 기록 쓰기(화면 이동 ?view=, 더보기 하위 화면)는 hist 로 한다 — 우리 go(-n) 이 아직 안 끝났으면 끝난 뒤에 한다
     (먼저 쌓으면 go(-n) 이 그 기록을 지운다).
   창을 열고 닫는 일은 커밋 안(layout effect)에서 표시만 하고, 기록은 마이크로태스크 한 번에 몰아 맞춘다 —
   StrictMode 의 열기·닫기·열기나 Esc 로 여러 창을 한꺼번에 닫는 것이 기록 하나·go 한 번이 된다. */

type Back = () => boolean | void;
type Entry = { back: Back };
interface PopLike { state: unknown; stopImmediatePropagation(): void }
export interface BackEnv {
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
  href: () => string;
  onPop: (fn: (e: PopLike) => void) => void;
  onHash?: (fn: () => void) => void;
}

const depthOf = (s: unknown): number => {
  const ov = s && typeof s === 'object' ? (s as { ov?: unknown }).ov : undefined;
  return typeof ov === 'number' ? ov : 0;
};
const withOv = (s: unknown, ov: number): object => ({ ...(s && typeof s === 'object' ? s : {}), ov });

export function createBackStack(env: BackEnv) {
  const h = env.history;
  const stack: Entry[] = [];
  const queue: (() => void)[] = [];
  let depth = depthOf(h.state);
  /* 새로 고침 전의 창 기록 — 창은 다 닫혀 있으니 표시만 지운다(그 기록은 같은 주소라 뒤로 가기 한 번이 헛돈다) */
  if (depth > 0) { h.replaceState(withOv(h.state, 0), '', env.href()); depth = 0; }
  let wait: 'own' | 'ext' | null = null;  // 기다리는 popstate — 우리 go(-n), 다른 곳의 뒤로 가기(더보기)
  let due = false;
  let hashNav = false;  // 앱이 직접 하는 해시 이동(알림의 "열기") — 그 popstate 로 창을 닫지 않는다
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => { if (!due) { due = true; queueMicrotask(sync); } };
  function traverse(n: number, who: 'own' | 'ext') {
    wait = who;
    clearTimeout(timer);
    /* popstate 가 끝내 안 오면(첫 기록 등) 지금 기록으로 다시 맞춘다 */
    timer = setTimeout(() => { if (wait) { wait = null; depth = depthOf(h.state); schedule(); } }, 1000);
    h.go(n);
  }
  function sync() {
    due = false;
    if (wait) return;
    if (depth > stack.length) { traverse(stack.length - depth, 'own'); return; }
    while (queue.length) {
      (queue.shift() as () => void)();
      if (wait) return;
    }
    while (depth < stack.length) { depth += 1; h.pushState(withOv(h.state, depth), '', env.href()); }
  }

  env.onPop((e) => {
    clearTimeout(timer);
    const was = wait;
    wait = null;
    depth = depthOf(e.state);
    if (was === 'own') { e.stopImmediatePropagation(); schedule(); return; }
    /* 앱이 연 해시 이동 — 새 기록이라 ov 가 없지만 창은 그대로 둔다(아래 sync 가 그 위에 창 기록을 다시 쌓는다) */
    if (hashNav) { hashNav = false; schedule(); return; }
    /* 사람이 누른 뒤로 가기(또는 해시 이동) — 이 기록보다 위에 있던 창을 맨 위부터 닫는다 */
    while (stack.length > depth) {
      const top = stack.pop() as Entry;
      if (top.back() === false) { stack.push(top); break; }
    }
    schedule();
  });

  /* popstate 없이 hashchange 만 오는 브라우저도 — 표시를 풀고 지금 기록으로 맞춘다 */
  env.onHash?.(() => { if (hashNav) { hashNav = false; depth = depthOf(h.state); schedule(); } });

  /* 다른 기록 쓰기 — 맞출 게 남았으면 맞춘 뒤에 */
  const run = (op: () => void) => {
    if (wait || due) { queue.push(op); schedule(); return; }
    op();
    schedule();
  };
  return {
    add(back: Back): Entry { const e = { back }; stack.push(e); schedule(); return e; },
    remove(e: Entry) { const i = stack.indexOf(e); if (i >= 0) { stack.splice(i, 1); schedule(); } },
    push(state: unknown, url: string) { run(() => { h.pushState(state, '', url); depth = depthOf(state); }); },
    /* 창 기록 위에서 바꾸면 창 표시(ov)는 남긴다 — 그 기록은 여전히 창이 열린 기록이다 */
    replace(state: unknown, url: string) {
      run(() => { const st = depth > 0 && depthOf(state) === 0 ? withOv(state, depth) : state; h.replaceState(st, '', url); depth = depthOf(st); });
    },
    back() { run(() => traverse(-1, 'ext')); },
    /* 해시 이동(location.hash = …) — 열린 창을 닫지 않는 이동으로 표시하고 한다 */
    hash(fn: () => void) { run(() => { hashNav = true; fn(); }); },
    /* 창을 닫고 바로 다른 화면으로 갈 때 — 닫은 창의 기록을 지운 뒤에 fn(그 안의 기록 쓰기가 지워지지 않게) */
    soon(fn: () => void) { queue.push(fn); schedule(); },
    size: () => stack.length,
  };
}

/* 앱 하나에 하나 — 모듈을 읽을 때 popstate 를 맨 먼저 듣는다(그래야 우리 go(-n) 의 popstate 를 멈출 수 있다) */
const bs = typeof window === 'undefined' ? null : createBackStack({
  history,
  href: () => location.href,
  onPop: (fn) => addEventListener('popstate', fn, true),
  onHash: (fn) => addEventListener('hashchange', fn, true),
});

/* 기록 쓰기 — 앱 코드는 history.pushState·replaceState·back 대신 이것을 쓴다 */
export const hist = {
  push: (state: unknown, url: string) => (bs ? bs.push(state, url) : history.pushState(state, '', url)),
  replace: (state: unknown, url: string) => (bs ? bs.replace(state, url) : history.replaceState(state, '', url)),
  back: () => (bs ? bs.back() : history.back()),
  soon: (fn: () => void) => (bs ? bs.soon(fn) : fn()),
  hash: (fn: () => void) => (bs ? bs.hash(fn) : fn()),
};

/* open 인 동안 뒤로 가기가 onBack 을 부른다. onBack 이 false 를 돌려주면 창을 둔다(저장 중·닫기 확인 취소).
   창을 다른 길로 닫으면(open 이 꺼지거나 빠지면) 쌓아 둔 기록을 지운다 */
export function useBackClose(open: boolean, onBack: Back): void {
  const ref = useRef(onBack);
  useLayoutEffect(() => { ref.current = onBack; });
  useLayoutEffect(() => {
    if (!open || !bs) return;
    const e = bs.add(() => ref.current());
    return () => bs.remove(e);
  }, [open]);
}

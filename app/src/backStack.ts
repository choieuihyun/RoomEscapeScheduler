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
   - 앱이 아는 기록에는 bk 표시를 단다. 표시 없는 기록으로 popstate 가 오면 밖에서 새로 생긴 기록(해시 이동 — 알림 "열기",
     주소창에 붙인 일정 링크)이라 창을 닫지 않는다(그 위에 창 기록을 다시 쌓는다).
   - 창 기록 위에서 주소를 바꾸면(#e= 지우기, 카카오 돌아옴 주소 정리) 창을 열기 전 기록에도 옮겨 적는다 — 뒤로 가서 닿을 때.
     안 그러면 옛 #e= 로 돌아가 hashchange 가 닫은 일정 대신 그 일정을 다시 열고, 옛 ?code= 가 주소에 남는다.
   - 겹친 순서는 화면에서 위에 그려지는 순서다 — layer(0: 화면 안 상세, 1: 덮는 창)가 낮은 것은 높은 것 아래에 끼운다.
   창을 열고 닫는 일은 커밋 안(layout effect)에서 표시만 하고, 기록은 마이크로태스크 한 번에 몰아 맞춘다 —
   StrictMode 의 열기·닫기·열기나 Esc 로 여러 창을 한꺼번에 닫는 것이 기록 하나·go 한 번이 된다. */

type Back = () => boolean | void;
type Entry = { back: Back; layer: number };
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
const known = (s: unknown): boolean => !!s && typeof s === 'object' && (s as { bk?: unknown }).bk === 1;
const tag = (s: unknown): object => ({ ...(s && typeof s === 'object' ? s : {}), bk: 1 });
const withOv = (s: unknown, ov: number): object => ({ ...tag(s), ov });

export function createBackStack(env: BackEnv) {
  const h = env.history;
  const stack: Entry[] = [];
  const queue: (() => void)[] = [];
  /* 지금 기록에 표시를 단다. 새로 고침 전의 창 기록이면 창은 다 닫혀 있으니 ov 도 지운다(그 기록은 같은 주소라 뒤로 가기 한 번이 헛돈다) */
  h.replaceState(withOv(h.state, 0), '', env.href());
  let depth = 0;
  let wait: 'own' | 'ext' | null = null;  // 기다리는 popstate — 우리 go(-n), 다른 곳의 뒤로 가기(더보기)
  let due = false;
  let carry: string | null = null;        // 창 기록 위에서 바꾼 주소 — 창을 열기 전 기록에 닿으면 옮겨 적는다
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

  /* 밖에서 새로 생긴 기록(해시 이동) — 표시를 달고, 창은 그대로 둔다(sync 가 그 위에 창 기록을 다시 쌓는다) */
  const adopt = (): boolean => {
    if (known(h.state)) return false;
    h.replaceState(tag(h.state), '', env.href());
    depth = 0;
    carry = null;
    schedule();
    return true;
  };

  env.onPop((e) => {
    clearTimeout(timer);
    const was = wait;
    wait = null;
    if (!known(e.state) && adopt()) return;
    const prev = depth;
    depth = depthOf(e.state);
    if (carry !== null && depth < prev) {
      h.replaceState(h.state, '', carry);
      if (depth === 0) carry = null;
    }
    if (was === 'own') { e.stopImmediatePropagation(); schedule(); return; }
    /* 사람이 누른 뒤로 가기 — 이 기록보다 위에 있던 창을 맨 위부터 닫는다 */
    while (stack.length > depth) {
      const top = stack.pop() as Entry;
      if (top.back() === false) { stack.push(top); break; }
    }
    schedule();
  });

  /* 해시 이동에 popstate 를 안 내는 브라우저도 hashchange 로 맞춘다 */
  env.onHash?.(() => { adopt(); });

  /* 다른 기록 쓰기 — 맞출 게 남았으면 맞춘 뒤에 */
  const run = (op: () => void) => {
    if (wait || due) { queue.push(op); schedule(); return; }
    op();
    schedule();
  };
  return {
    add(back: Back, layer = 1): Entry {
      const e = { back, layer };
      let i = stack.length;
      while (i > 0 && stack[i - 1].layer > layer) i -= 1;
      stack.splice(i, 0, e);
      schedule();
      return e;
    },
    remove(e: Entry) { const i = stack.indexOf(e); if (i >= 0) { stack.splice(i, 1); schedule(); } },
    push(state: unknown, url: string) { run(() => { h.pushState(tag(state), '', url); depth = depthOf(state); carry = null; }); },
    /* 창 기록 위에서 바꾸면 창 표시(ov)는 남기고, 그 주소를 창을 열기 전 기록에도 옮겨 적게 기억한다 */
    replace(state: unknown, url: string) {
      run(() => {
        const st = depth > 0 && depthOf(state) === 0 ? withOv(state, depth) : tag(state);
        if (depth > 0) carry = url;
        h.replaceState(st, '', url);
        depth = depthOf(st);
      });
    },
    back() { run(() => traverse(-1, 'ext')); },
    /* 해시 이동(location.hash = …) — 맞출 것이 남았으면 맞춘 뒤에. 새 기록이라 열린 창은 닫지 않는다 */
    hash(fn: () => void) { run(fn); },
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
/* layer — 화면에서 위에 그려지는 순서. 0 은 화면 안 상세(일정 상세), 1 은 덮는 창(기본) — 상세가 창보다 늦게 열려도 창 아래로 */
export function useBackClose(open: boolean, onBack: Back, layer = 1): void {
  const ref = useRef(onBack);
  useLayoutEffect(() => { ref.current = onBack; });
  useLayoutEffect(() => {
    if (!open || !bs) return;
    const e = bs.add(() => ref.current(), layer);
    return () => bs.remove(e);
  }, [open, layer]);
}

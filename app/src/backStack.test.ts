import { describe, it, expect } from 'vitest';
import { createBackStack, type BackEnv } from './backStack';

/* 가짜 기록 — go 는 브라우저처럼 나중에(다음 태스크) popstate 를 낸다. 우리 듣는 것이 멈추지 않은 popstate 는 others 에 남는다 */
function fake(first: unknown = null) {
  const entries: { state: unknown; url: string }[] = [{ state: first, url: '/?view=calendar' }];
  let i = 0;
  const listeners: ((e: { state: unknown; stopImmediatePropagation(): void }) => void)[] = [];
  const others: unknown[] = [];
  let gos = 0;
  const fire = () => {
    let stopped = false;
    const e = { state: entries[i].state, stopImmediatePropagation() { stopped = true; } };
    for (const l of listeners) { l(e); if (stopped) break; }
    if (!stopped) others.push(entries[i].state);
  };
  const history = {
    get state() { return entries[i].state; },
    pushState(state: unknown, _t: string, url?: string | URL | null) { entries.splice(i + 1); entries.push({ state, url: String(url ?? entries[i].url) }); i += 1; },
    replaceState(state: unknown, _t: string, url?: string | URL | null) { entries[i] = { state, url: String(url ?? entries[i].url) }; },
    go(n?: number) {
      gos += 1;
      setTimeout(() => { const j = Math.max(0, Math.min(entries.length - 1, i + (n ?? 0))); if (j === i) return; i = j; fire(); }, 0);
    },
  };
  const env: BackEnv = { history: history as unknown as BackEnv['history'], href: () => entries[i].url, onPop: (fn) => { listeners.push(fn); } };
  return {
    env, others,
    at: () => i,
    len: () => entries.length,
    state: () => entries[i].state,
    url: () => entries[i].url,
    gos: () => gos,
    userBack: () => history.go(-1),  // 사람이 누른 뒤로 가기
    pushOther: (state: unknown, url: string) => history.pushState(state, '', url),
    /* location.hash = … — 새 기록 + 바로 popstate(state 없음) */
    fragment: (url: string) => { history.pushState(null, '', url); fire(); },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('backStack — 뒤로 가기로 창 닫기', () => {
  it('창을 열면 같은 주소로 기록 하나 — 원래 state(더보기 moreSub)는 남기고 ov 를 더한다', async () => {
    const f = fake({ moreSub: 'played' });
    const bs = createBackStack(f.env);
    bs.add(() => {});
    await tick();
    expect([f.len(), f.at(), f.url()]).toEqual([2, 1, '/?view=calendar']);
    expect(f.state()).toEqual({ moreSub: 'played', bk: 1, ov: 1 });
  });

  it('뒤로 가기 → 맨 위 창의 onBack 한 번, 기록은 더 쌓지 않고 그 popstate 는 다른 곳(화면 이동)에도 간다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    let closed = 0;
    bs.add(() => { closed += 1; });
    await tick();
    f.userBack();
    await tick();
    expect([closed, bs.size(), f.at(), f.len()]).toEqual([1, 0, 0, 2]);
    expect(f.others).toEqual([{ bk: 1, ov: 0 }]);
  });

  it('화면 단추로 닫으면 쌓은 기록을 지운다 — onBack 은 부르지 않고 그 popstate 는 다른 곳에 넘기지 않는다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    let closed = 0;
    const e = bs.add(() => { closed += 1; });
    await tick();
    bs.remove(e);
    await tick();
    expect([closed, f.at(), f.others.length]).toEqual([0, 0, 0]);
    // 다시 열고 닫아도 기록이 쌓이지 않는다
    const e2 = bs.add(() => {});
    await tick();
    bs.remove(e2);
    await tick();
    expect([f.at(), f.len()]).toEqual([0, 2]);
  });

  it('겹친 창 — 뒤로 가기마다 맨 위 하나씩 닫는다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    const log: string[] = [];
    bs.add(() => { log.push('일정 창'); });
    await tick();
    bs.add(() => { log.push('테마 고르기'); });
    await tick();
    expect([f.at(), f.state()]).toEqual([2, { bk: 1, ov: 2 }]);
    f.userBack();
    await tick();
    expect([log, bs.size()]).toEqual([['테마 고르기'], 1]);
    f.userBack();
    await tick();
    expect([log, bs.size(), f.at()]).toEqual([['테마 고르기', '일정 창'], 0, 0]);
  });

  it('닫기 확인에서 취소(false) → 기록을 다시 쌓아 창을 두고, 다음 뒤로 가기에 다시 묻는다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    let answer = false, asked = 0;
    bs.add(() => { asked += 1; return answer; });
    await tick();
    f.userBack();
    await tick();
    expect([asked, bs.size(), f.at(), f.state()]).toEqual([1, 1, 1, { bk: 1, ov: 1 }]);
    answer = true;
    f.userBack();
    await tick();
    expect([asked, bs.size(), f.at()]).toEqual([2, 0, 0]);
  });

  it('열기·닫기·열기가 한 번에 오면(StrictMode) 기록 하나, go 없음', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    const a = bs.add(() => {});
    bs.remove(a);
    bs.add(() => {});
    await tick();
    expect([f.len(), f.at(), f.gos()]).toEqual([2, 1, 0]);
  });

  it('두 창을 한꺼번에 닫으면(Esc) go(-2) 한 번', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    const a = bs.add(() => {});
    await tick();
    const b = bs.add(() => {});
    await tick();
    bs.remove(b);
    bs.remove(a);
    await tick();
    expect([f.at(), f.gos(), f.others.length]).toEqual([0, 1, 0]);
  });

  it('창을 닫고 바로 다른 화면으로(soon) — 창 기록을 지운 뒤에 쌓아 남는 창 기록이 없다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    const card = bs.add(() => {});
    await tick();
    bs.remove(card);  // 커밋(카드 닫힘)
    bs.soon(() => bs.push(null, '/?view=calendar#e=3'));
    await tick();
    expect([f.at(), f.len(), f.url(), f.state()]).toEqual([1, 2, '/?view=calendar#e=3', { bk: 1 }]);
    f.userBack();
    await tick();
    expect([f.at(), f.url()]).toEqual([0, '/?view=calendar']); // 한 번에 앞 화면 — 헛도는 창 기록 없음
  });

  it('맞출 것이 남았을 때 온 기록 쓰기(push)는 맞춘 뒤에 한다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    const e = bs.add(() => {});
    await tick();
    bs.remove(e);
    bs.push(null, '/?view=home');
    await tick();
    expect([f.len(), f.at(), f.url()]).toEqual([2, 1, '/?view=home']);
  });

  it('맞출 것이 없으면 기록 쓰기는 바로 한다(더보기가 그린 직후 state 를 읽는다)', () => {
    const f = fake();
    const bs = createBackStack(f.env);
    bs.push({ moreSub: 'past' }, '/?view=more');
    expect([f.at(), f.state()]).toEqual([1, { moreSub: 'past', bk: 1 }]);
  });

  it('창 기록 위에서 replace 하면 ov 를 남긴다(#e= 지우기)', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    bs.add(() => {});
    await tick();
    bs.replace(null, '/?view=calendar');
    expect(f.state()).toEqual({ bk: 1, ov: 1 });
  });

  it('다른 곳의 뒤로 가기(더보기 하위 화면) popstate 는 그대로 넘긴다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    bs.push({ moreSub: 'played' }, '/?view=more');
    bs.back();
    await tick();
    expect([f.at(), f.others]).toEqual([0, [{ bk: 1, ov: 0 }]]);
  });

  it('밖에서 생긴 기록(주소창 해시 이동)으로 온 popstate 는 창을 닫지 않고 표시를 단 뒤 그 위에 창 기록을 다시 쌓는다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    let closed = 0;
    bs.add(() => { closed += 1; });
    await tick();
    f.fragment('/?view=calendar#e=9');
    await tick();
    expect([closed, bs.size(), f.url(), f.state(), f.at()]).toEqual([0, 1, '/?view=calendar#e=9', { bk: 1, ov: 1 }, 3]);
    f.userBack();
    await tick();
    expect([closed, f.url(), f.state()]).toEqual([1, '/?view=calendar#e=9', { bk: 1 }]);
  });

  it('앱이 연 해시 이동(알림의 "열기")은 창을 닫지 않고 그 위에 창 기록을 다시 쌓는다', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    let closed = 0;
    bs.add(() => { closed += 1; });
    await tick();
    bs.hash(() => f.fragment('/?view=calendar#e=21'));
    await tick();
    expect([closed, bs.size(), f.url(), f.state()]).toEqual([0, 1, '/?view=calendar#e=21', { bk: 1, ov: 1 }]);
    f.userBack();
    await tick();
    expect([closed, bs.size(), f.url()]).toEqual([1, 0, '/?view=calendar#e=21']);
  });

  it('창 기록 위에서 #e= 를 지우면 창을 열기 전 기록에도 옮겨 적는다 — 뒤로 가기·화면 단추 닫기 둘 다', async () => {
    for (const how of ['user', 'ui'] as const) {
      const f = fake();
      f.env.history.replaceState(null, '', '/?view=calendar#e=12'); // 링크로 연 일정
      const bs = createBackStack(f.env);
      const panel = bs.add(() => {}, 0);
      await tick();
      expect(f.url()).toBe('/?view=calendar#e=12');
      bs.replace(f.state(), '/?view=calendar');  // 다른 일정(15)을 열며 #e=12 를 지움
      if (how === 'user') f.userBack(); else bs.remove(panel);
      await tick();
      expect([how, f.at(), f.url()]).toEqual([how, 0, '/?view=calendar']);
    }
  });

  it('겹친 순서는 화면 순서 — 일정 창이 열린 채 상세(layer 0)가 나중에 열려도 첫 뒤로 가기는 일정 창', async () => {
    const f = fake();
    const bs = createBackStack(f.env);
    const log: string[] = [];
    bs.add(() => { log.push('일정 창'); });
    await tick();
    bs.add(() => { log.push('상세'); }, 0);
    await tick();
    f.userBack();
    await tick();
    expect(log).toEqual(['일정 창']);
    f.userBack();
    await tick();
    expect(log).toEqual(['일정 창', '상세']);
  });

  it('새로 고침 전의 창 표시(ov)는 지운다 — 열린 창이 없으니', () => {
    const f = fake({ moreSub: 'played', ov: 2 });
    createBackStack(f.env);
    expect(f.state()).toEqual({ moreSub: 'played', bk: 1, ov: 0 });
  });
});

/**
 * 계획서 "Step 1/3" 게이트: test/fixtures/legacy-links.json 에 박아 둔 실제 v1/v2/v3
 * 공유 링크 해시가 새 restore()에서도 (실측으로 검증해 둔) 같은 결과를 내는지 확인한다.
 * 이 테스트가 초록불이 아니면 직렬화 포맷이 깨진 것 — 사용자의 공유 링크·자동저장·
 * Firestore snapshot이 전부 이 포맷에 의존한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  canCompressShare, deflateShare, inflateShare, readShareHash, restore, serialize, shareHash,
  type AppState,
} from './serialize';

const fixturesPath = fileURLToPath(new URL('../../test/fixtures/legacy-links.json', import.meta.url));
const { fixtures } = JSON.parse(readFileSync(fixturesPath, 'utf8'));

describe('legacy-links 픽스처 왕복 (v1/v2/v3early/v3current)', () => {
  for (const fx of fixtures as any[]) {
    it(fx.label, () => {
      const state = restore(fx.hash);
      const exp = fx.expectedAfterRestore;

      expect(state.themes.map(t => t.name)).toEqual(exp.themeNames);
      expect(state.themes.map(t => t.place)).toEqual(exp.places);
      expect(state.options.oStart).toBe(exp.oStart);
      expect(state.options.oEnd).toBe(exp.oEnd);
      expect(state.options.oMinGap).toBe(exp.oMinGap);
      expect(state.options.oMove).toBe(exp.oMove);
      expect(state.sortKey).toBe(exp.sortKey);

      if (exp.themeIds) {
        expect(state.themes.map(t => t.id)).toEqual(exp.themeIds);
      }
      if (exp.oMaxGap !== undefined) expect(state.options.oMaxGap).toBe(exp.oMaxGap);
      if (exp.oPartial !== undefined) expect(state.options.oPartial).toBe(exp.oPartial);
      if (exp.oMeal !== undefined) expect(state.options.oMeal).toBe(exp.oMeal);
      if (exp.oMealFrom !== undefined) expect(state.options.oMealFrom).toBe(exp.oMealFrom);
      if (exp.oMealTo !== undefined) expect(state.options.oMealTo).toBe(exp.oMealTo);
      if (exp.oMealMin !== undefined) expect(state.options.oMealMin).toBe(exp.oMealMin);
      if (exp.oTeam !== undefined) expect(state.options.oTeam).toBe(exp.oTeam);

      if (exp.moveMapPairs) {
        for (const [a, b, v] of exp.moveMapPairs as [string, string, number][]) {
          // moveMap is keyed by pairKey(a,b) — re-derive via restore()'s own state, not by
          // reaching into internals: just check the pair resolved to the expected value.
          const key = Object.keys(state.moveMap).find(k => {
            const [x, y] = k.split('\u0000');
            return (x === a && y === b) || (x === b && y === a);
          });
          expect(key).toBeDefined();
          expect(state.moveMap[key!]).toBe(v);
        }
      } else {
        expect(Object.keys(state.moveMap)).toHaveLength(0);
      }

      if (exp.teams) {
        expect(state.teams).toHaveLength(exp.teams.length);
        exp.teams.forEach((t: any, i: number) => {
          expect(state.teams[i].name).toBe(t.name);
          expect(state.teams[i].start).toBe(t.start);
          expect(state.teams[i].end).toBe(t.end);
          expect(state.teams[i].steps).toHaveLength(t.stepCount);
        });
      } else {
        expect(state.teams).toHaveLength(0);
      }
    });
  }

  it('v1/v2/v3early(설명 없음, id 없음)는 기본 startId=1부터 순서대로 새 id를 받는다', () => {
    const v1 = fixtures.find((f: any) => f.version === 1);
    const state = restore(v1.hash);
    expect(state.themes.map(t => t.id)).toEqual([1, 2, 3]);
    expect(state.nextId).toBe(4);
  });
});

describe('restore() — mid-session id 충돌 방지 (index.html에서 실측 재현·수정한 버그의 회귀 테스트)', () => {
  it('startId를 넘기면 명시적 id가 없는 테마들이 거기서부터 이어진다', () => {
    const v1 = fixtures.find((f: any) => f.version === 1);
    const state = restore(v1.hash, 7);
    expect(state.themes.map(t => t.id)).toEqual([7, 8, 9]);
    expect(state.nextId).toBe(10);
  });

  it('명시적 id(v3current)가 있으면 startId를 무시하고 그 id를 그대로 쓴다 — 팀 배정이 가리키는 게 이 id다', () => {
    const v3current = fixtures.find((f: any) => f.label.startsWith('v3current'));
    // 이미 세션에서 id 7,8,9 까지 써버린 상태에서(nextId=10) 저장된 계획을 불러온 상황을 흉내낸다.
    const state = restore(v3current.hash, 10);
    expect(state.themes.map(t => t.id)).toEqual([1, 2, 3]);
    // 그리고 teams[].steps[].id 도 1,2,3 이므로 두 값이 반드시 일치해야 F-14 제외가 작동한다.
    expect(state.teams[0].steps.map(s => s.id)).toEqual(state.themes.map(t => t.id));
    // 다음 새 카드는 기존 세션의 10과 방금 복원한 3 중 더 큰 쪽보다 커야 한다.
    expect(state.nextId).toBe(10);
  });
});

/* F-16 — "새로고침하면 감시 벨이 사라진다" 의 회귀 테스트.
   복원은 raw 텍스트를 parseSessions()로 다시 읽는데 그 함수는 Session.id 를
   만들지 않는다. 튜플 7번째 자리가 그걸 메운다 (serialize.ts themeExtra). */
describe('serialize()↔restore() — 서버에서 불러온 회차의 slotId·출처가 살아남는다', () => {
  const serverTheme = {
    id: 1, name: '목격자', dur: 65, place: '플레이33 건대점',
    raw: '10:35  13:00 매진  18:15  22:30 매진',
    source: 'server',
    sessions: [
      { t: 635, soldout: false, id: 172 },
      { t: 780, soldout: true, id: 173 },
      { t: 1095, soldout: false, id: 174 },
      { t: 1350, soldout: true, id: 175 },
    ],
  };
  const state = (themes: any[]): AppState => ({
    themes, moveMap: {}, sortKey: 'gap', teams: [], nextId: 9,
    options: {
      oStart: '', oEnd: '', oMinGap: '', oMaxGap: '', oPartial: false,
      oMeal: false, oMealFrom: '', oMealTo: '', oMealMin: '',
      oMove: '10', oTeam: false, oIncludeSoldout: false,
    },
  });

  it('slotId 가 시각(t)으로 되붙고, 매진 여부도 그대로다 — 벨이 뜨는 조건 자체', () => {
    const back = restore(serialize(state([serverTheme]))).themes[0];
    expect(back.sessions.map(s => s.t)).toEqual([635, 780, 1095, 1350]);
    expect(back.sessions.map(s => s.id)).toEqual([172, 173, 174, 175]);
    expect(back.sessions.map(s => s.soldout)).toEqual([false, true, false, true]);
    // 벨의 실제 조건 (ThemeCard/ResultCard)
    expect(back.sessions.filter(s => s.soldout && s.id != null)).toHaveLength(2);
  });

  it('출처(source)도 살아남는다 — 예전에는 새로고침하면 manual 로 되돌아갔다', () => {
    const back = restore(serialize(state([serverTheme]))).themes[0];
    expect(back.source).toBe('server');
  });

  it('회차를 손으로 고쳐 없어진 시각의 id 는 그냥 안 붙는다 (엉뚱한 칩에 붙지 않는다)', () => {
    const edited = { ...serverTheme, raw: '10:35  13:00 매진  19:00' };
    const back = restore(serialize(state([edited]))).themes[0];
    expect(back.sessions.map(s => s.t)).toEqual([635, 780, 1140]);
    expect(back.sessions.map(s => s.id)).toEqual([172, 173, undefined]);
  });

  it('손으로 친 테마는 7번째 자리가 아예 안 붙는다 — 옛 링크와 바이트가 같다', () => {
    const manual = {
      id: 1, name: '방', dur: 70, place: '', raw: '10:00 12:00', source: 'manual',
      sessions: [{ t: 600, soldout: false }, { t: 720, soldout: false }],
    };
    const json = JSON.parse(atob(serialize(state([manual])).replace(/-/g, '+').replace(/_/g, '/')));
    expect(json.t[0]).toHaveLength(6);
  });

  it('날짜(date)도 살아남는다 — 테마 간 날짜 불일치 경고(§4.41)가 새로고침 후에도 유지된다', () => {
    const dated = { ...serverTheme, date: '2026-09-02' };
    const back = restore(serialize(state([dated]))).themes[0];
    expect(back.date).toBe('2026-09-02');
  });

  it('날짜 없는 서버 테마는 date가 undefined로 복원된다', () => {
    const back = restore(serialize(state([serverTheme]))).themes[0];
    expect(back.date).toBeUndefined();
  });
});

/* ══ #z= 공유 링크 압축 (1차: 읽기만) ═══════════════════════════════════
   지켜야 할 불변식은 "풀면 열린다"가 아니라 **"풀면 #s= 와 바이트가 같다"** 다.
   같은 바이트여야 restore() 를 한 벌로 유지할 수 있고, 옛 링크·자동저장·
   Firestore snapshot 이 의존하는 포맷이 안 건드려졌다는 증거가 된다. */
describe('#z= 압축 공유 링크', () => {
  const serverTheme = {
    id: 1, name: '목격자', dur: 65, place: '플레이33 건대점',
    raw: '10:35  13:00 매진  18:15  22:30 매진',
    source: 'server',
    sessions: [
      { t: 635, soldout: false, id: 172 },
      { t: 780, soldout: true, id: 173 },
      { t: 1095, soldout: false, id: 174 },
      { t: 1350, soldout: true, id: 175 },
    ],
    date: '2026-09-05',
  };
  const state = (themes: any[]): AppState => ({
    themes, moveMap: { '플레이33 건대점|||토끼굴 홍대점': 25 }, sortKey: 'gap', teams: [], nextId: 9,
    options: {
      oStart: '11:00', oEnd: '20:00', oMinGap: '10', oMaxGap: '', oPartial: false,
      oMeal: false, oMealFrom: '11:30', oMealTo: '14:00', oMealMin: '40',
      oMove: '10', oTeam: false, oIncludeSoldout: true,
    },
  });

  it('이 환경에 deflate-raw 가 있다 (없으면 아래 테스트는 의미가 없다)', () => {
    expect(canCompressShare()).toBe(true);
  });

  it('풀면 #s= 페이로드와 바이트가 완전히 같다', async () => {
    const st = state([serverTheme]);
    expect(await inflateShare(await deflateShare(st))).toBe(serialize(st));
  });

  it('#z= 로 왕복해도 restore() 결과가 #s= 와 동일하다 — slotId·출처·날짜까지', async () => {
    const st = state([serverTheme]);
    const viaZ = restore(await inflateShare(await deflateShare(st)));
    expect(viaZ).toEqual(restore(serialize(st)));
    expect(viaZ.themes[0].sessions.map(x => x.id)).toEqual([172, 173, 174, 175]);
    expect(viaZ.themes[0].source).toBe('server');
    expect(viaZ.themes[0].date).toBe('2026-09-05');
  });

  it('옛 픽스처(v1/v2/v3)도 #z= 로 실어 나를 수 있다 — 포맷이 아니라 운반만 바뀐 것', async () => {
    for (const fx of fixtures as any[]) {
      const st = restore(fx.hash);
      expect(await inflateShare(await deflateShare(st))).toBe(serialize(st));
    }
  });

  it('실제로 짧아진다 — 반복 많은 서버 회차 데이터에서', async () => {
    const st = state([serverTheme, { ...serverTheme, id: 2, name: '다이얼' }, { ...serverTheme, id: 3, name: '그 날' }]);
    const plain = serialize(st).length;
    const packed = (await deflateShare(st)).length;
    expect(packed).toBeLessThan(plain / 2);
  });

  it('망가진 페이로드는 조용히 빈 값이 아니라 예외로 끝난다', async () => {
    // 조회 실패와 "결과 없음" 을 같은 값으로 두지 않는다 — useScheduler 가 이 예외를
    // 잡아 안내를 띄운다. 여기서 빈 상태를 돌려주면 그 구분이 사라진다.
    await expect(inflateShare('bm90LWRlZmxhdGUtYXQtYWxs')).rejects.toThrow();
  });
});

/* ══ 해시 판독 가드 ═══════════════════════════════════════════════════
   1차에서 useScheduler 안에 인라인이라 테스트를 못 걸었던 부분. 순수 함수로
   빼면서 여기로 왔다. 지켜야 할 것은 **못 읽는 공유 링크가 'none'(=자동저장
   으로)으로 새지 않는 것** 하나다 — 새면 받는 사람 자기 일정이 조용히 뜬다. */
describe('readShareHash — 공유 링크와 그냥 앵커를 가른다', () => {
  it('#s= 는 그대로 읽는 형식', () => {
    expect(readShareHash('#s=abc')).toEqual({ kind: 'plain', payload: 'abc' });
  });

  it('#z= 는 압축 형식', () => {
    expect(readShareHash('#z=abc')).toEqual({ kind: 'packed', payload: 'abc' });
  });

  it('모르는 형식은 unknown — 절대 none 으로 새지 않는다', () => {
    // 이 한 줄이 "옛 번들이 #z= 를 받으면 자기 자동저장을 본다" 버그의 회귀 테스트다.
    expect(readShareHash('#q=abc')).toEqual({ kind: 'unknown', tag: 'q' });
  });

  it('평범한 앵커·빈 해시는 공유 링크가 아니다 — 자동저장으로 간다', () => {
    for (const h of ['#top', '#', '', '#s', '#=abc', '#ss=abc', '#S=abc']) {
      expect(readShareHash(h).kind).toBe('none');
    }
  });

  it('페이로드에 = 나 개행이 섞여도 통째로 넘긴다', () => {
    expect(readShareHash('#s=a=b\nc')).toEqual({ kind: 'plain', payload: 'a=b\nc' });
  });
});

/* ══ 2차 — 쓰기 스위치 ════════════════════════════════════════════════ */
describe('shareHash — 공유 링크에 붙일 해시', () => {
  const st = (): AppState => ({
    themes: [{
      id: 1, name: '목격자', dur: 65, place: '플레이33 건대점',
      raw: '10:35  13:00 매진  18:15  22:30 매진', source: 'server', date: '2026-09-05',
      sessions: [
        { t: 635, soldout: false, id: 172 }, { t: 780, soldout: true, id: 173 },
        { t: 1095, soldout: false, id: 174 }, { t: 1350, soldout: true, id: 175 },
      ],
    }],
    moveMap: {}, sortKey: 'gap', teams: [], nextId: 2,
    options: {
      oStart: '11:00', oEnd: '20:00', oMinGap: '10', oMaxGap: '', oPartial: false,
      oMeal: false, oMealFrom: '11:30', oMealTo: '14:00', oMealMin: '40',
      oMove: '10', oTeam: false, oIncludeSoldout: true,
    },
  });

  it('기본값은 켜짐 — #z= 를 만들고, readShareHash 가 packed 로 읽는다', async () => {
    const h = await shareHash(st());
    expect(h.startsWith('z=')).toBe(true);
    expect(readShareHash('#' + h)).toEqual({ kind: 'packed', payload: h.slice(2) });
  });

  it('끄면 #s= 로 떨어진다 — 압축을 못 쓰는 브라우저가 가는 길이기도 하다', async () => {
    const h = await shareHash(st(), false);
    expect(h.startsWith('s=')).toBe(true);
    expect(h.slice(2)).toBe(serialize(st()));
  });

  it('켠 링크를 다시 풀면 끈 링크와 바이트가 같다 — 스위치는 운반만 바꾼다', async () => {
    const off = await shareHash(st(), false);
    const on = await shareHash(st(), true);
    expect(await inflateShare(on.slice(2))).toBe(off.slice(2));
    expect(restore(await inflateShare(on.slice(2)))).toEqual(restore(off.slice(2)));
  });

  it('켜면 실제로 짧아진다', async () => {
    const s2 = { ...st(), themes: [st().themes[0], { ...st().themes[0], id: 2, name: '다이얼' }, { ...st().themes[0], id: 3, name: '그 날' }] };
    expect((await shareHash(s2, true)).length).toBeLessThan((await shareHash(s2, false)).length / 2);
  });
});

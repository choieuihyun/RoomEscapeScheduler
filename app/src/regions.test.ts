import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, REGIONS, inRegion, pageAt, pageFor, pageOf, regionCounts, regionOf } from './regions';

describe('regionOf — 지역 표', () => {
  it.each([
    ['제로월드', '강남점', '강남'],
    ['비트포비아', '던전루나(강남)', '강남'],
    ['아무매장', '역삼점', '강남'],
    ['아무매장', '신논현점', '강남'],
    ['키이스케이프', '홍대점', '홍대'],
    ['지구별', '홍대어드벤처점', '홍대'],
    ['플레이33', '건대점', '건대'],
    ['키이스케이프', '부산점', '부산'],
    ['플레이포인트랩', '서면탄탄스트리트점', '부산'],
    ['플레이포인트랩', '해운대 블루오션스테이션', '부산'],
    ['비트포비아', '서면던전 레드(부산)', '부산'],
    ['지구별', '대구점', '대구'],
    ['플레이33', '대전점', '대전'],
    ['플레이33', '수원점', '수원'],
    ['제로월드', '김포본점', '김포'],
  ])('%s %s → %s', (store, branch, r) => {
    expect(regionOf(store, branch)).toBe(r);
  });

  it('EXTRA 표 — 키이스케이프 에버랜드는 용인, 다이아에그 다이아에그는 부산(공백·대소문자 무시)', () => {
    expect(regionOf('키이스케이프', '에버랜드')).toBe('용인');
    expect(regionOf('키이스케이프 ', ' 에버 랜드')).toBe('용인');
    expect(regionOf('다이아에그', '다이아에그')).toBe('부산'); // 서면(id diaegg-seomyeon)
  });

  it('아직 지역을 못 받은 지점·표에 없는 지점은 기타', () => {
    for (const b of ['LOG_IN 1', 'LOG_IN 2', 'STATION', '더오름', '메모리컴퍼니', '우주라이크', '후즈데어']) expect(regionOf('키이스케이프', b)).toBe('기타');
    expect(regionOf('다이아에그', '미스테리인')).toBe('기타');
    expect(regionOf('비트포비아', '던전101')).toBe('기타');
    expect(regionOf('', '')).toBe('기타');
  });

  it('지점 이름이 매장 이름보다 먼저', () => {
    expect(regionOf('강남이스케이프', '홍대점')).toBe('홍대');
    expect(regionOf('강남이스케이프', '본점')).toBe('강남');
  });

  it('지역 순서', () => {
    expect(REGIONS).toEqual(['강남', '홍대', '건대', '부산', '대구', '대전', '수원', '김포', '용인', '기타']);
  });
});

const T = (storeName: string, branchName: string, id = `${storeName}-${branchName}`) => ({ id, storeName, branchName });

describe('regionCounts · inRegion — 지역 개수와 거르기', () => {
  const list = [T('a', '홍대점', '1'), T('b', '강남점', '2'), T('c', '홍대점', '3'), T('키이스케이프', '에버랜드', '4'), T('d', '모름', '5'), T('e', '강남점', '6')];

  it('결과에 있는 지역만, 지역 순서대로 개수와 함께', () => {
    expect(regionCounts(list)).toEqual([
      { region: '강남', n: 2 }, { region: '홍대', n: 2 }, { region: '용인', n: 1 }, { region: '기타', n: 1 },
    ]);
    expect(regionCounts([])).toEqual([]);
  });

  it('거를 때 받은 순서는 그대로, 전체는 다', () => {
    expect(inRegion(list, '홍대').map((t) => t.id)).toEqual(['1', '3']);
    expect(inRegion(list, '강남').map((t) => t.id)).toEqual(['2', '6']);
    expect(inRegion(list, '전체').map((t) => t.id)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(inRegion(list, '대구')).toEqual([]);
  });
});

describe('pageOf · pageFor — 20개씩 쪽 나누기', () => {
  const list = Array.from({ length: 144 }, (_, i) => i);

  it('한 쪽 20개, 144개면 8쪽', () => {
    expect(PAGE_SIZE).toBe(20);
    const p = pageOf(list, 0);
    expect(p.items).toEqual(list.slice(0, 20));
    expect(p.pages).toBe(8);
    expect(p.from).toBe(0);
    expect(pageOf(list, 1).items[0]).toBe(20);
  });

  it('마지막 쪽은 남은 것만(144 = 7 × 20 + 4)', () => {
    const p = pageOf(list, 7);
    expect(p.items).toEqual([140, 141, 142, 143]);
    expect(p.page).toBe(7);
    expect(p.from).toBe(140);
  });

  it('목록이 줄어 그 쪽이 없어지면 마지막 쪽, 음수는 첫 쪽', () => {
    expect(pageOf(list.slice(0, 30), 5)).toMatchObject({ page: 1, pages: 2, items: list.slice(20, 30) });
    expect(pageOf(list, -1).page).toBe(0);
  });

  it('비어도 1쪽', () => {
    expect(pageOf([], 3)).toEqual({ items: [], page: 0, pages: 1, from: 0 });
  });

  it('지역·날짜(목록 키)가 바뀌면 1쪽, 같으면 그 쪽', () => {
    const s = { at: '2026-10-25|u1,u2|강남', page: 3 };
    expect(pageFor(s, '2026-10-25|u1,u2|강남')).toBe(3);
    expect(pageFor(s, '2026-10-25|u1,u2|홍대')).toBe(0);
    expect(pageFor(s, '2026-10-26|u1,u2|강남')).toBe(0);
    expect(pageFor({ at: '', page: 0 }, 'x')).toBe(0);
  });

  it('pageAt — 지역 A 3쪽 → B → A 로 돌아와도 1쪽(옛 쪽을 되살리지 않는다), 같은 키면 그대로', () => {
    const A = '2026-10-25|u1,u2|강남', B = '2026-10-25|u1,u2|홍대';
    let s = pageAt({ at: '', page: 0 }, A);
    s = { at: A, page: 2 };                       // 3쪽으로 넘김
    expect(pageAt(s, A)).toBe(s);
    s = pageAt(s, B);
    expect([s.at, pageFor(s, B)]).toEqual([B, 0]);
    s = pageAt(s, A);
    expect([s.at, pageFor(s, A)]).toEqual([A, 0]);
    expect(pageFor(pageAt({ at: A, page: 4 }, '2026-10-26|u1,u2|강남'), '2026-10-26|u1,u2|강남')).toBe(0); // 날짜가 바뀌어도
  });
});

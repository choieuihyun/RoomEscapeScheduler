/* 테스트 알림 단추 쉬는 시간 — 서버가 1분에 한 번만 받는다(429 TOO_SOON). 보낸 뒤 60초는 단추를 잠그고 남은 시간을 보인다. */
export const TEST_COOL_MS = 60_000;

/* 남은 초(올림). 쉬는 시간이 아니면 0. */
export function coolLeft(until: number, now: number): number {
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function testLabel(busy: boolean, left: number): string {
  if (busy) return '보내는 중…';
  return left > 0 ? `${left}초 뒤 다시 보낼 수 있어요` : '테스트 알림 보내기';
}

/* 쉬는 시간이 끝나는 시각 — 내 정보 화면을 나갔다 들어와도 이어지게 모듈에 둔다(새로 고치면 서버 429 가 막고, 그때 다시 걸린다) */
let until = 0;
export const coolUntil = () => until;
export const startCool = () => { until = Date.now() + TEST_COOL_MS; };

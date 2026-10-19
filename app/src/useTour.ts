import { useEffect, useRef } from 'react';

/* 화면을 어둡게 덮고 설명할 요소 하나만 구멍을 뚫어 보여주는 스포트라이트 방식.
   index.html의 사용법 투어(§4.23) 이식 — DOM을 직접 만들고 움직이는 방식 그대로 가져왔다,
   React 트리 안에 넣기보다 body에 직접 붙이는 쪽이 원본과 동일하고 더 단순하다. */
const TOUR_KEY = 'resched.tour_v1';
const TOUR_STEPS = [
  { sel: '#loadBtn', title: '처음이라면', body: '먼저 테마를 불러와 보세요. 예약 사이트 시간표가 그대로 채워져요.' },
  { sel: '#addTheme', title: '테마 추가', body: '갈 방(테마)마다 하나씩 추가하세요.' },
  { sel: '#themes', title: '시간표 넣기', body: '예약 가능한 회차를 직접 넣거나, 예약 화면 캡처를 붙여넣으면(Ctrl+V) 알아서 읽어요. 매장 이름을 적어 두면 매장 사이 이동시간도 같이 계산해요.' },
  { sel: '.opts', title: '조건 정하기', body: '몇 시부터 몇 시까지, 방 사이를 얼마나 비울지 정해요.' },
  { sel: '#go', title: '조합 계산', body: '조건에 맞게 겹치지 않는 조합을 다 찾아 줘요.' },
  { sel: '#results', title: '결과 확인', body: '정렬을 바꿔 가며 보고, 마음에 드는 조합은 저장해 두세요.' },
  { sel: '#shareBtn', title: '공유하기', body: '지금 넣은 내용을 그대로 담은 링크를 복사해요. 로그인 안 해도 바로 보낼 수 있어요.' },
];

function esc(s: string) {
  return s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[m]);
}

interface TourNodes { dim: HTMLDivElement; spot: HTMLDivElement; tip: HTMLDivElement }

export function useTour() {
  const nodesRef = useRef<TourNodes | null>(null);
  const stepRef = useRef(0);
  const startedAutoRef = useRef(false);

  function mount(): TourNodes {
    if (nodesRef.current) return nodesRef.current;
    const dim = document.createElement('div'); dim.className = 'tour-dim';
    const spot = document.createElement('div'); spot.className = 'tour-spot';
    const tip = document.createElement('div'); tip.className = 'tour-tip';
    document.body.append(dim, spot, tip);
    const nodes = { dim, spot, tip };
    nodesRef.current = nodes;
    return nodes;
  }

  function unmount() {
    if (nodesRef.current) {
      nodesRef.current.dim.remove();
      nodesRef.current.spot.remove();
      nodesRef.current.tip.remove();
      nodesRef.current = null;
    }
  }

  function end() {
    if (!nodesRef.current) return;
    unmount();
    localStorage.setItem(TOUR_KEY, '1');
  }

  function position(target: Element, step: (typeof TOUR_STEPS)[number]) {
    const { spot, tip } = mount();
    const r = target.getBoundingClientRect();
    const pad = 8;
    spot.style.top = (r.top - pad) + 'px'; spot.style.left = (r.left - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';

    tip.innerHTML = `
      <div class="step">${stepRef.current + 1} / ${TOUR_STEPS.length}</div>
      <h4>${esc(step.title)}</h4>
      <p>${esc(step.body)}</p>
      <div class="tour-btns">
        <button class="tour-skip" type="button">건너뛰기</button>
        <div class="tour-next-group">
          ${stepRef.current > 0 ? '<button class="btn" data-tour="prev" type="button">이전</button>' : ''}
          <button class="btn-go" data-tour="next" type="button">${stepRef.current === TOUR_STEPS.length - 1 ? '확인' : '다음'}</button>
        </div>
      </div>`;
    tip.querySelector('.tour-skip')!.addEventListener('click', end);
    tip.querySelector('[data-tour=next]')!.addEventListener('click', () =>
      stepRef.current < TOUR_STEPS.length - 1 ? showStep(stepRef.current + 1) : end());
    const prevBtn = tip.querySelector('[data-tour=prev]');
    if (prevBtn) prevBtn.addEventListener('click', () => showStep(stepRef.current - 1));

    requestAnimationFrame(() => {
      const th = tip.offsetHeight, tw = tip.offsetWidth, vw = innerWidth, vh = innerHeight;
      let top = r.bottom + pad + 14;
      if (top + th > vh - 16) top = Math.max(16, r.top - pad - 14 - th);
      const left = Math.min(Math.max(16, r.left), vw - tw - 16);
      tip.style.top = top + 'px'; tip.style.left = left + 'px';
      tip.classList.add('on');
    });
  }

  function showStep(i: number) {
    const step = TOUR_STEPS[i];
    const target = document.querySelector(step.sel);
    if (!target) {
      if (i < TOUR_STEPS.length - 1) showStep(i + 1); else end();
      return;
    }
    stepRef.current = i;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => position(target, step), 320);
  }

  function start() {
    stepRef.current = 0;
    mount();
    showStep(0);
  }

  useEffect(() => {
    const reposition = () => {
      if (!nodesRef.current) return;
      const step = TOUR_STEPS[stepRef.current];
      const target = document.querySelector(step.sel);
      if (target) position(target, step);
    };
    /* 모바일에선 터치로 스크롤이 아주 쉽게 일어난다 — spot/tip은 position:fixed라
       화면 좌표로 한 번 계산해 두는데, resize만 듣고 scroll을 안 들으면 스크롤
       한 번에 하이라이트가 원래 자리에 그대로 남고 실제 타깃만 움직여서
       완전히 어긋난다(실측 확인). rAF로 묶어 스크롤마다 레이아웃을 반복
       계산하지 않게 한다. */
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; reposition(); });
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    if (!startedAutoRef.current) {
      startedAutoRef.current = true;
      if (!localStorage.getItem(TOUR_KEY)) setTimeout(start, 500);
    }
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (raf) cancelAnimationFrame(raf);
      unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { start, end };
}

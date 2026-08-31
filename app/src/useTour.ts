import { useEffect, useRef } from 'react';

/* 화면을 어둡게 덮고 설명할 요소 하나만 구멍을 뚫어 보여주는 스포트라이트 방식.
   index.html의 사용법 투어(§4.23) 이식 — DOM을 직접 만들고 움직이는 방식 그대로 가져왔다,
   React 트리 안에 넣기보다 body에 직접 붙이는 쪽이 원본과 동일하고 더 단순하다. */
const TOUR_KEY = 'resched.tour_v1';
const TOUR_STEPS = [
  { sel: '#loadBtn', title: '감이 안 잡히면', body: '예약 사이트에서 회차를 그대로 불러와 화면이 어떻게 채워지는지 먼저 확인해 보세요.' },
  { sel: '#addTheme', title: '테마 추가', body: '테마 하나 = 예약할 매장 하나예요. 여기를 눌러 필요한 만큼 추가하세요.' },
  { sel: '#themes', title: '시간표 넣기', body: '예약 가능한 회차를 직접 입력하거나, 예약 화면 캡처를 붙여넣으면(Ctrl+V) 자동으로 읽습니다. 매장 이름을 적어두면 매장 간 이동시간도 계산에 들어가요.' },
  { sel: '.opts', title: '조건 정하기', body: '가장 이른 시작·늦은 종료, 최소·최대 공백, 기본 이동시간 같은 조건을 정합니다.' },
  { sel: '#go', title: '조합 계산', body: '조건에 맞고 서로 겹치지 않는 조합을 전부 찾아줍니다.' },
  { sel: '#results', title: '결과 확인', body: '정렬 기준을 바꿔가며 훑어보고, 마음에 드는 조합은 저장해 두세요.' },
  { sel: '#shareBtn', title: '공유하기', body: '지금 입력한 내용을 그대로 담은 링크를 복사합니다. 로그인 없이도 바로 공유할 수 있어요.' },
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
    const onResize = () => {
      if (!nodesRef.current) return;
      const step = TOUR_STEPS[stepRef.current];
      const target = document.querySelector(step.sel);
      if (target) position(target, step);
    };
    window.addEventListener('resize', onResize);
    if (!startedAutoRef.current) {
      startedAutoRef.current = true;
      if (!localStorage.getItem(TOUR_KEY)) setTimeout(start, 500);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { start, end };
}

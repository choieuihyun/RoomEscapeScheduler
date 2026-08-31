import { useCallback, useEffect, useState } from 'react';

/* 저장된 선택이 없으면 시스템 설정을 그대로 따르고([data-theme] 속성 자체를 안 둠),
   버튼을 누르면 그때부터 그 선택을 기억한다. index.html의 다크 모드 로직 이식. */
const THEME_KEY = 'resched.theme';

const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

function isDarkNow(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : sysDark();
}

function applyTheme(t: string | null) {
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  const dark = isDarkNow();
  const meta = document.getElementById('themeColorMeta') as HTMLMetaElement | null;
  if (meta) meta.content = dark ? '#14161A' : '#F2F4F6';
  return dark;
}

export function useTheme() {
  const [dark, setDark] = useState(() => applyTheme(localStorage.getItem(THEME_KEY)));

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!localStorage.getItem(THEME_KEY)) setDark(applyTheme(null));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = isDarkNow() ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    setDark(applyTheme(next));
  }, []);

  return { dark, toggle };
}

import { useState } from 'react';

/* 동그란 아바타(§4.60) — 구글 사진이 있으면 사진, 없거나 못 받으면 이름 첫 글자.
   구글 사진 서버는 다른 사이트의 Referer 가 붙으면 거절할 때가 있어 no-referrer 로 받는다. */
export function Avatar({ name, photo, className = '' }: { name: string; photo?: string; className?: string }) {
  const [bad, setBad] = useState('');
  const cls = 'ava' + (className ? ' ' + className : '');
  if (photo && bad !== photo) {
    return <img className={cls} src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBad(photo)} />;
  }
  return <span className={cls} aria-hidden="true">{[...name][0] ?? '?'}</span>;
}

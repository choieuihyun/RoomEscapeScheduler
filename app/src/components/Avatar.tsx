import { useState } from 'react';

/* 동그라미 안 별명 — 첫 글자만이 아니라 별명을 다 적는다(2026-10-22 사용자 요청: 별명이 두 글자로 통일이라).
   길수록 글자를 줄인다(data-n, CSS .ava-t). 동그라미 크기·바탕은 쓰는 쪽 클래스가 정한다 */
export function AvaText({ name }: { name: string }) {
  const chars = [...name.trim()];
  if (chars.length === 0) return <>?</>;
  return <span className="ava-t" data-n={Math.min(chars.length, 4)}>{chars.join('')}</span>;
}

/* 동그란 아바타(§4.60) — 구글 사진이 있으면 사진, 없거나 못 받으면 별명.
   구글 사진 서버는 다른 사이트의 Referer 가 붙으면 거절할 때가 있어 no-referrer 로 받는다. */
export function Avatar({ name, photo, className = '' }: { name: string; photo?: string; className?: string }) {
  const [bad, setBad] = useState('');
  const cls = 'ava' + (className ? ' ' + className : '');
  if (photo && bad !== photo) {
    return <img className={cls} src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBad(photo)} />;
  }
  return <span className={cls} aria-hidden="true"><AvaText name={name} /></span>;
}

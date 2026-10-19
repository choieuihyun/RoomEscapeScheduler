import { lazy, type ComponentType } from 'react';

/* 늦게 받는 화면 코드가 안 받아질 때(연결 끊김, 배포 뒤 옛 탭에서 해시 파일명이 바뀐 404) 한 번 더 시도한다 */
export async function retryImport<T>(load: () => Promise<T>, wait = 400): Promise<T> {
  try {
    return await load();
  } catch {
    await new Promise(r => setTimeout(r, wait));
    return load();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => retryImport(load));
}

export const STALE_MSG = '새 버전이 나왔거나 연결이 끊겼어요. 새로 고침해 주세요.';

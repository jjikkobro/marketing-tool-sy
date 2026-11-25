import { useSyncExternalStore } from 'react';

/*
 * 검토자 이름은 승인·채택·발행·설정 변경에 모두 기록된다. 화면마다 다시 쓰지 않도록 한 곳에 두고,
 * 어느 화면에서 고쳐도 다른 화면이 바로 따라오게 useSyncExternalStore로 구독한다.
 */
const KEY = 'social-collector:reviewer';
const listeners = new Set<() => void>();

function read(): string {
  return localStorage.getItem(KEY) ?? '';
}

export function setReviewer(value: string) {
  localStorage.setItem(KEY, value);
  for (const listener of listeners) listener();
}

export function useReviewer(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => '',
  );
}

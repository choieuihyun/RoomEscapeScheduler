import { useEffect, useState } from 'react';
import { branches } from './server';
import { serverRegionsVersion, setServerRegions } from './regions';

/* 지역을 쓰는 화면(테마 도우미·같이 가요)이 서버가 준 지점 지역을 한 번 받아 두게 한다.
   한 번 받으면 같은 세션에서는 다시 받지 않고, 못 받으면 다음에 다시 시도한다 — 그동안은 이름 추측(regions.ts)으로 그린다.
   돌려주는 번호가 바뀌면 지역을 다시 계산하면 된다. */
let loading: Promise<void> | null = null;

export function useServerRegions(): number {
  const [ver, setVer] = useState(serverRegionsVersion);
  useEffect(() => {
    if (!loading) loading = branches().then(setServerRegions, () => { loading = null; });
    let live = true;
    void loading.then(() => { if (live) setVer(serverRegionsVersion()); });
    return () => { live = false; };
  }, []);
  return ver;
}

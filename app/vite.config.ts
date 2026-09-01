import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages 프로젝트 페이지는 도메인 루트가 아니라 /RoomEscapeScheduler/
  // 서브패스에서 서빙된다. dev 서버는 그대로 루트에서 돌아야 하니 build 때만 적용.
  base: command === 'build' ? '/RoomEscapeScheduler/' : '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    // F-15 서버(floduler.duckdns.org)의 CORS 허용 출처는 실제 배포 주소
    // (choieuihyun.github.io)뿐이라 로컬 개발 서버(localhost:*)에서 직접 fetch하면
    // 막힌다. dev에서만 /api를 이 프록시로 우회하고, 프로덕션 빌드는 원래대로
    // 배포 주소를 직접 부른다 (app/src/server.ts의 base() 참고).
    //
    // changeOrigin은 Host 헤더만 바꾼다 — Origin은 그대로 브라우저 값(localhost:*)이
    // 나가서, 인증이 필요한 엔드포인트(/api/watches, /api/devices)는 서버가 Origin을
    // 직접 검사해 여전히 403(Invalid CORS request)으로 막는다는 걸 F-16 개발 중
    // 실측으로 발견했다 — F-15의 GET 전용 엔드포인트(branches/schedule)는 이 검사가
    // 없어서 지금까지 안 드러났을 뿐이다. headers로 Origin 자체를 배포 주소로
    // 덮어써야 인증 엔드포인트까지 로컬에서 뚫린다.
    proxy: {
      '/api': {
        target: 'https://floduler.duckdns.org',
        changeOrigin: true,
        headers: { Origin: 'https://choieuihyun.github.io' },
      },
    },
  },
  build: {
    rollupOptions: {
      // onnxruntime-web ships its own multi-MB .wasm next to its JS and loads it via
      // `new URL(..., import.meta.url)`. If Rollup bundles the package normally, it
      // statically follows that reference and emits a second, separately-hashed copy
      // of the same file into dist/assets — on top of the public/vendor/ copy we
      // already serve (and which env.wasm.wasmPaths always points to at runtime).
      // Marking the package external stops Rollup from touching it at all; the bare
      // specifier is left in the output and resolved at runtime by the importmap in
      // index.html, exactly like today's classic-script + importmap setup.
      external: ['onnxruntime-web'],
    },
  },
}))

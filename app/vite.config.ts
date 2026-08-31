import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    // F-15 서버(floduler.duckdns.org)의 CORS 허용 출처는 실제 배포 주소
    // (choieuihyun.github.io)뿐이라 로컬 개발 서버(localhost:*)에서 직접 fetch하면
    // 막힌다. dev에서만 /api를 이 프록시로 우회하고, 프로덕션 빌드는 원래대로
    // 배포 주소를 직접 부른다 (app/src/server.ts의 base() 참고).
    proxy: {
      '/api': {
        target: 'https://floduler.duckdns.org',
        changeOrigin: true,
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
})

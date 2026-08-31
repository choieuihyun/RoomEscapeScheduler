import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
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

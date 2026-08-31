// Spike: verify PaddleOCR works as real npm deps under Vite (dev + prod build).
// Ported 1:1 from index.html's getPaddleService/preparePaddleCanvas/ocr — only the
// import specifiers changed (bare npm imports instead of importmap-mapped ones) and
// model URLs point at /vendor/... served from Vite's public/ passthrough.

let paddleService: any = null;
let paddleLoading: Promise<any> | null = null;

async function getPaddleService(onStep?: (s: string) => void) {
  if (paddleService) return paddleService;
  if (!paddleLoading) paddleLoading = (async () => {
    onStep?.('엔진 준비 중');
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = new URL('vendor/onnxruntime-web/', location.href).href;
    ort.env.wasm.numThreads = 1;
    const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
    onStep?.('모델 불러오는 중');
    const base = new URL('vendor/paddle-models/', location.href).href;
    const svc = new PaddleOcrService({
      model: {
        detection: base + 'PP-OCRv6_tiny_det.ort',
        recognition: base + 'PP-OCRv6_tiny_rec.ort',
        charactersDictionary: base + 'ppocrv6_tiny_dict.txt',
      },
      session: { executionProviders: ['wasm'] },
    });
    await svc.initialize();
    paddleService = svc;
    return svc;
  })().catch((err) => { paddleLoading = null; throw err; });
  return paddleLoading;
}

function prepareCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const OCR_TARGET_W = 1200, OCR_MAX_PIXELS = 3.2e6;
      let scale = img.width < 900 ? Math.min(3, OCR_TARGET_W / img.width) : 1;
      const px = img.width * img.height * scale * scale;
      if (px > OCR_MAX_PIXELS) scale *= Math.sqrt(OCR_MAX_PIXELS / px);
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      res(cv);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이미지를 열지 못했습니다')); };
    img.src = url;
  });
}

async function runOcrSpike(imageUrl: string): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const resp = await fetch(imageUrl);
  const blob = await resp.blob();
  const file = new File([blob], 'fixture.png', { type: blob.type });
  const svc = await getPaddleService((s) => console.log('[spike]', s));
  const prepared = await prepareCanvas(file);
  const result = await svc.recognize(prepared);
  return { text: result.text, ms: Math.round(performance.now() - t0) };
}

(window as any).runOcrSpike = runOcrSpike;

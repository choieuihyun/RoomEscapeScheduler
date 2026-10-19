import { parseSessions, type Session } from './core';

/* index.html의 PaddleOCR 경로(§6.3, §4.25) 이식 — 로직은 그대로, th를 직접 건드리던
   부분만 떼어내 세션 배열을 돌려주는 순수 비동기 함수로 바꿨다. 카드 상태 병합·busy
   표시는 호출부(useScheduler의 attachImages)에서 한다. */
const OCR_MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const OCR_TARGET_W = 1200;
const OCR_MAX_PIXELS = 3.2e6;
const OCR_TIMEOUT_MS = OCR_MOBILE ? 210000 : 120000;

let paddleService: any = null;
let paddleLoading: Promise<any> | null = null;

async function getPaddleService(onStep?: (s: string) => void) {
  if (paddleService) return paddleService;
  if (!paddleLoading) paddleLoading = (async () => {
    onStep?.('사진 읽을 준비 중');
    const ort = await import('onnxruntime-web');
    /* wasmPaths 를 먼저 정해 둬야 한다 — 안 그러면 ppu-paddle-ocr 가 이 값을 비어 있다고
       보고 jsDelivr CDN 주소로 채워 버린다(오프라인 원칙이 깨진다). */
    ort.env.wasm.wasmPaths = new URL('vendor/onnxruntime-web/', location.href).href;
    ort.env.wasm.numThreads = 1;
    const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
    onStep?.('사진 읽을 준비 중');
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

function resetPaddleService() {
  try { paddleService?.destroy(); } catch { /* 파괴 실패는 무시 — 새로 만들면 그만이다 */ }
  paddleService = null;
  paddleLoading = null;
}

interface PreparedCanvas extends HTMLCanvasElement { _dim?: string }

/* 검출기가 학습된 눈으로 글자를 찾으므로, tesseract 때처럼 이진화한 화면을 넘기면
   오히려 손해다(자연 이미지로 학습됐다) — 색은 그대로 두고 크기만 맞춘다. */
function preparePaddleCanvas(file: File): Promise<PreparedCanvas> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let scale = img.width < 900 ? Math.min(3, OCR_TARGET_W / img.width) : 1;
      const px = img.width * img.height * scale * scale;
      if (px > OCR_MAX_PIXELS) scale *= Math.sqrt(OCR_MAX_PIXELS / px);
      const cv: PreparedCanvas = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      cv._dim = img.width + '×' + img.height + '→' + cv.width + '×' + cv.height;
      res(cv);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const heic = /heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
      rej(new Error(heic
        ? 'HEIC 사진은 못 읽어요 — 캡처(스크린샷)를 넣거나 JPG로 바꿔 주세요'
        : '사진을 열지 못했어요 (' + (file.type || '형식 불명') + ')'));
    };
    img.src = url;
  });
}

export class OcrError extends Error {
  dim: string;
  constructor(message: string, dim: string) {
    super(message);
    this.dim = dim;
  }
}

/* 시간 초과 판별에 쓰므로 문구를 바꿀 땐 이 상수 하나만 고친다(§4.53) */
const TIMEOUT_MSG = '너무 오래 걸려요 — 사진을 잘라서 다시 넣어 보세요';

export async function recognizeSessions(file: File, onStep: (s: string) => void): Promise<Session[]> {
  onStep('사진 읽을 준비 중…');
  let dim = '';
  try {
    const svc = await getPaddleService(s => onStep(s + '…'));
    onStep('사진 정리하는 중…');
    const prepared = await preparePaddleCanvas(file);
    dim = prepared._dim || '';
    onStep('글자 읽는 중…');
    const result = await Promise.race([
      svc.recognize(prepared),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(TIMEOUT_MSG)), OCR_TIMEOUT_MS)),
    ]);
    const sessions = parseSessions(result.text);
    if (!sessions.length) throw new Error('사진에서 시간을 못 찾았어요');
    return sessions;
  } catch (err) {
    const message = (err as Error).message;
    /* 멈춰서 시간 초과된 세션을 그대로 두면 다음 시도도 똑같이 막힌다 — 버리고 새로 만들게 한다.
       (단순 인식 실패는 엔진 잘못이 아니므로 그대로 재사용한다) */
    if (message === TIMEOUT_MSG || /엔진/.test(message)) resetPaddleService();
    throw new OcrError(message, dim);
  }
}

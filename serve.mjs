/**
 * Floduler 개발 서버 — 의존성 0개.
 *
 *   node serve.mjs            →  http://localhost:5173
 *   PORT=8080 node serve.mjs
 *
 * 기본으로 127.0.0.1(루프백)에만 묶는다. 이 컴퓨터 안에서만 열리고,
 * 같은 공유기·같은 와이파이에 붙은 다른 기기에서는 접속되지 않는다.
 * 호스트를 지정하지 않으면 Node 는 0.0.0.0(모든 인터페이스)에 열어
 * 같은 망의 아무나 http://<내IP>:5173 으로 들어올 수 있게 되므로, 기본값을 바꾸지 말 것.
 *
 * 폰에서 열어보는 등 같은 망에 일부러 노출하고 싶을 때만:
 *   HOST=0.0.0.0 node serve.mjs
 *
 * 하는 일은 정적 파일 서빙 하나뿐이다.
 * 이미지 인식은 브라우저 안에서 돌므로(vendor/) 서버가 할 일이 없다.
 * 예전에 있던 /api/ocr 프록시는 AI 비전 API를 쓰던 시절의 잔재라 걷어냈다.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';   // 루프백 고정 — 위 주석 참조

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz':   'application/octet-stream',   // traineddata.gz 는 tesseract 가 직접 푼다
  '.ort':  'application/octet-stream',   // PaddleOCR 모델(ONNX Runtime 포맷)
  '.txt':  'text/plain; charset=utf-8',  // PaddleOCR 문자 사전
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

async function handleStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';

  // 경로 탈출 차단
  const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    return json(res, 403, { error: 'forbidden' });
  }
  try {
    const buf = await readFile(path);
    /* 앱 파일은 고치는 족족 반영돼야 하므로 캐시 금지.
       vendor/ 의 인식 엔진(약 5MB)은 바뀌지 않으므로 오래 캐시한다 —
       안 그러면 이미지를 넣을 때마다 5MB를 다시 받는다. */
    const isVendor = rel.startsWith('/vendor/');
    res.writeHead(200, {
      'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': isVendor ? 'public, max-age=31536000, immutable' : 'no-store',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

const handler = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'GET만 허용' });
  handleStatic(req, res);
};

/* localhost 는 시스템에 따라 ::1(IPv6) 로도, 127.0.0.1(IPv4) 로도 풀린다.
   한쪽에만 묶으면 반대쪽으로 붙는 클라이언트가 "연결 거부"를 만난다
   (대부분은 자동 폴백하지만 전부는 아니다).
   그래서 기본값일 때는 두 루프백 주소 모두에 묶는다. 여전히 이 컴퓨터 밖으로는 열리지 않는다.
   HOST 를 직접 준 경우에는 그 주소 하나만 사용한다. */
const hosts = process.env.HOST ? [process.env.HOST] : ['127.0.0.1', '::1'];
const bound = [];
let pending = hosts.length;

const report = () => {
  if (--pending > 0) return;
  if (!bound.length) {
    console.error(`포트 ${PORT} 바인딩 실패 — 이미 사용 중인지 확인해 주세요.`);
    process.exit(1);
  }
  const localOnly = bound.every(h => h === '127.0.0.1' || h === '::1' || h === 'localhost');
  console.log(`Floduler →  http://localhost:${PORT}`);
  console.log(localOnly
    ? `접속 범위       →  이 컴퓨터에서만 (${bound.join(', ')})`
    : `접속 범위       →  ⚠ 같은 네트워크의 다른 기기도 접속 가능 (${bound.join(', ')})`);
};

for (const host of hosts) {
  const srv = createServer(handler);
  srv.on('error', err => {
    // IPv6 가 없는 환경에서 ::1 바인딩 실패는 정상 — 나머지 한쪽으로 계속 뜬다.
    if (hosts.length > 1 && (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')) return report();
    console.error(`바인딩 실패 (${host}:${PORT}): ${err.code || err.message}`);
    report();
  });
  srv.listen(PORT, host, () => { bound.push(host); report(); });
}

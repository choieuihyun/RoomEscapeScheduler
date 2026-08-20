/**
 * 방탈출 스케줄러 개발 서버 — 의존성 0개.
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
 * 하는 일 두 가지:
 *   1) 정적 파일 서빙 (index.html)
 *   2) POST /api/ocr → api.anthropic.com/v1/messages 프록시
 *      브라우저는 CORS 때문에 Anthropic API를 직접 부를 수 없고,
 *      부를 수 있다 해도 API 키가 프론트에 노출된다.
 *      키는 여기서만 읽고(ANTHROPIC_API_KEY) 브라우저로는 절대 내려가지 않는다.
 *
 * 키가 없으면 /api/ocr 은 503을 돌려주고, 앱은 "시간 직접 입력"으로 자연히 대체된다.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';   // 루프백 고정 — 위 주석 참조
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_BODY = 12 * 1024 * 1024;          // 스크린샷 base64 여유분

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz':   'application/octet-stream',   // traineddata.gz 는 tesseract 가 직접 푼다
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('요청 본문이 너무 큽니다')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleOcr(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return json(res, 503, { error: 'ANTHROPIC_API_KEY 미설정 — OCR 비활성' });
  }
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, 413, { error: err.message });
  }
  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
      },
      body,
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch (err) {
    json(res, 502, { error: 'upstream 요청 실패: ' + err.message });
  }
}

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
  if (req.url.split('?')[0] === '/api/ocr') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST만 허용' });
    return handleOcr(req, res);
  }
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
  const ocr = process.env.ANTHROPIC_API_KEY ? '켜짐' : '꺼짐 (ANTHROPIC_API_KEY 미설정)';
  const localOnly = bound.every(h => h === '127.0.0.1' || h === '::1' || h === 'localhost');
  console.log(`방탈출 스케줄러 →  http://localhost:${PORT}`);
  console.log(`OCR 프록시      →  ${ocr}`);
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

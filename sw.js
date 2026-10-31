/* 「지금 저 파리를 잡아!」 오프라인 대비 서비스 워커
   - 게임 파일과 MediaPipe 스크립트·손 인식 모델, QR 라이브러리를 기기에 저장해 두고 다음부터는 저장본을 쓴다.
   - 저장하는 것은 위 정적 파일뿐이다. 카메라 영상이나 점수는 여기를 지나가지 않는다.
   - 게임 파일(index.html)을 고친 뒤 배포했는데 예전 화면이 보이면 아래 CACHE 이름의 숫자를 올린다. */
const CACHE = 'fly-game-v1';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
const PRECACHE = [
  './',
  './index.html',
  `${MP}/vision_bundle.mjs`,
  `${MP}/wasm/vision_wasm_internal.js`,
  `${MP}/wasm/vision_wasm_internal.wasm`,
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
];

// 버전이 박힌 외부 파일: 저장본이 있으면 인터넷을 거치지 않음
const isLibrary = (url) =>
  url.href.startsWith(MP + '/') ||
  url.href.startsWith('https://storage.googleapis.com/mediapipe-models/') ||
  url.href.startsWith('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 하나가 실패해도 나머지는 저장(실패한 것은 처음 쓸 때 다시 저장됨)
    await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isLibrary(url)) event.respondWith(cacheFirst(req));
  else if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

// 게임 파일: 새 버전을 먼저 받아 보고, 3초 넘게 걸리거나 인터넷이 없으면 저장본으로
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const cached = await cache.match(req, { ignoreSearch: true });
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
  return Promise.race([network.catch(() => cached), timeout]);
}

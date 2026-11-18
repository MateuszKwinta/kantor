/* Kantor — service worker: start bez internetu.

   • Strona apki: najpierw sieć (po wdrożeniu od razu widać nową wersję). Gdy sieci nie ma,
     serwer zwraca błąd albo odpowiedź się ociąga — idzie ostatnia zapisana kopia.
   • Fonty Google: z pamięci podręcznej; arkusz i pliki fontów odświeżane w tle przy starcie.
   • Kursy walut (open.er-api.com) nie przechodzą przez service workera — ostatni kurs
     apka sama trzyma w localStorage.

   Zasada: w razie jakiegokolwiek kłopotu service worker oddaje zapytanie zwykłej sieci,
   więc apka nigdy nie działa gorzej niż bez niego. */

const SHELL_CACHE = 'kantor-shell-v1';
const FONT_CACHE  = 'kantor-fonts-v1';
const SHELL_URL   = new URL('./', self.location).href;            // …/kantor/
const INDEX_URL   = new URL('./index.html', self.location).href;  // …/kantor/index.html
const FONT_HOSTS  = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_TIMEOUT_MS = 3000;   // tyle czekamy na sieć, zanim pokażemy zapisaną kopię

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await fetchShell(SHELL_URL);
    const cache = await caches.open(SHELL_CACHE);
    if(!(await cache.match(SHELL_URL, {ignoreVary: true}))) throw new Error('Nie udało się zapisać kopii apki');
    await cacheFonts(shell.html).catch(() => {});   // fonty są dodatkiem — nie blokują instalacji
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, FONT_CACHE];
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith('kantor-') && !keep.includes(n))
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // Strona apki
  if(req.mode === 'navigate'){
    const page = url.origin + url.pathname;
    if(page !== SHELL_URL && page !== INDEX_URL) return;
    const network = fetchShell(req.url);
    const fresh = network.then(shell => shell.response);
    fresh.catch(() => {});
    event.waitUntil(network.then(shell => cacheFonts(shell.html)).catch(() => {}));
    event.respondWith(shellResponse(fresh).catch(() => fetch(req)));
    return;
  }

  // Fonty Google
  if(FONT_HOSTS.includes(url.hostname)){
    event.respondWith(fontResponse(req.url).catch(() => fetch(req)));
  }

  // Reszta (m.in. API kursów) idzie do sieci bez zmian
});

/* Pobiera świeżą stronę apki z pominięciem pamięci HTTP i zapisuje jej kopię.
   Odrzuca, gdy nie ma sieci albo serwer zwrócił błąd (np. 503). */
async function fetchShell(url){
  const res = await fetch(url, {cache: 'no-store'});
  if(!res.ok) throw new Error('HTTP ' + res.status);
  if(!(res.headers.get('content-type') || '').includes('text/html')) throw new Error('To nie jest strona HTML');
  const response = await unredirected(res);
  const html = await response.clone().text();
  try{
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(SHELL_URL, response.clone());
  }catch(e){ /* brak miejsca itp. — świeża strona i tak trafi do użytkownika */ }
  return {response, html};
}

/* Odpowiedzi „po przekierowaniu" przeglądarka nie przyjmie jako strony — w razie czego przepakuj. */
async function unredirected(res){
  if(!res.redirected) return res;
  return new Response(await res.blob(), {status: res.status, statusText: res.statusText, headers: res.headers});
}

/* Sieć ma pierwszeństwo, ale tylko przez chwilę; potem (albo przy błędzie) zapisana kopia. */
async function shellResponse(fresh){
  const cache = await caches.open(SHELL_CACHE);
  const saved = await cache.match(SHELL_URL, {ignoreVary: true});
  if(!saved) return fresh;
  let timer;
  const tooSlow = new Promise((resolve, reject) => { timer = setTimeout(reject, NETWORK_TIMEOUT_MS); });
  try{
    return await Promise.race([fresh, tooSlow]);
  }catch(e){
    return saved;
  }finally{
    clearTimeout(timer);
  }
}

/* Zapisuje arkusz fontów wskazany w HTML-u apki razem z plikami fontów. Arkusz idzie na końcu,
   żeby zapisany arkusz zawsze wskazywał na zapisane pliki; nieużywane już wpisy są usuwane. */
async function cacheFonts(html){
  const link = html.match(/https:\/\/fonts\.googleapis\.com\/css[^"'\s>]+/);
  if(!link) return;
  const cssUrl = new URL(link[0].replace(/&amp;/g, '&')).href;
  const cssRes = await fetch(cssUrl);                 // tryb CORS: widać status i treść
  if(!cssRes.ok) throw new Error('HTTP ' + cssRes.status);
  const css = await cssRes.clone().text();
  const fontUrls = Array.from(new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || []));
  const cache = await caches.open(FONT_CACHE);
  await Promise.all(fontUrls.map(async u => {
    if(await cache.match(u, {ignoreVary: true})) return;
    const res = await fetch(u);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    await cache.put(u, res);
  }));
  await cache.put(cssUrl, cssRes);
  const keep = new Set(fontUrls.concat(cssUrl));
  const keys = await cache.keys();
  await Promise.all(keys.filter(k => !keep.has(k.url)).map(k => cache.delete(k)));
}

/* Fonty: najpierw pamięć podręczna, w razie braku sieć (z zapisem udanej odpowiedzi). */
async function fontResponse(url){
  const cache = await caches.open(FONT_CACHE);
  const saved = await cache.match(url, {ignoreVary: true});
  if(saved) return saved;
  const res = await fetch(url);                       // tryb CORS: nie zapiszemy strony błędu
  if(res.ok) await cache.put(url, res.clone());
  return res;
}

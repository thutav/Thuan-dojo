/**
 * Service worker do Ilhabela Imóveis.
 *
 * Estratégia: o casco do aplicativo vem do cache primeiro (abre instantâneo, funciona sem
 * sinal); os dados vêm da rede primeiro, com o cache como rede de segurança — assim uma
 * coleta nova aparece assim que existe, mas a ilha continua navegável fora de área.
 */
const VERSAO = 'ilhabela-v1';
const CASCO = './';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll([CASCO])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.origin !== location.origin) return;

  const ehDados = url.pathname.includes('/data/');

  evento.respondWith(
    ehDados
      ? fetch(requisicao)
          .then((resposta) => {
            const copia = resposta.clone();
            caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
            return resposta;
          })
          .catch(() => caches.match(requisicao).then((r) => r ?? Response.error()))
      : caches.match(requisicao).then(
          (emCache) =>
            emCache ??
            fetch(requisicao).then((resposta) => {
              const copia = resposta.clone();
              caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
              return resposta;
            }),
        ),
  );
});

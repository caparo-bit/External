// =============================================================
// Smart TD - Service Worker
// Cache de la PWA + notificaciones push + acciones de despacho
// =============================================================

const CACHE_NAME = 'smarttd-cache-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// -------------------------------------------------------------
// INSTALACIÓN: precachear el shell de la app
// -------------------------------------------------------------
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_URLS))
      .catch((err) => console.error('[SW] Error en precache:', err))
  );
  self.skipWaiting();
});

// -------------------------------------------------------------
// ACTIVACIÓN: limpiar cachés antiguas y tomar control inmediato
// -------------------------------------------------------------
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// -------------------------------------------------------------
// FETCH: network-first para HTML (para no quedarse con datos
// viejos), cache-first para el resto de recursos estáticos
// -------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  // No cachear llamadas a APIs externas (ntfy, webhook, osrm, nominatim)
  const url = new URL(req.url);
  const externalHosts = ['ntfy.sh', 'trigger.macrodroid.com', 'router.project-osrm.org', 'nominatim.openstreetmap.org'];
  if (externalHosts.some((h) => url.hostname.includes(h))) {
    return; // dejar pasar directo a la red
  }

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});

// -------------------------------------------------------------
// PUSH: si en el futuro conectas Web Push real (no ntfy vía SSE),
// esto muestra la notificación aunque la app esté cerrada.
// -------------------------------------------------------------
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido');
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '📨 NUEVO DESPACHO', body: event.data ? event.data.text() : 'Tienes un nuevo despacho' };
  }

  const title = data.title || '📨 NUEVO DESPACHO';
  const options = {
    body: data.body || 'Tienes un nuevo despacho pendiente',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [500, 200, 500, 200, 500],
    tag: 'despacho-alert',
    renotify: true,
    requireInteraction: true,
    data: data,
    actions: [
      { action: 'aceptar', title: '✅ ACEPTAR' },
      { action: 'rechazar', title: '❌ RECHAZAR' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// -------------------------------------------------------------
// CLICK EN NOTIFICACIÓN / ACCIONES
// -------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Click en notificación, acción:', event.action);
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si hay una ventana abierta, reusarla y mandarle la acción
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'notification-action',
            action: event.action || 'open',
            data: event.notification.data
          });
          return client.focus();
        }
      }
      // Si no hay ninguna ventana abierta, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});

// -------------------------------------------------------------
// SYNC EN SEGUNDO PLANO (best-effort, no garantizado por el SO)
// Útil solo como refresco periódico ligero, no como sustituto
// de una conexión persistente.
// -------------------------------------------------------------
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'smarttd-check') {
    console.log('[SW] Periodic sync disparado');
    // Aquí podrías hacer un fetch corto a un endpoint de "hay novedades"
    // si tu backend lo soporta, y disparar showNotification si aplica.
  }
});

console.log('[SW] Service Worker cargado');

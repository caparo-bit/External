/* =====================================================================
   AÑADIR AL FINAL DE tu sw.js EXISTENTE (no borres nada de lo que ya
   tenga tu Service Worker: caché, install, activate, etc. Esto solo
   agrega los listeners de Web Push).
   ===================================================================== */

// Se dispara cuando llega un push real, AUNQUE la app esté cerrada o
// la pantalla bloqueada. El sistema operativo despierta el Service
// Worker solo para ejecutar esto.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Smart TD', body: event.data ? event.data.text() : '' };
  }

  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [300, 150, 300, 150, 300],
    tag: data.tag || 'smarttd-notif',
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    actions: data.actions || [],
    // Guardamos aquí todo lo necesario para poder actuar (aceptar/
    // rechazar) sin depender de que la página esté abierta.
    data: {
      webhookUrl: data.webhookUrl || '',
      raw: data.raw || '',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Smart TD', options)
  );
});

// Se dispara al pulsar la notificación o uno de sus botones de acción,
// incluso con la app completamente cerrada.
self.addEventListener('notificationclick', (event) => {
  const action = event.action; // 'aceptar' | 'rechazar' | '' (toque simple)
  const webhookUrl = event.notification.data && event.notification.data.webhookUrl;
  event.notification.close();

  if (action === 'aceptar' || action === 'rechazar') {
    const cmd = action === 'aceptar' ? 'despacho_aceptar' : 'despacho_rechazar';
    if (webhookUrl) {
      const cmdUrl = webhookUrl + '?cmd=' + encodeURIComponent(cmd);
      // fetch dentro del Service Worker: funciona sin abrir la app.
      event.waitUntil(fetch(cmdUrl, { method: 'GET', mode: 'no-cors' }));
    }
    return;
  }

  // Toque simple sobre la notificación: abrir/enfocar la app.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existente = clientsArr.find((c) => 'focus' in c);
      if (existente) return existente.focus();
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

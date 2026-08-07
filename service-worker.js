// =============================================================
// WEB PUSH - MANEJO DE MENSAJES PUSH
// =============================================================

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

// Asegurar que notificationclick maneja las acciones y abre la app si es necesario
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Click en notificación, acción:', event.action);
    event.notification.close();

    // Si la acción es "aceptar" o "rechazar", enviamos mensaje a la ventana
    if (event.action === 'aceptar' || event.action === 'rechazar') {
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (const client of clientList) {
                    client.postMessage({
                        type: 'notification-action',
                        action: event.action,
                        data: event.notification.data
                    });
                }
                // Si no hay ventanas, la abrimos
                if (clientList.length === 0 && self.clients.openWindow) {
                    return self.clients.openWindow('./index.html');
                }
                // Si hay ventanas, enfocamos una
                if (clientList.length > 0) {
                    return clientList[0].focus();
                }
            })
        );
    } else {
        // Si no hay acción específica, abrir la app
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                if (clientList.length > 0) {
                    return clientList[0].focus();
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow('./index.html');
                }
            })
        );
    }
});

console.log('[SW] Web Push añadido correctamente');

/* =====================================================================
   AÑADIR dentro de tu <script> existente, por ejemplo justo después
   de la sección "NOTIFICACIONES" (donde está solicitarPermisoNotificaciones).
   No borra ni modifica nada de lo que ya tienes.
   ===================================================================== */

// -------- Configuración del Worker de Web Push --------
// Sustituye por la URL real que te dé Cloudflare al desplegar el Worker.
const PUSH_WORKER_URL = 'https://smarttd-push.TU-SUBDOMINIO.workers.dev';

const STORAGE_KEY_PUSH_SUBSCRIBED = 'smarttd_push_subscribed';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function activarNotificacionesEnSegundoPlano() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[PUSH] Este navegador no soporta Web Push');
    return;
  }

  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      setToast('⚠️ Notificaciones bloqueadas, no llegarán avisos en 2º plano', 'error');
      return;
    }

    const reg = await navigator.serviceWorker.ready;

    // Si ya había una suscripción antigua (de otra clave VAPID), la limpiamos
    const existente = await reg.pushManager.getSubscription();
    if (existente) {
      await existente.unsubscribe();
    }

    const res = await fetch(PUSH_WORKER_URL + '/vapid-public-key');
    const { publicKey } = await res.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch(PUSH_WORKER_URL + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        webhookUrl: WEBHOOK_URL,
      }),
    });

    localStorage.setItem(STORAGE_KEY_PUSH_SUBSCRIBED, '1');
    setToast('🔔 Avisos en segundo plano (pantalla bloqueada) activados', 'success');
    console.log('[PUSH] Suscripción registrada correctamente');
  } catch (e) {
    console.error('[PUSH] Error al activar notificaciones en segundo plano:', e);
    setToast('❌ No se pudo activar el aviso en segundo plano', 'error');
  }
}

// Se activa automáticamente al iniciar si el usuario ya lo había aceptado antes,
// y también puedes llamarla desde un botón, p. ej. en la pantalla de Configuración.
if (localStorage.getItem(STORAGE_KEY_PUSH_SUBSCRIBED) === '1') {
  setTimeout(activarNotificacionesEnSegundoPlano, 1500);
}

/* Opcional: añade este botón en tu #viewConfig junto a los demás, y
   engánchalo así, para poder (re)activarlo manualmente:

   <button class="btn-save" id="configActivarPush">🔒 Activar avisos con pantalla bloqueada</button>

   document.getElementById('configActivarPush')
     .addEventListener('click', activarNotificacionesEnSegundoPlano);
*/

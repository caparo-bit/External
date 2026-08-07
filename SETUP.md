# Smart TD – Avisos con la pantalla bloqueada (Web Push real)

## Qué cambia
- Tu app sigue funcionando exactamente igual en primer plano (SSE de ntfy.sh).
- Además, cuando esté cerrada o el móvil bloqueado, el sistema operativo
  la despierta solo para mostrar la notificación con los botones
  ACEPTAR / RECHAZAR, que funcionan sin abrir la app.

## 1. Generar las claves VAPID
Necesitas Node instalado en tu ordenador (una sola vez):

```bash
npm install -g @pushforge/builder
node -e "require('@pushforge/builder').generateVapidKeys().then(k => console.log(JSON.stringify(k, null, 2)))"
```

Te dará algo como:
```json
{ "publicKey": "...", "privateKey": { ...JWK... } }
```
- `publicKey` → va en `wrangler.toml` (VAPID_PUBLIC_KEY) y en tu `index.html` (PUSH_WORKER_URL/vapid-public-key ya lo sirve, no hace falta copiarlo a mano).
- `privateKey` (el objeto JWK completo, como string JSON) → se sube como *secreto*, nunca al código.

## 2. Crear el Worker en Cloudflare
```bash
npm install -g wrangler
wrangler login

cd smarttd-push
npm init -y
npm install @pushforge/builder

wrangler kv namespace create SUBS
# copia el "id" que te devuelva dentro de wrangler.toml

wrangler secret put VAPID_PRIVATE_KEY
# pega ahí el JWK completo (el objeto privateKey en una sola línea de JSON)

# edita wrangler.toml: NTFY_TOPIC, VAPID_PUBLIC_KEY, VAPID_SUBJECT (tu email)

wrangler deploy
```//
Al terminar te da una URL tipo `https://smarttd-push.tu-usuario.workers.dev`.

## 3. Conectar el Worker con tu app
- En `sw.js`: pega el contenido de `sw-push-additions.js` al final de tu Service Worker actual.
- En `index.html`: pega el contenido de `index-additions.js` dentro de tu `<script>`,
  y cambia `PUSH_WORKER_URL` por la URL real del paso 2.
- (Opcional) añade el botón de "Activar avisos con pantalla bloqueada" en la
  pantalla de Configuración, como se indica al final de `index-additions.js`.

## 4. Cambiar el origen del despacho
Ahora mismo, lo que publica el despacho (tu automatización/MacroDroid, o el
sistema que lo dispara) publica directamente en `https://ntfy.sh/<tu-topic>`.
Tienes que cambiar **ese** destino para que apunte a:

```
POST https://smarttd-push.tu-usuario.workers.dev/publish
```

con el mismo cuerpo (texto/JSON) que hoy le mandas a ntfy. El Worker se
encarga de reenviarlo a ntfy (para que el primer plano siga igual) y de
disparar el push real.

Si no controlas ese origen (por ejemplo si es un sistema de terceros que
solo sabe publicar en ntfy), dime y lo resolvemos de otra forma: el Worker
puede en su lugar **consultar** ntfy.sh periódicamente, o podemos usar
un self-hosted ntfy con Web Push (la Opción A que descartamos antes).

## 5. Probar
1. Abre la app, acepta el permiso de notificaciones cuando lo pida.
2. Bloquea la pantalla del móvil.
3. Dispara un despacho de prueba con:
   ```bash
   curl -X POST https://smarttd-push.tu-usuario.workers.dev/publish \
     --data 'Tiene Despacho de prueba'
   ```
4. Debería sonar/vibrar y aparecer la notificación con ACEPTAR/RECHAZAR
   aunque la pantalla esté bloqueada.

## Límites a tener en cuenta
- Android: funciona de forma fiable con Chrome/Edge.
- iOS: solo funciona si la PWA está **añadida a la pantalla de inicio**
  (Safari, iOS 16.4+); en pestaña normal del navegador, Apple no lo permite.
- Si el usuario revoca el permiso de notificaciones o desinstala la PWA,
  hay que volver a pulsar "Activar avisos" para resuscribirse.

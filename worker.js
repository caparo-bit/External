/**
 * Smart TD - Worker de Web Push
 * ---------------------------------------------------
 * Este Worker hace de intermediario entre quien publica el despacho
 * (lo que hoy publica directamente en ntfy.sh) y dos destinos:
 *   1) ntfy.sh  -> para que la pestaña abierta en primer plano siga
 *                  recibiendo el SSE exactamente igual que ahora.
 *   2) el navegador del conductor -> vía Web Push real (RFC8030),
 *                  que SÍ llega con la pantalla bloqueada o la app cerrada.
 *
 * Endpoints:
 *   GET  /vapid-public-key   -> devuelve la clave pública VAPID
 *   POST /subscribe          -> guarda la suscripción push del navegador
 *   POST /publish            -> punto de entrada del despacho (sustituye
 *                                a publicar directamente en ntfy.sh)
 *
 * Requiere:
 *   - KV namespace "SUBS" (guarda la suscripción + webhook del usuario)
 *   - Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   - Var: NTFY_TOPIC (el mismo topic que ya usas, ej. "smarttd-monitor")
 */

import { buildPushHTTPRequest } from "@pushforge/builder";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ---------------------------------------------------------------
    // GET /vapid-public-key
    // ---------------------------------------------------------------
    if (url.pathname === "/vapid-public-key" && request.method === "GET") {
      return json({ publicKey: env.VAPID_PUBLIC_KEY });
    }

    // ---------------------------------------------------------------
    // POST /subscribe  { subscription, webhookUrl }
    // ---------------------------------------------------------------
    if (url.pathname === "/subscribe" && request.method === "POST") {
      try {
        const body = await request.json();
        if (!body.subscription || !body.subscription.endpoint) {
          return json({ error: "subscription inválida" }, 400);
        }
        // Un único conductor -> una única clave. Si algún día quieres
        // varios dispositivos, usa el endpoint como parte de la key.
        await env.SUBS.put(
          "driver",
          JSON.stringify({
            subscription: body.subscription,
            webhookUrl: body.webhookUrl || "",
          })
        );
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }

    // ---------------------------------------------------------------
    // POST /publish  -> aquí es donde debe apuntar quien hoy publica
    // directamente en https://ntfy.sh/<topic>. Reenvía a ntfy y
    // además dispara el push real.
    // ---------------------------------------------------------------
    if (url.pathname === "/publish" && request.method === "POST") {
      const rawText = await request.text();

      // 1) Reenviar a ntfy.sh sin tocar nada (mantiene el SSE en 1er plano)
      ctx.waitUntil(
        fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
          method: "POST",
          body: rawText,
          headers: { "Content-Type": "text/plain" },
        }).catch(() => {})
      );

      // 2) Enviar Web Push real al navegador suscrito
      ctx.waitUntil(enviarPush(env, rawText));

      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
};

async function enviarPush(env, rawText) {
  const stored = await env.SUBS.get("driver", "json");
  if (!stored || !stored.subscription) return;

  // Detectamos si es un despacho para decidir el texto y las acciones
  const esDespacho = rawText.includes("Tiene Despacho");

  const payload = {
    title: esDespacho ? "📨 Nuevo despacho" : "Smart TD",
    body: esDespacho ? "Toca para ver el despacho" : "Actualización de monitor",
    tag: "smarttd-despacho",
    requireInteraction: esDespacho,
    webhookUrl: stored.webhookUrl,
    raw: rawText,
    actions: esDespacho
      ? [
          { action: "aceptar", title: "✅ ACEPTAR" },
          { action: "rechazar", title: "❌ RECHAZAR" },
        ]
      : [],
  };

  try {
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      privateJWK: env.VAPID_PRIVATE_KEY, // JWK string, ver instrucciones
      subscription: stored.subscription,
      message: {
        payload,
        adminContact: env.VAPID_SUBJECT, // ej. "mailto:tucorreo@ejemplo.com"
        options: { ttl: 60, urgency: "high", topic: "smarttd-despacho" },
      },
    });
    const res = await fetch(endpoint, { method: "POST", headers, body });
    if (res.status === 404 || res.status === 410) {
      // La suscripción ya no es válida (el usuario la revocó, etc.)
      await env.SUBS.delete("driver");
    }
  } catch (e) {
    console.error("Error enviando push:", e);
  }
}

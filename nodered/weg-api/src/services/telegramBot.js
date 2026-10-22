'use strict';
// Bot de Telegram: atiende el botón "👀 Visto" de los avisos de alarma (callback_query) del chat configurado y marca la
// alarma como vista. Long polling con getUpdates (sin webhook: la PC de planta no es accesible desde internet).
// Telegram no permite dos getUpdates a la vez (409), así que "Buscar chats del bot" usa los chats que vio este ciclo.

const https = require('https');
const settings = require('./settings');

function api(token, metodo, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.telegram.org/bot${token}/${metodo}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: timeoutMs }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let d = null;
          try { d = JSON.parse(raw); } catch { /* no es JSON */ }
          if (res.statusCode === 200 && d && d.ok) resolve(d.result);
          else reject(new Error(`HTTP ${res.statusCode}`)); // nunca el token
        });
      });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => reject(new Error('sin conexión con Telegram')));
    req.end(JSON.stringify(body || {}));
  });
}

const TIPO = { group: 'grupo', supergroup: 'grupo', private: 'privado', channel: 'canal' };
const chats = new Map(); // id → {id, tipo, nombre}, el más reciente al final
let tokenActivo = '';
let offset = 0;
let activo = false;

function registrarChat(u) {
  const c = (u.message || u.edited_message || u.channel_post || u.my_chat_member || (u.callback_query && u.callback_query.message) || {}).chat;
  if (!c || typeof c.id !== 'number' || !TIPO[c.type]) return;
  const nombre = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || String(c.id);
  chats.delete(c.id);
  chats.set(c.id, { id: c.id, tipo: TIPO[c.type], nombre });
}

const nombreDe = (from = {}) => [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Alguien';

// onVisto(claves, usuario) → [{clave, texto}] marcadas ahora; avisar(texto) manda un mensaje al chat;
// contestar(id, texto) responde el toque (el cartelito que ve quien tocó).
async function atender(chatId, q, { onVisto, avisar, contestar }) {
  const responder = (text) => Promise.resolve(contestar(q.id, text)).catch(() => {});
  const m = /^v:(.+)$/.exec(q.data || '');
  if (!m) return responder('');
  if (!q.message || String(q.message.chat.id) !== String(chatId)) return responder('Este chat no está autorizado');
  const nombre = nombreDe(q.from);
  const cambiadas = await onVisto([m[1]], `${nombre} (Telegram)`);
  await responder(cambiadas.length ? 'Marcada como vista' : 'Ya estaba vista o ya se resolvió');
  for (const c of cambiadas) await avisar(`👀 ${nombre} vio: ${c.texto}`).catch(() => {});
}

async function ciclo(opts) {
  const { token, chatId } = settings.getTelegramFull();
  if (!token || !chatId) { tokenActivo = ''; return new Promise((r) => setTimeout(r, 15000)); }
  if (token !== tokenActivo) { tokenActivo = token; offset = 0; chats.clear(); }
  const ups = await api(token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['callback_query', 'message', 'my_chat_member', 'channel_post'] }, 35000);
  for (const u of ups) {
    offset = u.update_id + 1;
    registrarChat(u);
    if (u.callback_query) await atender(chatId, u.callback_query, { ...opts, contestar: (id, text) => api(token, 'answerCallbackQuery', { callback_query_id: id, text }) }).catch((e) => console.error('[TG-BOT]', e.message));
  }
}

function start(opts) {
  if (activo) return;
  activo = true;
  console.log('[TG-BOT] Escuchando el botón "Visto" de los avisos');
  (async () => {
    while (activo) {
      try { await ciclo(opts); } catch (e) {
        console.error('[TG-BOT]', e.message);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  })();
}

// Chats vistos por el bot con este token (el más reciente primero), o null si el bot no está escuchando con ese token.
// Si todavía no vio ninguno, al menos el chat configurado (getChat).
async function chatsVistos(token) {
  if (!activo || !token || token !== tokenActivo) return null;
  if (!chats.size) {
    const { chatId } = settings.getTelegramFull();
    try { registrarChat({ message: { chat: await api(token, 'getChat', { chat_id: chatId }) } }); } catch { /* sin datos: lista vacía */ }
  }
  return [...chats.values()].reverse();
}

module.exports = { start, chatsVistos, atender, registrarChat, _chats: chats };

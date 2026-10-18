'use strict';

const nodemailer = require('nodemailer');
const https = require('https');
const settings = require('./settings');

// ─── Historial ──────────────────────────────────────────────────────
const alertHistory = [];
const MAX_HISTORY = 200;

function addHistory(entry) {
  alertHistory.unshift({ ts: Date.now(), ...entry });
  if (alertHistory.length > MAX_HISTORY) alertHistory.pop();
}

function getHistory() {
  return alertHistory;
}

// ─── Canales ────────────────────────────────────────────────────────
function getTransport() {
  const c = settings.getSmtpFull();
  if (!c.user || !c.pass) return null;
  return nodemailer.createTransport({ ...settings.smtpTransportOptions(), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
}

const telegramConfigurado = () => { const c = settings.getTelegramFull(); return !!(c.token && c.chatId); };

// Rechaza si Telegram no responde 200.
function sendTelegram(text) {
  const { token, chatId } = settings.getTelegramFull();
  const body = JSON.stringify({ chat_id: chatId, text });
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.telegram.org/bot${token}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 10000 }, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`));
      });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

// Chats que el bot vio (getUpdates, sin offset: no consume nada). Nunca devuelve ni
// loguea el token ni los textos: solo { id, tipo, nombre }, el más reciente primero.
// Rechaza con Error con .status (400 token inválido, 502 el resto).
const TIPO = { group: 'grupo', supergroup: 'grupo', private: 'privado', channel: 'canal' };
function buscarChats(token) {
  const falla = (status, msg) => Object.assign(new Error(msg), { status });
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.telegram.org/bot${token}/getUpdates`,
      { method: 'GET', timeout: 10000 }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let d = null;
          try { d = JSON.parse(raw); } catch { /* no es JSON */ }
          if (d && d.ok === false) {
            const code = d.error_code || res.statusCode;
            return reject(code === 401 || code === 404 ? falla(400, 'El token no es válido') : falla(502, String(d.description || 'Telegram rechazó la consulta')));
          }
          if (!d || !Array.isArray(d.result)) return reject(falla(502, 'No se pudo hablar con Telegram'));
          const vistos = new Map();
          for (const u of [...d.result].reverse()) {
            const c = (u.message || u.edited_message || u.channel_post || u.my_chat_member || {}).chat;
            if (!c || typeof c.id !== 'number' || !TIPO[c.type] || vistos.has(c.id)) continue;
            const nombre = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || String(c.id);
            vistos.set(c.id, { id: c.id, tipo: TIPO[c.type], nombre });
          }
          resolve([...vistos.values()]);
        });
      });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => reject(falla(502, 'No se pudo hablar con Telegram')));
    req.end();
  });
}

// Mail al destinatario configurado; null si no hay transporte o destinatario.
function sendMail(texto) {
  const smtp = settings.getSmtpFull();
  const transport = smtp.to ? getTransport() : null;
  if (!transport) return null;
  return transport.sendMail({
    from: `"Frío SCADA" <${smtp.from || smtp.user}>`,
    to: smtp.to,
    subject: `[Frío SCADA] ${texto.split('\n')[0].slice(0, 120)}`,
    text: texto,
  });
}

// Envía texto por Telegram y email. Devuelve true si al menos un canal configurado
// lo entregó (o si no hay ninguno configurado); false si todos los configurados
// fallaron. Un fallo parcial (p. ej. SMTP caído) cuenta como enviado: así no se
// repite el mensaje en Telegram cada 5 s.
async function notify(texto) {
  console.log(`[ALERT] ${texto}`);
  const canales = [];
  if (telegramConfigurado()) canales.push(['TG', sendTelegram(texto)]);
  const mail = sendMail(texto);
  if (mail) canales.push(['EMAIL', mail]);
  const res = await Promise.allSettled(canales.map((c) => c[1]));
  res.forEach((r, i) => { if (r.status === 'rejected') console.error(`[${canales[i][0]}] Error:`, r.reason && r.reason.message); });
  return canales.length === 0 || res.some((r) => r.status === 'fulfilled');
}

const mailConfigurado = () => { const c = settings.getSmtpFull(); return !!(c.user && c.pass && c.to); };

// Envía por un solo canal ('telegram'|'mail'); rechaza con un mensaje legible en español.
async function notifyCanal(canal, texto) {
  if (canal === 'telegram') {
    if (!telegramConfigurado()) throw new Error('Telegram no está configurado');
    try { await sendTelegram(texto); } catch (e) { console.error('[TG] Error:', e.message); throw new Error('Telegram rechazó el envío o no respondió'); }
  } else if (canal === 'mail') {
    const p = mailConfigurado() ? sendMail(texto) : null;
    if (!p) throw new Error('El mail no está configurado');
    try { await p; } catch (e) { console.error('[EMAIL] Error:', e.message); throw new Error('El servidor de mail rechazó el envío'); }
  } else throw new Error('Canal desconocido');
}

module.exports = { notify, notifyCanal, sendTelegram, buscarChats, telegramConfigurado, mailConfigurado, getHistory, addHistory };

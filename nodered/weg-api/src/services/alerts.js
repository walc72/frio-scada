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

const telegramConfigurado = () => !!(process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID);

// Rechaza si Telegram no responde 200.
function sendTelegram(text) {
  const body = JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text });
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 10000 }, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`));
      });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

// Envía texto por Telegram y email. Devuelve true si al menos un canal configurado
// lo entregó (o si no hay ninguno configurado); false si todos los configurados
// fallaron. Un fallo parcial (p. ej. SMTP caído) cuenta como enviado: así no se
// repite el mensaje en Telegram cada 5 s.
async function notify(texto) {
  console.log(`[ALERT] ${texto}`);
  const smtp = settings.getSmtpFull();
  const transport = smtp.to ? getTransport() : null;
  const canales = [];
  if (telegramConfigurado()) canales.push(['TG', sendTelegram(texto)]);
  if (transport) {
    canales.push(['EMAIL', transport.sendMail({
      from: `"Frío SCADA" <${smtp.from || smtp.user}>`,
      to: smtp.to,
      subject: `[Frío SCADA] ${texto.split('\n')[0].slice(0, 120)}`,
      text: texto,
    })]);
  }
  const res = await Promise.allSettled(canales.map((c) => c[1]));
  res.forEach((r, i) => { if (r.status === 'rejected') console.error(`[${canales[i][0]}] Error:`, r.reason && r.reason.message); });
  return canales.length === 0 || res.some((r) => r.status === 'fulfilled');
}

module.exports = { notify, getHistory, addHistory };

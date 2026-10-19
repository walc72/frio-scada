'use strict';

// Envío del reporte diario en PDF: canales, correo (nodemailer simulado) y Telegram (https simulado).
// Nunca toca la red ni InfluxDB.
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-pdf-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.REPORTS_DIR = DIR;
fs.writeFileSync(process.env.CONFIG_PATH, '{}');
for (const k of ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'SMTP_USER', 'SMTP_PASS', 'DAILY_REPORT_EMAIL', 'ALERT_EMAIL']) delete process.env[k];

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const { EventEmitter } = require('events');
const nodemailer = require('nodemailer');
const settings = require('../src/services/settings');
const alerts = require('../src/services/alerts');
const reporteDiario = require('../src/services/reporteDiario');
const reporteCamaras = require('../src/services/reporteCamaras');
const daily = require('../src/services/dailyReport');

const FAKE = '123456:' + 'A'.repeat(35);
const FECHA = '2026-10-01';
const vacio = async () => '';
const reset = () => { try { fs.unlinkSync(settings.SETTINGS_PATH); } catch { /* no existe */ } };
const conTelegram = () => settings.setTelegram({ token: FAKE, chatId: '-1001234567' });
const conSmtp = () => settings.setSmtp({ user: 'bot@example.com', pass: 'x', to: 'planta@example.com' });
const silencio = async (fn) => { const e = console.error; const l = console.log; console.error = () => {}; console.log = () => {}; try { return await fn(); } finally { console.error = e; console.log = l; } };

// https.request simulado: guarda url y cuerpo, responde status/json
function simularHttps(status, json) {
  const orig = https.request;
  const visto = { llamadas: 0 };
  https.request = (url, opts, cb) => {
    visto.llamadas++; visto.url = String(url); visto.headers = opts.headers;
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = (b) => {
      visto.body = Buffer.isBuffer(b) ? b : Buffer.from(String(b || ''));
      const res = new EventEmitter(); res.statusCode = status; res.resume = () => {};
      cb(res); res.emit('data', JSON.stringify(json)); res.emit('end');
    };
    return req;
  };
  return { visto, restaurar: () => { https.request = orig; } };
}

test('canales: correo sí por defecto; Telegram solo si está configurado; se guardan y validan', () => {
  reset();
  assert.deepEqual(settings.getDailyReport().canales, { correo: true, telegram: false });
  conTelegram();
  assert.deepEqual(settings.getDailyReport().canales, { correo: true, telegram: true });
  const r = settings.setDailyReport({ canales: { correo: false } });
  assert.deepEqual(r.canales, { correo: false, telegram: true });
  assert.equal(r.time, '07:00'); // sin time no toca la hora
  settings.setDailyReport({ time: '06:30', canales: { telegram: false } });
  assert.deepEqual(settings.getDailyReport().canales, { correo: false, telegram: false });
  assert.equal(settings.getDailyReport().time, '06:30');
  for (const bad of [{ canales: { correo: 'si' } }, { canales: null }, { canales: 3 }]) {
    assert.throws(() => settings.setDailyReport(bad), (e) => e.status === 400);
  }
  assert.throws(() => settings.setDailyReport({}), /Hora inválida/);
});

test('Telegram sendDocument: multipart con chat_id, document (nombre) y caption', async () => {
  reset(); conTelegram();
  const h = simularHttps(200, { ok: true });
  try { await alerts.sendTelegramDocument(Buffer.from('%PDF-1.3 prueba'), 'reporte-camaras_2026-10-01.pdf', 'Reporte del 01/10 · 2 alarmas'); } finally { h.restaurar(); }
  const { url, headers, body } = h.visto;
  assert.equal(url, `https://api.telegram.org/bot${FAKE}/sendDocument`);
  const b = headers['Content-Type'].match(/^multipart\/form-data; boundary=(.+)$/)[1];
  assert.equal(headers['Content-Length'], body.length);
  const txt = body.toString('utf8');
  assert.match(txt, new RegExp(`--${b}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n-1001234567\r\n`));
  assert.ok(txt.includes('name="caption"\r\n\r\nReporte del 01/10 · 2 alarmas\r\n'));
  assert.ok(txt.includes('name="document"; filename="reporte-camaras_2026-10-01.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.3 prueba\r\n'));
  assert.ok(txt.endsWith(`--${b}--\r\n`));
});

test('Telegram: un rechazo nunca devuelve el token', async () => {
  reset(); conTelegram();
  const h = simularHttps(401, { ok: false, error_code: 401, description: `Unauthorized for bot${FAKE}` });
  try {
    await assert.rejects(alerts.sendTelegramDocument(Buffer.from('x'), 'a.pdf', 'c'), (e) => /^HTTP 401/.test(e.message) && !e.message.includes(FAKE));
    const r = await silencio(() => daily.buildAndSend(FECHA, { queryCsv: vacio, canales: { correo: false, telegram: true } }));
    assert.match(r.telegram, /^error: HTTP 401/);
    assert.ok(!JSON.stringify(r).includes(FAKE));
  } finally { h.restaurar(); }
});

test('correo: solo el PDF adjunto (sin Excel) y el resumen en el cuerpo', async () => {
  reset(); conSmtp();
  const orig = nodemailer.createTransport;
  let mail; let opciones;
  nodemailer.createTransport = (o) => { opciones = o; return { sendMail: async (m) => { mail = m; } }; };
  try {
    const r = await daily.buildAndSend(FECHA, { queryCsv: vacio, canales: { correo: true, telegram: false } });
    assert.equal(r.correo, 'ok');
    assert.equal(r.telegram, 'apagado');
    assert.equal(r.saved, true);
    assert.equal(path.basename(r.path), 'reporte-camaras_2026-10-01.pdf');
    assert.equal(fs.readFileSync(r.path).subarray(0, 4).toString(), '%PDF');
  } finally { nodemailer.createTransport = orig; }
  assert.equal(opciones.auth.user, 'bot@example.com');
  assert.equal(mail.to, 'planta@example.com');
  assert.equal(mail.subject, '[Frío SCADA] Reporte de cámaras — 01/10/2026');
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].filename, 'reporte-camaras_2026-10-01.pdf');
  assert.equal(mail.attachments[0].contentType, 'application/pdf');
  assert.equal(mail.attachments[0].content.subarray(0, 4).toString(), '%PDF');
  assert.ok(!mail.attachments.some((a) => /xlsx|spreadsheet/.test(`${a.filename} ${a.contentType}`)));
  assert.match(mail.html, /Cámara 4.*Descongelados: 0 de 0 hechos/s);
});

test('canales: Telegram apagado no se llama; un error del correo no frena a Telegram', async () => {
  reset(); conTelegram();
  const enviados = [];
  const sendDocument = async (buf, nombre, caption) => { enviados.push({ nombre, caption, pdf: buf.subarray(0, 4).toString() }); };
  const roto = { sendMail: async () => { throw new Error('SMTP caído'); } };
  conSmtp();

  let r = await silencio(() => daily.buildAndSend(FECHA, { queryCsv: vacio, transport: roto, sendDocument, canales: { correo: true, telegram: false } }));
  assert.deepEqual([r.correo, r.telegram], ['error: SMTP caído', 'apagado']);
  assert.equal(enviados.length, 0);

  settings.setDailyReport({ canales: { correo: true, telegram: true } });
  r = await silencio(() => daily.buildAndSend(FECHA, { queryCsv: vacio, transport: roto, sendDocument }));
  assert.deepEqual([r.correo, r.telegram], ['error: SMTP caído', 'ok']);
  assert.deepEqual(enviados, [{ nombre: 'reporte-camaras_2026-10-01.pdf', pdf: '%PDF',
    caption: 'Reporte del 01/10 · Cámara 4: 0 de 0 descongelados · Cámara 5: 0 de 0 descongelados · 0 alarmas' }]);
});

test('sin configurar: "no configurado" por canal', async () => {
  reset();
  const r = await daily.buildAndSend(FECHA, { queryCsv: vacio, canales: { correo: true, telegram: true } });
  assert.deepEqual([r.correo, r.telegram], ['no configurado', 'no configurado']);
});

test('si Influx falla: correo sin adjunto con el aviso y Telegram con texto', async () => {
  reset(); conTelegram();
  let mail; const textos = [];
  const r = await silencio(() => daily.buildAndSend(FECHA, {
    queryCsv: async () => { throw new Error('boom'); }, canales: { correo: true, telegram: true },
    transport: { sendMail: async (m) => { mail = m; } }, sendText: async (t) => { textos.push(t); },
    sendDocument: async () => { throw new Error('no debe llamarse'); },
  }));
  // sin SMTP configurado el correo no sale aunque haya transporte de prueba: falta destinatario
  assert.equal(r.correo, 'no configurado');
  conSmtp();
  const r2 = await silencio(() => daily.buildAndSend(FECHA, {
    queryCsv: async () => { throw new Error('boom'); }, canales: { correo: true, telegram: true },
    transport: { sendMail: async (m) => { mail = m; } }, sendText: async (t) => { textos.push(t); },
  }));
  assert.equal(r2.historyError, true);
  assert.equal(r2.saved, false);
  assert.deepEqual([r2.correo, r2.telegram], ['ok', 'ok']);
  assert.deepEqual(mail.attachments, []);
  assert.match(mail.html, /No se pudo leer el historial/);
  assert.match(textos[0], /No se pudo generar el reporte de cámaras del 2026-10-01/);
  assert.equal(r.telegram, 'ok');
});

test('runScheduled envía una sola vez por fecha', async () => {
  reset();
  const calls = [];
  const orig = reporteDiario.generarPdf;
  reporteDiario.generarPdf = async (f) => { calls.push(f); return orig(f, { queryCsv: vacio }); };
  try { await silencio(async () => { await daily.runScheduled(); await daily.runScheduled(); }); } finally { reporteDiario.generarPdf = orig; }
  assert.deepEqual(calls, [reporteCamaras.ayer()]);
});

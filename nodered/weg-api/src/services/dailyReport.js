'use strict';
const escHtml = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Reporte diario automático: a la hora configurada genera el PDF de cámaras del día anterior (desde InfluxDB),
// lo guarda en REPORTS_DIR y lo manda por los canales prendidos (Más → Reporte diario): correo (PDF adjunto)
// y/o Telegram (sendDocument). Cada canal falla por su cuenta.
// También se dispara bajo demanda desde POST /api/settings/daily-report/enviar.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const reporteCamaras = require('./reporteCamaras');
const reporteDiario = require('./reporteDiario');
const settings = require('./settings');
const alerts = require('./alerts');
const branding = require('./branding');

const REPORTS_DIR = process.env.REPORTS_DIR || '/app/reports';
const ENABLED = String(process.env.DAILY_REPORT_ENABLED || 'true').toLowerCase() !== 'false';
// La hora de envío se lee de settings (Configuración → Correo) en cada programación.

function getTransport() {
  const c = settings.getSmtpFull();
  if (!c.user || !c.pass) return null;
  return nodemailer.createTransport(settings.smtpTransportOptions());
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); return true; }
  catch (e) { console.error('[DAILY] No se pudo crear REPORTS_DIR:', e.message); return false; }
}

// "Sigue activa": el flag de la alarma sigue prendido en el estado vivo (solo con dato fresco del PLC).
function sigueVivo() {
  const e = require('./config').getEstadoCamaras();
  const fresco = !!e && !!e._conectado && Date.now() - e._ts <= 2 * 60e3;
  return (clave) => fresco && !!e[clave];
}

function htmlCorreo(modelo, fecha) {
  const footer = branding.get().footer;
  const cuerpo = modelo
    ? modelo.camaras.map((c) => `<h3 style="margin:12px 0 4px">${escHtml(c.nombre)}</h3><ul style="color:#555;margin:0">${
      reporteDiario.lineasResumen(c.resumen).map((l) => `<li>${escHtml(l)}</li>`).join('')}${
      (c.distintos || []).map((d) => `<li style="color:#b45309">⚠ ${escHtml(`Equipo ${d.grupo.replace(/^G/, '')}: ${d.motivo}. Conviene revisarlo.`)}</li>`).join('')}</ul>`).join('')
      + `<p style="color:#555">Alarmas en total: ${modelo.totalAlarmas}. El detalle está en el PDF adjunto.</p>`
    : '<p style="color:#555">No se pudo leer el historial: error de consulta al servidor de datos. No hay PDF.</p>';
  return `<div style="font-family:Arial,sans-serif;max-width:620px">
    <h2 style="color:${branding.get().colorInforme};margin-bottom:4px">${escHtml(modelo ? modelo.titulo : `Reporte de cámaras — ${fecha}`)}</h2>
    ${cuerpo}
    <p style="color:#999;font-size:11px">Generado automáticamente${footer ? ` · Powered by ${escHtml(footer)}` : ''}</p>
  </div>`;
}

const falla = (e) => `error: ${(e && e.message) || 'desconocido'}`;

async function porCorreo({ fecha, modelo, pdf, nombre, transport }) {
  const smtp = settings.getSmtpFull();
  const t = smtp.to ? transport || getTransport() : null;
  if (!t) return 'no configurado';
  try {
    await t.sendMail({
      from: `"Frío SCADA" <${smtp.from || smtp.user}>`,
      to: smtp.to,
      subject: `[Frío SCADA] ${modelo ? modelo.titulo : `Reporte de cámaras — ${fecha}`}`,
      html: htmlCorreo(modelo, fecha),
      attachments: pdf ? [{ filename: nombre, content: pdf, contentType: 'application/pdf' }] : [],
    });
    return 'ok';
  } catch (e) {
    console.error('[DAILY] Error al enviar el correo:', e.message);
    return falla(e);
  }
}

async function porTelegram({ fecha, modelo, pdf, nombre, sendDocument, sendText }) {
  if (!alerts.telegramConfigurado()) return 'no configurado';
  try {
    if (pdf) await (sendDocument || alerts.sendTelegramDocument)(pdf, nombre, modelo.caption);
    else await (sendText || alerts.sendTelegram)(`No se pudo generar el reporte de cámaras del ${fecha}: error al leer el historial`);
    return 'ok';
  } catch (e) {
    console.error('[DAILY] Error al enviar por Telegram:', e.message); // sendTelegramDocument ya saca el token
    return falla(e);
  }
}

// Genera el PDF de cámaras del día, lo guarda y lo manda por los canales prendidos (opts.canales pisa el ajuste).
// Si Influx falla, los canales mandan el aviso sin PDF; nunca lanza por eso.
// Devuelve { date, saved, path, correo, telegram } con 'ok' | 'error: …' | 'no configurado' | 'apagado' por canal.
// opts (tests): queryCsv, sigue, transport, sendDocument, sendText.
async function buildAndSend(dateStr, opts = {}) {
  const date = reporteCamaras.validarFecha(dateStr || reporteCamaras.ayer());
  const nombre = `reporte-camaras_${date}.pdf`;
  const result = { date, saved: false, path: null };

  let pdf = null; let modelo = null;
  try {
    ({ pdf, modelo } = await reporteDiario.generarPdf(date, { queryCsv: opts.queryCsv, sigue: opts.sigue || sigueVivo() }));
  } catch (e) {
    console.error('[DAILY] No se pudo leer el historial:', e.message);
    result.historyError = true;
  }

  if (pdf && ensureDir(REPORTS_DIR)) {
    const file = path.join(REPORTS_DIR, nombre);
    try { fs.writeFileSync(file, pdf); result.saved = true; result.path = file; }
    catch (e) { console.error('[DAILY] Error al guardar el PDF:', e.message); }
  }

  const canales = opts.canales || settings.getDailyReport().canales;
  const datos = { ...opts, fecha: date, modelo, pdf, nombre };
  const [correo, telegram] = await Promise.all([
    canales.correo ? porCorreo(datos) : 'apagado',
    canales.telegram ? porTelegram(datos) : 'apagado',
  ]);
  return { ...result, correo, telegram };
}

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  const { hour, minute } = settings.getDailyReport();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

let timer = null;
let nextRunAt = null;   // Date del próximo envío programado (null si deshabilitado)

let lastSentDate = null;   // fecha ya procesada por el programador (una vez por proceso)

async function runScheduled() {
  const fecha = reporteCamaras.ayer();
  if (fecha === lastSentDate) { console.log(`[DAILY] Reporte ${fecha} ya enviado, se omite`); return; }
  lastSentDate = fecha;
  try {
    const r = await buildAndSend(fecha);
    console.log(`[DAILY] Reporte ${r.date} — guardado:${r.saved} correo:${r.correo} telegram:${r.telegram}`);
  } catch (e) {
    console.error('[DAILY] Falló la generación programada:', e.message);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun();
  nextRunAt = new Date(Date.now() + delay);
  timer = setTimeout(async () => {
    await runScheduled();
    scheduleNext();
  }, delay);
  if (timer.unref) timer.unref();
  const h = (delay / 3600000).toFixed(1);
  console.log(`[DAILY] Próximo reporte automático en ~${h}h (hora ${settings.getDailyReport().time}, TZ del contenedor)`);
}

const sameLocalDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Reprograma tras cambiar la hora. Si el envío de hoy todavía no había salido
// (estaba programado para más tarde hoy) y la hora nueva ya pasó, sale ahora:
// si no, el reporte de ayer quedaría sin enviar.
function reschedule() {
  if (!ENABLED || !nextRunAt) return null; // sin start() (réplica): no programa nada
  const pendingToday = nextRunAt && sameLocalDay(nextRunAt, new Date());
  if (timer) clearTimeout(timer);
  const delay = msUntilNextRun();
  const newRunIsTomorrow = !sameLocalDay(new Date(Date.now() + delay), new Date());
  if (pendingToday && newRunIsTomorrow) {
    console.log('[DAILY] La hora nueva ya pasó y el reporte de hoy no había salido: se envía ahora');
    runScheduled();
  }
  scheduleNext();
  return nextRunAt;
}

function start() {
  if (!ENABLED) { console.log('[DAILY] Reporte diario automático deshabilitado (DAILY_REPORT_ENABLED=false)'); return; }
  ensureDir(REPORTS_DIR);
  scheduleNext();
}

const getNextRunAt = () => (ENABLED ? nextRunAt : null);

module.exports = { sigueVivo, runScheduled, start, reschedule, getNextRunAt, buildAndSend, REPORTS_DIR, ENABLED };

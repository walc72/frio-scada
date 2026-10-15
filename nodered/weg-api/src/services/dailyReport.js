'use strict';

// Reporte diario automático: a la hora configurada genera el Excel de
// cámaras del día anterior (desde InfluxDB), lo guarda en REPORTS_DIR y —si hay
// SMTP configurado— lo envía por correo. También se dispara bajo demanda
// desde /api/reports/daily/email.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const reporteCamaras = require('./reporteCamaras');
const settings = require('./settings');

const REPORTS_DIR = process.env.REPORTS_DIR || '/app/reports';
const ENABLED = String(process.env.DAILY_REPORT_ENABLED || 'true').toLowerCase() !== 'false';
// La hora de envío se lee de settings (Configuración → Correo) en cada programación.

function recipients(override) {
  if (override) return override;
  return settings.getSmtpFull().to || '';
}

function getTransport() {
  const c = settings.getSmtpFull();
  if (!c.user || !c.pass) return null;
  return nodemailer.createTransport(settings.smtpTransportOptions());
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); return true; }
  catch (e) { console.error('[DAILY] No se pudo crear REPORTS_DIR:', e.message); return false; }
}

// Genera el Excel de cámaras del día, lo guarda en disco y opcionalmente lo envía por mail.
// Si Influx falla, el mail sale igual (sin adjunto) con el aviso; nunca lanza por eso.
async function buildAndSend(dateStr, opts = {}) {
  const date = reporteCamaras.validarFecha(dateStr || reporteCamaras.ayer());
  const result = { ok: true, date, saved: false, emailed: false, path: null, to: null };

  let xlsx = null;
  let lineas = [];
  try {
    const r = await reporteCamaras.generarXlsx(date, opts.queryCsv);
    xlsx = r.xlsx;
    lineas = r.hojas[0].rows.map((x) => x[0]);
  } catch (e) {
    console.error('[DAILY] No se pudo leer el historial:', e.message);
    result.historyError = true;
    lineas = ['No se pudo leer el historial: error de consulta al servidor de datos'];
  }

  if (xlsx && ensureDir(REPORTS_DIR)) {
    const file = path.join(REPORTS_DIR, `reporte-camaras_${date}.xlsx`);
    try { fs.writeFileSync(file, xlsx); result.saved = true; result.path = file; }
    catch (e) { console.error('[DAILY] Error al guardar Excel:', e.message); }
  }

  const to = recipients(opts.to);
  const transport = opts.transport || getTransport();
  if (to && transport) {
    try {
      const smtp = settings.getSmtpFull();
      const li = lineas.map((l) => `<li>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('');
      await transport.sendMail({
        from: `"Frío SCADA" <${smtp.from || smtp.user}>`,
        to,
        subject: `[Frío SCADA] Reporte de cámaras — ${date}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px">
          <h2 style="color:#E87722;margin-bottom:4px">Reporte de cámaras — ${date}</h2>
          <ul style="color:#555">${li}</ul>
          <p style="color:#999;font-size:11px">Generado automáticamente · Powered by Tecno Electric S.A.</p>
        </div>`,
        attachments: xlsx ? [{ filename: `reporte-camaras_${date}.xlsx`, content: xlsx,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] : [],
      });
      result.emailed = true; result.to = to;
    } catch (e) {
      console.error('[DAILY] Error al enviar email:', e.message);
      result.emailError = e.message;
    }
  } else if (opts.to) {
    result.emailError = 'SMTP no configurado (SMTP_USER/SMTP_PASS)';
  }

  return result;
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
    console.log(`[DAILY] Reporte ${r.date} — guardado:${r.saved} email:${r.emailed}${r.emailError ? ' (' + r.emailError + ')' : ''}`);
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

module.exports = { runScheduled, start, reschedule, getNextRunAt, buildAndSend, REPORTS_DIR, ENABLED };

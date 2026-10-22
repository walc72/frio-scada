'use strict';
const escHtml = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const router = require('express').Router();
const nodemailer = require('nodemailer');
const settings = require('../services/settings');
const { requireAdmin, extractToken, revokeUserSessions, renameSession } = require('../middleware/auth');

// Todo /api/settings es solo-admin (usuarios y SMTP son sensibles)
router.use(requireAdmin);

// ─── Usuarios ────────────────────────────────────────────────────────
// Las reglas (superadmin protegido, no tocarse el propio rol, etc.) están en
// services/settings.js.
const actorOf = (req) => ({ user: req.auth.user, role: req.auth.role });
const usersResponse = (req) => ({ users: settings.listUsers(), me: req.auth.user });
const fail = (res, e) => res.status(e.status || 400).json({ error: e.message });

// GET: lista de usuarios (sin secretos)
router.get('/users', (req, res) => {
  res.json(usersResponse(req));
});

// POST: alta. body: { user, role: admin|operador, password }
router.post('/users', (req, res) => {
  try {
    settings.createUser(actorOf(req), req.body || {});
    res.json({ ok: true, ...usersResponse(req) });
  } catch (e) { fail(res, e); }
});

// PUT /users/:user — body: { user?, role?, password? } (password vacía = sin cambios)
router.put('/users/:user', (req, res) => {
  try {
    const r = settings.updateUser(actorOf(req), req.params.user, req.body || {});
    const token = extractToken(req);
    const self = r.before.user.toLowerCase() === String(req.auth.user).toLowerCase();
    // Con otro rol, nombre o contraseña, sus sesiones abiertas dejan de valer
    // (la propia sesión de quien edita sigue, con el nombre nuevo).
    if (r.before.role !== r.after.role || r.before.user !== r.after.user || r.passwordChanged) {
      revokeUserSessions(r.before.user, self ? token : null);
    }
    if (self && r.before.user !== r.after.user) { renameSession(token, r.after.user); req.auth.user = r.after.user; }
    res.json({ ok: true, ...usersResponse(req) });
  } catch (e) { fail(res, e); }
});

// DELETE /users/:user
router.delete('/users/:user', (req, res) => {
  try {
    const name = settings.deleteUser(actorOf(req), req.params.user);
    revokeUserSessions(name);
    res.json({ ok: true, ...usersResponse(req) });
  } catch (e) { fail(res, e); }
});

// ─── SMTP ────────────────────────────────────────────────────────────
// GET: config sin la password (hasPassword indica si hay una guardada)
router.get('/smtp', (req, res) => {
  res.json(settings.getSmtpPublic());
});

// POST: guarda config. La password solo se actualiza si viene no vacía.
router.post('/smtp', (req, res) => {
  try {
    settings.setSmtp(req.body || {});
    res.json({ ok: true, smtp: settings.getSmtpPublic() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Telegram ────────────────────────────────────────────────────────
// GET: chat y hasToken (el token nunca se devuelve). POST: token vacío = sin cambios.
router.get('/telegram', (req, res) => {
  res.json(settings.getTelegramPublic());
});

router.post('/telegram', (req, res) => {
  try {
    settings.setTelegram(req.body || {});
    res.json({ ok: true, telegram: settings.getTelegramPublic() });
  } catch (e) { fail(res, e); }
});

// POST { token? }: chats que vio el bot (para elegir el chat ID sin armar la URL a mano).
// Usa el token del body si es válido; si no, el guardado. Solo devuelve id/tipo/nombre.
router.post('/telegram/chats', async (req, res) => {
  const t = req.body && typeof req.body.token === 'string' ? req.body.token.trim() : '';
  const token = t && settings.TG_TOKEN_RE.test(t) ? t : settings.getTelegramFull().token;
  if (!token) return res.status(400).json({ error: 'Primero cargá el token del bot' });
  try {
    // con el bot escuchando ese token no se puede pedir getUpdates (409): se usan los chats que ya vio
    res.json({ chats: (await require('../services/telegramBot').chatsVistos(token)) ?? await require('../services/alerts').buscarChats(token) });
  } catch (e) { fail(res, e); }
});

// ─── Reporte diario: hora de envío y canales ─────────────────────────
// (require diferido: dailyReport arrastra el generador de reportes/PDF)
const dailyReportInfo = () => {
  const daily = require('../services/dailyReport');
  const next = daily.getNextRunAt();
  const tg = settings.getTelegramPublic();
  return { ...settings.getDailyReport(), telegramConfigurado: !!(tg.hasToken && tg.chatId), enabled: daily.ENABLED, nextRunAt: next ? next.toISOString() : null };
};

// ─── Repetición de avisos de alarma ({minutos, veces}) ────────────────
router.get('/repeticion', (req, res) => res.json(settings.getRepeticion()));
router.post('/repeticion', (req, res) => {
  try { res.json({ ok: true, ...settings.setRepeticion(req.body || {}) }); } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

router.get('/daily-report', (req, res) => {
  res.json(dailyReportInfo());
});

// POST: { time?: 'HH:MM', canales?: { correo?, telegram? } } — guarda y reprograma el envío automático
router.post('/daily-report', (req, res) => {
  try {
    settings.setDailyReport(req.body || {});
    require('../services/dailyReport').reschedule();
    res.json({ ok: true, ...dailyReportInfo() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /daily-report/enviar: manda ya el reporte de ayer por los canales prendidos. 1 por minuto (todo el servidor).
// → { ok, date, correo, telegram } con el resultado de cada canal.
const ENVIAR_CADA_MS = 60e3;
let ultimoEnvio = -Infinity;
router.post('/daily-report/enviar', async (req, res) => {
  const t = Date.now();
  if (t - ultimoEnvio < ENVIAR_CADA_MS) return res.status(429).json({ error: 'Esperá un minuto antes de volver a mandarlo' });
  ultimoEnvio = t;
  try {
    const r = await require('../services/dailyReport').buildAndSend();
    res.json({ ok: true, date: r.date, correo: r.correo, telegram: r.telegram, ...(r.historyError && { historyError: true }) });
  } catch (e) {
    console.error('[API] daily-report/enviar:', e.message);
    res.status(500).json({ error: 'No se pudo generar el reporte' });
  }
});

// POST /smtp/test: envía un correo de prueba con la config guardada.
// body opcional: { to } (por defecto usa el destinatario configurado)
router.post('/smtp/test', async (req, res) => {
  try {
    const c = settings.getSmtpFull();
    if (!c.user || !c.pass) return res.status(400).json({ error: 'Falta usuario/contraseña SMTP' });
    const to = (req.body && typeof req.body.to === 'string' && req.body.to.trim()) || c.to;
    if (!to) return res.status(400).json({ error: 'Falta destinatario' });
    const transport = nodemailer.createTransport(settings.smtpTransportOptions());
    await transport.sendMail({
      from: `"Frío SCADA" <${c.from || c.user}>`,
      to,
      subject: '[Frío SCADA] Correo de prueba',
      html: '<div style="font-family:Arial"><h3 style="color:#E87722">Correo de prueba</h3><p>La configuración SMTP funciona correctamente.</p><p style="color:#999;font-size:11px">' + escHtml(require('../services/branding').get().footer) + '</p></div>',
    });
    res.json({ ok: true, to });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { hhmm } = require('../services/alertasCamaras');

// POST /api/avisos/prueba {canal:'telegram'|'mail'} — solo admin, 1 por minuto por canal.
// GET /api/avisos/activas — alarmas activas con quién las vio. POST /api/avisos/visto {claves:[...]} — cualquier usuario.
function createAvisosRouter({ notifyCanal, isReplica = false, ahora = Date.now, getActivas = () => [], marcarVisto = async () => [] }) {
  const router = express.Router();
  const ultimo = new Map(); // canal -> ms del último intento
  router.post('/prueba', requireAdmin, async (req, res) => {
    if (isReplica) return res.status(409).json({ ok: false, error: 'Los avisos se envían desde la planta' });
    const canal = req.body && req.body.canal;
    if (canal !== 'telegram' && canal !== 'mail') return res.status(400).json({ ok: false, error: 'Canal inválido' });
    const t = ahora();
    if (t - (ultimo.get(canal) ?? -Infinity) < 60000) return res.status(429).json({ ok: false, error: 'Esperá un minuto antes de probar de nuevo' });
    ultimo.set(canal, t);
    try {
      await notifyCanal(canal, `✅ Aviso de prueba de frio-scada (${hhmm(t)})`);
      res.json({ ok: true });
    } catch (e) {
      ultimo.delete(canal); // solo los envíos exitosos cuentan para el límite
      res.json({ ok: false, error: e.message || 'No se pudo enviar el aviso' });
    }
  });
  router.get('/activas', (req, res) => res.json({ activas: getActivas() }));
  router.post('/visto', async (req, res) => {
    if (isReplica) return res.status(409).json({ error: 'Las alarmas se marcan como vistas en la planta' });
    const claves = req.body && req.body.claves;
    if (!Array.isArray(claves) || !claves.length || claves.length > 50 || !claves.every((c) => typeof c === 'string' && /^[\w.]{1,40}$/.test(c))) {
      return res.status(400).json({ error: 'Alarmas inválidas' });
    }
    const usuario = (req.auth && req.auth.user) || 'desconocido';
    try { res.json({ ok: true, vistas: await marcarVisto(claves, usuario) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  return router;
}

module.exports = createAvisosRouter;

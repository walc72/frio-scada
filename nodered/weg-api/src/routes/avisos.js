'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

// POST /api/avisos/prueba {canal:'telegram'|'mail'} — solo admin, 1 por minuto por canal.
function createAvisosRouter({ notifyCanal, ahora = Date.now }) {
  const router = express.Router();
  const ultimo = new Map(); // canal -> ms del último intento
  router.post('/prueba', requireAdmin, async (req, res) => {
    const canal = req.body && req.body.canal;
    if (canal !== 'telegram' && canal !== 'mail') return res.status(400).json({ ok: false, error: 'Canal inválido' });
    const t = ahora();
    if (t - (ultimo.get(canal) ?? -Infinity) < 60000) return res.status(429).json({ ok: false, error: 'Esperá un minuto antes de probar de nuevo' });
    ultimo.set(canal, t);
    const hm = new Date(t + Number(process.env.TZ_OFFSET_MIN ?? -180) * 6e4).toISOString().slice(11, 16);
    try {
      await notifyCanal(canal, `✅ Aviso de prueba de frio-scada (${hm})`);
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message || 'No se pudo enviar el aviso' });
    }
  });
  return router;
}

module.exports = createAvisosRouter;

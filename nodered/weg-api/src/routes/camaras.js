'use strict';

const express = require('express');
const s = require('../services/camaras');

// GET /api/camaras/{estado,descongelados,eventos,compresores,comunicacion}?desde&hasta[&camara][&texto]
function createCamarasRouter({ queryCsv, getEstado }) {
  const router = express.Router();
  const ruta = (path, conCamara, handler) => router.get(path, async (req, res) => {
    let p;
    try { p = s.validarParams(req.query, { camara: conCamara }); } catch (e) { return res.status(400).json({ error: e.message }); }
    try { res.json(await handler(p, req.query)); } catch (e) {
      console.error(`[API] camaras${path}: ${e.message}`);
      res.status(502).json({ error: 'Error consultando el histórico' });
    }
  });

  router.get('/estado', (req, res) => res.json(getEstado() || {}));
  ruta('/descongelados', true, async (p) => s.parseDescongelados(await queryCsv(s.fluxDescongelados(p))));
  // Eventos del PLC + maniobras remotas (maniobra:true), mezclados por hora.
  ruta('/eventos', true, async (p, q) => {
    const f = { camara: p.camara, texto: q.texto };
    const [ev, mando] = await Promise.all([queryCsv(s.fluxEventos(p)), queryCsv(s.fluxMando(p))]);
    return [...s.parseEventos(ev, f), ...s.parseMando(mando, f)].sort((a, b) => a.ts - b.ts);
  });
  ruta('/compresores', true, async (p) => s.parseCompresores(await queryCsv(s.fluxCompresores(p)), { ...p, latidos: await queryCsv(s.fluxLatidos(p)) }));
  ruta('/tramos', true, async (p) => s.parseTramos(await queryCsv(s.fluxTramos(p)), { ...p, latidos: await queryCsv(s.fluxLatidos(p)) }));
  ruta('/comunicacion', false, async (p) => s.parseComunicacion(await queryCsv(s.fluxComunicacion(p))));
  return router;
}

module.exports = createCamarasRouter;

'use strict';

const express = require('express');
const m = require('../services/mando');

const MIN_ENTRE_PEDIDOS_MS = 2000;
// Hasta 15 s: un pedido puede esperar en la cola de uno-por-vez del poller (cada uno tarda hasta ~3 s en el PLC).
const TIMEOUT_POLLER_MS = 15000;

// POST /api/mando {comando, camara:'C4'|'C5', grupo?:1..8, horario?:1..4, valor} → {resultado, motivo, texto}
// Roles: superadmin y admin mandan todo; operar solo los comandos marcados 'operar'; operador (solo mira) ninguno.
function createMandoRouter({ pollerUrl, token, getEstado, userId, escribir, isReplica = false, ahora = Date.now, timeoutMs = TIMEOUT_POLLER_MS }) {
  const router = express.Router();
  const ultimo = new Map(); // usuario -> ms de su último pedido que llegó al poller

  router.post('/', async (req, res) => {
   try {
    const { role, user } = req.auth || {};
    const b = req.body || {};
    const esAdmin = role === 'admin' || role === 'superadmin';
    if (!esAdmin && role !== 'operar') return res.status(403).json({ error: 'Tu usuario solo puede mirar' });
    if (isReplica) return res.status(409).json({ error: 'Los comandos se mandan desde la planta' });
    if (!token || !pollerUrl) return res.status(503).json({ error: 'mando no configurado' });
    const cmd = m.comando(b.comando);
    if (cmd && !esAdmin && cmd.rol !== 'operar') return res.status(403).json({ error: 'Requiere rol administrador' });
    const tope = m.topeResistencia(getEstado());
    const err = m.errorPedido(b, tope);
    if (err) return res.status(400).json({ error: err });

    const t = ahora();
    if (t - (ultimo.get(user) ?? -Infinity) < MIN_ENTRE_PEDIDOS_MS) return res.status(429).json({ error: 'Esperá un momento antes de mandar otro pedido' });
    const usuarioId = userId(user);   // antes de mandar: si falla no se manda nada
    ultimo.set(user, t);

    const destino = m.armarDestino(b.comando, b.camara, b.grupo, b.horario);
    const camara = cmd.destino.includes('c') ? b.camara : null;
    const grupo = cmd.destino.includes('g') ? b.grupo : null;
    const horario = cmd.destino.includes('h') ? b.horario : null;
    const anterior = m.valorAnterior(b.comando, camara, grupo, horario, m.estadoVivo(getEstado(), t));

    let r;
    try {
      const resp = await fetch(`${pollerUrl}/mando`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mando-Token': token },
        body: JSON.stringify({ comando: b.comando, destino, argumento: b.valor, usuario: usuarioId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) console.error(`[API] mando: el poller contestó ${resp.status}`);
      const j = resp.ok ? await resp.json() : null;
      // 401/400 del poller o cuerpo raro: no se sabe qué pasó → desconocido
      r = j && Number.isInteger(j.resultado) ? { resultado: j.resultado, motivo: j.motivo } : { resultado: 0, motivo: 'error-poller' };
    } catch (e) {
      console.error(`[API] mando: ${e.name}: ${e.message}`);
      r = { resultado: 0, motivo: 'sin-respuesta' };   // timeout o red: el PLC puede haberlo hecho
    }
    const respuesta = m.textoResultado(r.resultado, r.motivo, tope);
    const antes = anterior === null ? 'sin dato' : (cmd.fmt ? cmd.fmt(anterior) : anterior);
    res.json({ resultado: r.resultado, motivo: r.motivo, texto: respuesta });
    try {
      await escribir(m.lineaMando({ usuario: user, camara, comando: b.comando, destino, anterior, valor: b.valor, resultado: r.resultado, motivo: r.motivo,
        texto: `${m.textoAccion(b.comando, camara, grupo, horario, b.valor)} (antes: ${antes})`, respuesta, ts: t }));
    } catch (e) { console.error(`[API] mando: auditoría no escrita: ${e.message}`); }
   } catch (e) {
    console.error(`[API] mando: ${e.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
   }
  });
  return router;
}

module.exports = createMandoRouter;

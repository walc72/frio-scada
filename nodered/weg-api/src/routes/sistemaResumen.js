'use strict';

const fs = require('fs');
const express = require('express');
const s = require('../services/camaras');
const influxRaw = require('../services/influxRaw');
const { eachRow } = require('../services/lineProtocol');

const DIA_MS = 864e5;

// Cortes de comunicación: episodios conectado=false -> true (el abierto corre hasta ahora). Entrada ya deduplicada (parseComunicacion).
function cortes(filas, ahora) {
  let cantidad = 0; let ms = 0; let ini = null;
  for (const f of filas) {
    if (f.conectado === false && ini === null) { ini = f.ts; cantidad++; }
    else if (f.conectado === true && ini !== null) { ms += f.ts - ini; ini = null; }
  }
  if (ini !== null) ms += ahora - ini;
  return { cantidad, minutos: Math.round(ms / 6e4) };
}

// Última copia: modificación del backup más nuevo en dir; null si no se ve la carpeta o no hay copias.
function ultimaCopia(dir) {
  try {
    const t = fs.readdirSync(dir).filter((f) => /^frio-backup-.*\.tar\.gz$/.test(f)).map((f) => fs.statSync(`${dir}/${f}`).mtimeMs);
    return t.length ? new Date(Math.max(...t)).toISOString() : null;
  } catch { return null; }
}

// GET /api/sistema/resumen. Todo dato desconocido va null.
function createSistemaResumenRouter({ queryCsv, getEstado, telegramConfigurado, mailConfigurado, desvioRelojS, backupDir = process.env.BACKUP_DIR || '/app/backups', ahora = Date.now }) {
  const router = express.Router();
  const seguro = async (f) => { try { return await f(); } catch (e) { console.error(`[API] sistema/resumen: ${e.message}`); return null; } };
  router.get('/resumen', async (req, res) => {
    const t = ahora();
    const est = getEstado() || null;
    const ultimaEscritura = await seguro(async () => {
      const csv = await queryCsv(`from(bucket: ${JSON.stringify(influxRaw.bucket())})\n  |> range(start: -30d)\n  |> filter(fn: (r) => r._measurement == "foto")\n  |> group()\n  |> last()`);
      let ts = null; eachRow(csv, (r) => { ts = r._time; });
      return ts;
    });
    const com = await seguro(async () => cortes(s.parseComunicacion(await queryCsv(
      s.fluxComunicacion({ desde: new Date(t - 7 * DIA_MS).toISOString(), hasta: new Date(t).toISOString() }))), t));
    const dv = est ? desvioRelojS(est) : null;
    res.json({
      plc: {
        conectado: est && typeof est._conectado === 'boolean' ? est._conectado : null,
        mapaVersion: est?._version ?? est?.version_mapa ?? null,
        programa: est?.version_programa ?? null,
        desvioRelojS: dv === null || dv === undefined || !isFinite(dv) ? null : Math.round(dv),
      },
      historial: { ultimaEscritura },
      telegram: { configurado: !!telegramConfigurado() },
      mail: { configurado: !!mailConfigurado() },
      copia: { ultima: ultimaCopia(backupDir) },
      cortes7d: com || { cantidad: null, minutos: null },
    });
  });
  return router;
}

module.exports = createSistemaResumenRouter;

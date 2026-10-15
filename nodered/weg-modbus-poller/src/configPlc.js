'use strict';
// Conexión con el PLC desde config.json (plc.{ip,port,unitId}) y recarga sin reiniciar el contenedor.
const fs = require('fs');

const plcDe = (cfg) => ({ port: 502, unitId: 255, ...((cfg && cfg.plc) || {}) });

// Aplica la config nueva sobre `plc` (el mismo objeto: el ciclo y el planificador lo leen en cada vuelta).
// Si cambió ip/port/unitId cierra las conexiones viejas. Devuelve true si cambió.
function aplicarPlc(plc, cfg, closeAll) {
  const n = plcDe(cfg);
  if (['ip', 'port', 'unitId'].every((k) => plc[k] === n[k])) return false;
  for (const k of Object.keys(plc)) delete plc[k];
  Object.assign(plc, n);
  closeAll();
  return true;
}

// Mira la fecha del archivo cada intervaloMs (stat: anda también en bind mounts de Docker Desktop,
// donde fs.watch no ve los cambios). Una config ilegible se ignora y queda la anterior.
function vigilarConfig(ruta, plc, closeAll, { intervaloMs = 5000, log = console } = {}) {
  fs.watchFile(ruta, { interval: intervaloMs }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs) return;
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch (e) { log.error(`[CONFIG] ${e.message}`); return; }
    if (aplicarPlc(plc, cfg, closeAll)) log.log(`[CONFIG] PLC ahora ${plc.ip}:${plc.port} unidad ${plc.unitId}: reconectando`);
  });
  return () => fs.unwatchFile(ruta);
}

module.exports = { plcDe, aplicarPlc, vigilarConfig };

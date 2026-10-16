'use strict';
// Estado de la comunicación con el PLC: conectado tras 3 fallas seguidas = caído.
const FALLAS_PARA_CAIDO = 3;

// now() en ms (PC, UTC).
function createComunicacion(now = Date.now) {
  let conectado = false, desde = null, descartadas = 0, desvioRelojS = null;
  let fallas = 0, primeraFalla = null;

  return {
    // plcLocalS: hora de pared del PLC (hora_plc leída como epoch UTC). El PLC corre en hora local de planta
    // (huso 0), así que se compara con la hora local de planta (TZ_OFFSET_MIN fijo, no la zona del contenedor).
    lecturaOk(plcLocalS) {
      const t = now();
      if (!conectado) { conectado = true; desde = t; }
      fallas = 0; primeraFalla = null;
      if (Number.isFinite(plcLocalS)) desvioRelojS = plcLocalS - (t / 1000 + Number(process.env.TZ_OFFSET_MIN ?? -180) * 60);
    },
    lecturaFallida(tipo) {
      const t = now();
      if (tipo === 'partida') descartadas++;
      if (fallas === 0) primeraFalla = t;
      fallas++;
      if (fallas >= FALLAS_PARA_CAIDO && conectado !== false) { conectado = false; desde = primeraFalla; }
      else if (fallas >= FALLAS_PARA_CAIDO && desde === null) desde = primeraFalla;
    },
    estado: () => ({ conectado, desde, descartadas, desvioRelojS }),
  };
}

module.exports = { createComunicacion, FALLAS_PARA_CAIDO };

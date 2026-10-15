'use strict';
// Estado de la comunicación con el PLC: conectado tras 3 fallas seguidas = caído.
const FALLAS_PARA_CAIDO = 3;

// now() en ms (PC, UTC).
function createComunicacion(now = Date.now) {
  let conectado = false, desde = null, descartadas = 0, desvioRelojS = null;
  let fallas = 0, primeraFalla = null;

  return {
    // plcUtcS: reloj UTC del PLC, segundos desde 1970 (regs 6-7 del mapa). Se compara con el epoch
    // de la PC: no depende de la zona horaria de la PC ni del contenedor.
    lecturaOk(plcUtcS) {
      const t = now();
      if (!conectado) { conectado = true; desde = t; }
      fallas = 0; primeraFalla = null;
      if (Number.isFinite(plcUtcS)) desvioRelojS = plcUtcS - t / 1000;
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

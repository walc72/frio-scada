'use strict';
// Diferencias entre dos estados decodificados. Se ignoran campos que cambian
// todo el tiempo (reloj y acumuladores de horas) para no llenar Influx.
const IGNORAR = /^hora_plc$|\.horas_marcha$|\.horas_sin_desc$/;

function diff(prev, next) {
  const r = [];
  for (const campo of Object.keys(next)) {
    if (IGNORAR.test(campo)) continue;
    const antes = prev && campo in prev ? prev[campo] : null;
    if (antes !== next[campo]) r.push({ campo, antes, ahora: next[campo] });
  }
  return r;
}

module.exports = { diff };

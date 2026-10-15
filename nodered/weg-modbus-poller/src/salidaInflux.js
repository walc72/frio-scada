'use strict';
// Line protocol (precisión ns). Sin librería, igual que weg-scada.
const escTag = (s) => String(s).replace(/[,= ]/g, '\\$&');
const escStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const ns = (tsMs, extra = 0) => (BigInt(Math.round(tsMs)) * 1000000n + BigInt(extra)).toString();

// Influx fija el tipo de cada field: todo número va como float (8 -> 8, sin sufijo i), boolean 1/0,
// string siempre string. Así un campo nunca cambia de tipo entre valores enteros y fraccionarios.
function valorLP(v) {
  if (typeof v === 'string') return escStr(v);
  if (typeof v === 'boolean') v = v ? 1 : 0;
  return String(v);
}
const entero = (v) => `${Math.round(v)}i`; // solo contadores propios (estado de evento, comunicacion)

// 'C5.G3.comp' -> {camara:C5, grupo:G3, campo:comp}; 'C5.H1.estado' -> sin grupo; 'eventos_total' -> general
function tagsDe(clave) {
  const p = clave.split('.');
  if (!/^C\d+$/.test(p[0])) return { camara: 'general', campo: clave };
  if (/^G\d+$/.test(p[1] || '')) return { camara: p[0], grupo: p[1], campo: p.slice(2).join('.') };
  return { camara: p[0], campo: p.slice(1).join('.') };
}

function lineasCambios(cambios, tsMs) {
  return cambios.filter(({ ahora }) => typeof ahora !== 'number' || Number.isFinite(ahora)).map(({ campo, ahora }) => {
    const t = tagsDe(campo);
    const tags = `camara=${escTag(t.camara)}${t.grupo ? `,grupo=${escTag(t.grupo)}` : ''},campo=${escTag(t.campo)}`;
    const f = typeof ahora === 'string' ? `texto=${escStr(ahora)}` : `valor=${valorLP(ahora)}`;
    return `estado,${tags} ${f} ${ns(tsMs)}`;
  });
}

function lineaFoto(estado, tsMs) {
  const f = Object.entries(estado).filter(([, v]) => typeof v !== 'number' || Number.isFinite(v)).map(([k, v]) => `${escTag(k)}=${valorLP(v)}`).join(',');
  return `foto ${f} ${ns(tsMs)}`;
}

// Eventos con la misma marca de tiempo pisarían la misma serie: +i ns a cada uno.
function lineasEventos(eventos, tsMs) {
  return eventos.map((e, i) =>
    `eventos texto=${escStr(e.texto)},estado=${entero(e.estado)},hora_plc=${entero(e.hora)} ${ns(tsMs, i)}`);
}

function lineaComunicacion({ conectado, descartadas, desvioRelojS, eventosPerdidos, lineasDescartadas, mapaIncompatible }, tsMs) {
  const f = [`conectado=${conectado ? 'true' : 'false'}`, `descartadas=${entero(descartadas)}`];
  if (desvioRelojS !== null && desvioRelojS !== undefined) f.push(`desvio_reloj_s=${entero(desvioRelojS)}`);
  if (eventosPerdidos) f.push(`eventos_perdidos=${entero(eventosPerdidos)}`);
  if (lineasDescartadas) f.push(`lineas_descartadas=${entero(lineasDescartadas)}`);
  if (mapaIncompatible) f.push('mapa_incompatible=true');
  return `comunicacion ${f.join(',')} ${ns(tsMs)}`;
}

// Una fila por etapa de descongelado (timestamp = inicio). Misma convención que estado: números float, booleanos 1/0, listas como string.
// Interrumpida (corte largo): sin duracion_s ni fin_ms, con interrumpida=1.
function lineaDescongelado(f) {
  const fin = f.interrumpida ? '' : `duracion_s=${valorLP(f.duracionS)},fin_ms=${valorLP(f.fin)},`;
  return `descongelados,camara=${escTag(f.camara)},horario=${f.horario},etapa=${f.etapa} grupos=${escStr(f.grupos.join(','))},cortados=${escStr(f.cortados.join(','))},` +
    `${fin}saltado=${valorLP(!!f.saltado)},no_ejecutada=${valorLP(!!f.noEjecutada)}${f.interrumpida ? ',interrumpida=1' : ''} ${ns(f.inicio)}`;
}

module.exports = { lineasCambios, lineaFoto, lineasEventos, lineaComunicacion, lineaDescongelado, tagsDe };

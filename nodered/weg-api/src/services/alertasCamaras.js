'use strict';
// Alertas de las cámaras (Telegram + email) a partir de frio/estado + frio/latido (config.getEstadoCamaras).
// evaluar() es pura; start() la corre cada 5 s y envía con alerts.notify.

const configService = require('./config');
const alerts = require('./alerts');

const COM_MAX_MS = 2 * 60 * 1000;     // sin dato fresco > 2 min = PLC sin comunicación
const REPETIR_MS = 3600 * 1000;       // repetición mientras siga activa
const DESVIO_MAX_S = 120;
const APAGADO_MS = 60 * 1000;         // una alarma se resuelve tras 60 s continuos apagada (anti-parpadeo)

// Hora de planta (TZ_OFFSET_MIN, como camaras.js), no la zona del contenedor
const hhmm = (ms) => new Date(ms + Number(process.env.TZ_OFFSET_MIN ?? -180) * 6e4).toISOString().slice(11, 16);

// Flags de alarma del mapa v2 (mapa.js decodificar) con su texto. Se omiten los
// agregados (alarma_activa global y por cámara): los cubren los flags específicos.
function definiciones() {
  const d = [
    ['alarma_reloj', 'Alarma de reloj del PLC'],
    ['alarma_indice', 'Alarma de índice de alarmas del PLC'],
  ];
  for (const c of ['C4', 'C5']) {
    d.push([`${c}.alarma_espera`, `${c}: alarma de espera de etapa`],
      [`${c}.alarma_recuperacion`, `${c}: alarma de tiempo de recuperación`],
      [`${c}.alarma_manual`, `${c}: alarma de manual prolongado`]);
    for (let g = 1; g <= 8; g++) {
      d.push([`${c}.G${g}.alarma_res`, `${c} G${g}: alarma de resistencia cortada por tiempo`],
        [`${c}.G${g}.alarma_sin_desc`, `${c} G${g}: demasiadas horas sin descongelar`]);
    }
    for (let h = 1; h <= 4; h++) {
      d.push([`${c}.H${h}.hora_invalida`, `${c} H${h}: hora inválida`],
        [`${c}.H${h}.solapado`, `${c} H${h}: horario solapado`],
        [`${c}.H${h}.tiempo_invalido`, `${c} H${h}: tiempo inválido`]);
    }
  }
  return d;
}
const DEFS = definiciones();

// Desvío (s) del reloj UTC del PLC (hora local - huso = regs 6-7) contra el epoch de la PC; mismo cálculo
// que el poller. Se compara con el _ts del frio/estado que trajo esa hora_plc, no con el del latido.
function desvioRelojS(estado) {
  const ts = estado._tsEstado ?? estado._ts;
  if (!estado.hora_plc || !ts) return null;
  const plcUtc = Date.parse(estado.hora_plc.replace(' ', 'T') + 'Z') / 1000 - (Number(estado.huso_min) || 0) * 60;
  return plcUtc - ts / 1000;
}

// estado: último frio/estado (con _ts/_conectado/_mapa del último latido) o null.
// memoria: {inicio, ultimoOk, activos:{clave:{ultimo,texto}}} o null.
// Devuelve {avisos, items:[{clave,texto}], memoria}; memoria asume todos los avisos enviados.
function evaluar(estado, ahoraMs, memoria) {
  const m = { inicio: ahoraMs, ultimoOk: null, ...memoria, activos: { ...(memoria && memoria.activos) } };
  const items = [];
  const emitir = (clave, texto, actual, base = texto) => {
    const prev = m.activos[clave];
    if (actual) {
      if (prev && prev.apagadoDesde) m.activos[clave] = { ...prev, apagadoDesde: undefined }; // parpadeo: cancela el resuelto
      const cur = m.activos[clave];
      if (!cur || ahoraMs - cur.ultimo >= REPETIR_MS) {
        m.activos[clave] = { ultimo: ahoraMs, texto: base };
        items.push({ clave, texto: `🚨 ${texto}` });
      }
    } else if (prev) {
      if (!prev.apagadoDesde) m.activos[clave] = { ...prev, apagadoDesde: ahoraMs };
      else if (ahoraMs - prev.apagadoDesde >= APAGADO_MS) {
        delete m.activos[clave];
        items.push({ clave, texto: `✅ resuelto: ${prev.texto}` });
      }
    }
  };

  const tieneDato = !!estado && typeof estado._ts === 'number';
  if (tieneDato && estado._conectado) m.ultimoOk = Math.max(m.ultimoOk || 0, estado._ts);
  // Comunicación caída = más de 2 min sin un ciclo bueno (o desde el arranque si nunca hubo uno), diga lo que
  // diga _conectado: un ciclo fallido suelto no avisa.
  const caido = ahoraMs - (m.ultimoOk ?? m.inicio) > COM_MAX_MS;
  const fresco = tieneDato && estado._conectado && ahoraMs - estado._ts <= COM_MAX_MS;

  if (caido) {
    if (tieneDato && estado._mapa === 'incompatible') {
      emitir('mapa', `Mapa del PLC incompatible (version ${estado._version ?? '?'}): cargar la v19`, true, 'Mapa del PLC incompatible');
    } else {
      const desde = m.ultimoOk ? `desde ${hhmm(m.ultimoOk)}` : 'desde el arranque del sistema';
      emitir('com', `PLC sin comunicacion ${desde}`, true, 'PLC sin comunicacion');
    }
  }
  if (!fresco) {
    // Flags congelados: un estado viejo no es evidencia de que algo cambió.
  } else {
    emitir('com', '', false, '');
    emitir('mapa', '', false, '');
    for (const [clave, texto] of DEFS) emitir(clave, texto, !!estado[clave]);
    const dv = desvioRelojS(estado);
    const desviado = dv !== null && Math.abs(dv) > DESVIO_MAX_S;
    emitir('desvio_reloj', `Reloj del PLC desviado ${desviado ? Math.round(Math.abs(dv) / 60) : 0} min`, desviado, 'Reloj del PLC desviado');
  }
  return { avisos: items.map((i) => i.texto), items, memoria: m };
}

let timer = null;
const fallidos = new Set(); // avisos ya registrados como fallidos (no llenar el historial cada 5 s)

async function tick(state) {
  const ahora = Date.now();
  const r = evaluar(configService.getEstadoCamaras(), ahora, state.memoria);
  const textos = new Set(r.items.map((i) => i.texto));
  for (const t of fallidos) if (!textos.has(t)) fallidos.delete(t);
  if (r.items.length) {
    // Un solo mensaje por tick. Si falla, se descartan los cambios de esas claves y se regeneran.
    let ok = false;
    try { ok = await alerts.notify(r.items.map((i) => i.texto).join('\n')); } catch (e) { console.error('[ALERT] notify:', e.message); }
    if (!ok) {
      for (const it of r.items) {
        const prev = state.memoria.activos[it.clave];
        if (prev) r.memoria.activos[it.clave] = prev; else delete r.memoria.activos[it.clave];
      }
    }
    for (const it of r.items) {
      if (ok) { fallidos.delete(it.texto); alerts.addHistory({ texto: it.texto, enviado: true }); }
      else if (!fallidos.has(it.texto)) { fallidos.add(it.texto); alerts.addHistory({ texto: it.texto, enviado: false }); }
    }
  }
  state.memoria = r.memoria;
}

function start() {
  console.log('[ALERT] Alertas de cámaras activas (5s)');
  const state = { memoria: { inicio: Date.now(), ultimoOk: null, activos: {} } };
  let corriendo = false;
  timer = setInterval(async () => {
    if (corriendo) return;
    corriendo = true;
    try { await tick(state); } catch (e) { console.error('[ALERT] Error:', e.message); } finally { corriendo = false; }
  }, 5000);
  return timer;
}

module.exports = { evaluar, start, desvioRelojS };

'use strict';
// Un ciclo de sondeo (solo lectura del PLC). Todo lo externo se inyecta para poder probarlo sin red.
const { diff } = require('./cambios');
const S = require('./salidaInflux');
const { createDetector } = require('./descongelados');

const MAX_PENDIENTES = 20000;
const LOTE = 5000;

function createCiclo({ plc, leerMapa, leerEventos, decodificar, nuevosEventos, escribir, mqtt, com, now = Date.now, fotoIntervalMs = 60000, log = console, onMapa = () => {}, maxPendientes = MAX_PENDIENTES, reintentoMs = 5000, detector = createDetector(), corteLargoMs = 120000, estadoIntervalMs = 30000 }) {
  let prev = null, totalAnterior = null, ultimaFoto = 0, ultimoEstado = {}, perdidosPend = 0;
  let incompat = null; // {error, version, largo?} mientras el mapa no sea compatible
  let primeraFalla = null; // ts del primer ciclo fallido de la racha actual
  let pub = { ts: -Infinity, con: null, mapa: null }; // último frio/estado publicado
  let pendientes = [], lineasDescartadas = 0, descReportadas = 0, vaciando = null, timerReintento = null;
  const noFinitos = new Set(); // campos ya avisados

  // Cola acotada y serializada: las líneas llevan su propio timestamp, así que reintentar es seguro.
  // Si Influx no responde se descartan las MÁS VIEJAS (y se cuentan).
  function acotar() {
    if (pendientes.length > maxPendientes) {
      const n = pendientes.length - maxPendientes;
      pendientes.splice(0, n); lineasDescartadas += n;
      log.error(`[INFLUX] cola llena: se descartaron ${n} líneas (total ${lineasDescartadas})`);
    }
  }
  function encolar(lineas) {
    pendientes.push(...lineas);
    acotar();
    return vaciar();
  }
  function vaciar() {
    if (vaciando) return vaciando;
    vaciando = (async () => {
      while (pendientes.length) {
        // El lote en vuelo sale de la cola: lo que se agregue/recorte mientras tanto no lo afecta.
        const lote = pendientes.splice(0, LOTE);
        try { await escribir(lote.join('\n')); } catch (e) {
          log.error(`[INFLUX] ${e.message}`);
          pendientes.unshift(...lote); acotar();
          if (!timerReintento) { timerReintento = setTimeout(() => { timerReintento = null; vaciar(); }, reintentoMs); if (timerReintento.unref) timerReintento.unref(); }
          break;
        }
      }
    })().finally(() => { vaciando = null; });
    return vaciando;
  }
  // Influx rechaza el lote entero con NaN/Infinity: esos campos no se escriben (se avisa una vez por campo)
  function limpiar(estado) {
    const r = {};
    for (const [k, v] of Object.entries(estado)) {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        if (!noFinitos.has(k)) { noFinitos.add(k); log.error(`[PLC] valor no finito en ${k}: se omite`); }
        continue;
      }
      r[k] = v;
    }
    return r;
  }
  const comLinea = (ts, extra = {}) => S.lineaComunicacion({ ...com.estado(), lineasDescartadas, mapaIncompatible: !!incompat, ...extra }, ts);

  // frio/latido cada ciclo (chico); frio/estado completo y retenido solo si hubo cambios, en la primera
  // lectura, si cambió la conexión o el mapa, o cada estadoIntervalMs (refresca hora_plc y los acumuladores).
  function publicar(estado, ts, cambio) {
    const con = com.estado().conectado;
    const extra = incompat ? { _mapa: 'incompatible', _version: incompat.version } : {};
    const mapa = extra._mapa || null;
    mqtt.latido(ts, con, extra);
    if (cambio || con !== pub.con || mapa !== pub.mapa || ts - pub.ts >= estadoIntervalMs) {
      mqtt.estado(estado, ts, con, extra);
      pub = { ts, con, mapa };
    }
  }

  async function ciclo() {
    const ts = now();
    const r = await leerMapa(plc);
    if (r.error) {
      com.lecturaFallida(r.error);
      if (primeraFalla === null) primeraFalla = ts;
      const incomp = r.error === 'version' || r.error === 'largo';
      const nuevo = incomp ? { error: r.error, version: r.version, ...(r.error === 'largo' && { largo: r.largo }) } : null;
      if ((nuevo && nuevo.error) !== (incompat && incompat.error)) {
        if (nuevo) log.error(`[PLC] mapa incompatible (${r.error} ${r.error === 'largo' ? r.largo : r.version})`);
        incompat = nuevo; onMapa(nuevo);
      }
      const lineas = [];
      // Corte largo o mapa incompatible: lo del medio no se vio. Las etapas abiertas se cierran como
      // interrumpidas y la próxima lectura válida arranca de cero (estado inicial completo y foto).
      if (incomp || ts - primeraFalla > corteLargoMs) {
        prev = null;
        for (const f of detector.interrumpir()) lineas.push(S.lineaDescongelado(f));
      }
      publicar(ultimoEstado, ts, false);
      descReportadas = lineasDescartadas;
      lineas.push(comLinea(ts));
      encolar(lineas);
      return;
    }
    primeraFalla = null;
    if (incompat) { incompat = null; log.error('[PLC] mapa compatible de nuevo'); onMapa(null); }
    const regs = r.regs;
    const estado = limpiar(decodificar(regs));
    const veniaCaido = !com.estado().conectado;
    // Hora de pared del PLC (hora_plc leída como epoch UTC) contra la hora local de planta
    com.lecturaOk(Date.parse(estado.hora_plc.replace(' ', 'T') + 'Z') / 1000);

    // Primer ciclo: prev null -> diff devuelve todo el estado (hace falta el estado inicial tras reiniciar)
    const cambios = diff(prev, estado);
    const lineas = S.lineasCambios(cambios, ts);
    let eventos = [];
    const total = estado.eventos_total;
    if (totalAnterior === null) totalAnterior = total;
    else if (total !== totalAnterior) {
      const ev = await leerEventos(plc);
      if (ev) {
        for (let i = 320; i <= 687; i++) regs[i] = ev[i];
        const n = nuevosEventos(regs, totalAnterior);
        eventos = n.eventos; totalAnterior = n.total;
        if (n.perdidos > 0) { log.error(`[PLC] se perdieron ${n.perdidos} eventos`); perdidosPend = n.perdidos; }
      }
    }
    lineas.push(...S.lineasEventos(eventos, ts));
    for (const e of eventos) mqtt.evento(e, ts);
    for (const f of detector.alimentar(cambios, eventos, ts)) lineas.push(S.lineaDescongelado(f));
    // tras un corte, foto enseguida: los paneles retoman el valor al volver (Grafana marca el hueco)
    if (prev === null || veniaCaido || ts - ultimaFoto >= fotoIntervalMs) { lineas.push(S.lineaFoto(estado, ts)); ultimaFoto = ts; }
    if (perdidosPend || lineas.length || lineasDescartadas !== descReportadas) lineas.push(comLinea(ts, { eventosPerdidos: perdidosPend }));
    descReportadas = lineasDescartadas;
    perdidosPend = 0;
    prev = estado; ultimoEstado = estado;
    publicar(estado, ts, cambios.length > 0);
    encolar(lineas); // sin await: la escritura HTTP no frena el ciclo de 1 s
  }
  ciclo.vaciar = () => (vaciando || Promise.resolve());
  ciclo.pendientes = () => pendientes.length;
  return ciclo;
}

module.exports = { createCiclo };

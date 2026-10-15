'use strict';

// Consultas de cámaras (Flux sobre lo que escribe weg-modbus-poller/src/salidaInflux.js).
const { eachRow } = require('./lineProtocol');
const influxRaw = require('./influxRaw');

const CAMARAS = ['C4', 'C5']; // las que escribe el poller (mapa.js); 'general' no es una cámara consultable
const MAX_DIAS = 400;
const DIA_MS = 864e5;
const HORA_MS = 36e5;
// ponytail: "día" y "hora" en hora de planta fija (Paraguay, UTC-3 todo el año). TZ_OFFSET_MIN si la planta cambia de zona.
const offsetMs = () => Number(process.env.TZ_OFFSET_MIN ?? -180) * 6e4;

function httpError(msg) { return Object.assign(new Error(msg), { status: 400 }); }

// Valida y normaliza: lo que sale de acá es lo único que se interpola en Flux.
function validarParams(q = {}, { camara = true } = {}) {
  const d = new Date(String(q.desde)); const h = new Date(String(q.hasta));
  if (!q.desde || !q.hasta || isNaN(d) || isNaN(h)) throw httpError('desde/hasta inválidos (ISO)');
  if ([d, h].some((x) => x.getUTCFullYear() < 2000 || x.getUTCFullYear() > 2100)) throw httpError('desde/hasta fuera de 2000..2100');
  if (d >= h) throw httpError('desde debe ser anterior a hasta');
  if (h - d > MAX_DIAS * DIA_MS) throw httpError(`Rango máximo ${MAX_DIAS} días`);
  const out = { desde: d.toISOString(), hasta: h.toISOString() };
  if (camara && q.camara) {
    if (!CAMARAS.includes(q.camara)) throw httpError('camara inválida');
    out.camara = q.camara;
  }
  return out;
}

const rango = (desde, hasta) => `range(start: ${desde}, stop: ${hasta})`;
const fuente = (b, r) => `from(bucket: ${JSON.stringify(b || influxRaw.bucket())})\n  |> ${r}`;
const filtroCamara = (camara) => (camara ? `\n  |> filter(fn: (r) => r.camara == "${camara}")` : '');
const pivot = '\n  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n  |> group()';

function fluxDescongelados({ desde, hasta, camara, bucket }) {
  return `${fuente(bucket, rango(desde, hasta))}\n  |> filter(fn: (r) => r._measurement == "descongelados")${filtroCamara(camara)}${pivot}`;
}

// La medición eventos no tiene tag de cámara: el filtro por cámara se hace en JS (el texto empieza con "C5 ...").
function fluxEventos({ desde, hasta, bucket }) {
  return `${fuente(bucket, rango(desde, hasta))}\n  |> filter(fn: (r) => r._measurement == "eventos")${pivot}`;
}

// Cambios de comp/arranques en el rango + último valor conocido antes de desde (estado inicial).
function fluxCompresores({ desde, hasta, camara, bucket }) {
  const base = (r) => `${fuente(bucket, r)}\n  |> filter(fn: (r) => r._measurement == "estado" and r._field == "valor" and (r.campo == "comp" or r.campo == "arranques"))${filtroCamara(camara)}`;
  const previo = new Date(new Date(desde).getTime() - MAX_DIAS * DIA_MS).toISOString();
  return `previo = ${base(rango(previo, desde))}\n  |> last()\nactual = ${base(rango(desde, hasta))}\nunion(tables: [previo, actual])\n  |> group()`;
}

// Latidos del poller: foto (cada ~60 s mientras lee) y comunicacion.conectado (false en cada ciclo fallido), más el último previo a desde.
function fluxLatidos({ desde, hasta, bucket }) {
  const previo = new Date(new Date(desde).getTime() - MAX_DIAS * DIA_MS).toISOString();
  const una = (m, campo, r) => `${fuente(bucket, r)}
  |> filter(fn: (r) => r._measurement == "${m}" and r._field == "${campo}")
  |> group()`;
  const par = (n, m, campo) => `${n}p = ${una(m, campo, rango(previo, desde))}
  |> last()
${n}a = ${una(m, campo, rango(desde, hasta))}
`;
  return `${par('f', 'foto', 'hora_plc')}${par('c', 'comunicacion', 'conectado')}union(tables: [fp, fa, cp, ca])
  |> map(fn: (r) => ({_time: r._time, _measurement: r._measurement, _value: string(v: r._value)}))
  |> group()`;
}

function fluxComunicacion({ desde, hasta, bucket }) {
  return `${fuente(bucket, rango(desde, hasta))}\n  |> filter(fn: (r) => r._measurement == "comunicacion")${pivot}`;
}

const NO_CAMPO = new Set(['', 'result', 'table', '_start', '_stop', '_time', '_measurement']);
const filasPivot = (csv) => { const out = []; eachRow(csv, (o) => out.push(o)); return out; };
const num = (v) => (v === '' || v === undefined ? null : Number(v));
const ms = (t) => Date.parse(t);

function parseDescongelados(csv) {
  return filasPivot(csv).map((o) => ({
    camara: o.camara, horario: o.horario, etapa: Number(o.etapa),
    grupos: o.grupos ?? '', inicio: ms(o._time), fin: num(o.fin_ms), duracionS: num(o.duracion_s),
    cortados: o.cortados ?? '', saltado: o.saltado === '1', noEjecutada: o.no_ejecutada === '1', interrumpida: o.interrumpida === '1',
  })).sort((a, b) => a.inicio - b.inicio);
}

function parseEventos(csv, { camara, texto } = {}) {
  const q = texto ? String(texto).toLowerCase() : '';
  return filasPivot(csv).map((o) => ({ ts: ms(o._time), hora_plc: o.hora_plc, texto: o.texto, estado: num(o.estado) }))
    .filter((e) => (!camara || e.texto.startsWith(camara + ' ')) && (!q || e.texto.toLowerCase().includes(q)))
    .sort((a, b) => a.ts - b.ts);
}

const MAX_COMUNICACION = 1000;
// Solo los cambios de estado (conectado, mapa, contadores; el desvío del reloj varía a cada lectura y no cuenta),
// los MAX_COMUNICACION más recientes. El poller escribe una fila por ciclo fallido: sin esto un corte largo son miles.
function parseComunicacion(csv) {
  let ant = null;
  return filasPivot(csv).map((o) => {
    const r = { ts: ms(o._time) };
    for (const [k, v] of Object.entries(o)) {
      if (!NO_CAMPO.has(k)) r[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && isFinite(v) ? Number(v) : v;
    }
    return r;
  }).sort((a, b) => a.ts - b.ts).filter(({ ts, desvio_reloj_s, ...resto }) => {
    const k = JSON.stringify(resto);
    if (k === ant) return false;
    ant = k; return true;
  }).slice(-MAX_COMUNICACION);
}

const GAP_MS = 15 * 60e3; // sin latido (foto/comunicacion/cambio) más de esto, el estado retenido deja de contar

// Huecos sin datos: poller caído (sin latidos > GAP) o PLC desconectado (comunicacion.conectado=false). [ini, fin] fusionados.
function huecos(latidosCsv, muestras, t0, t1) {
  const hb = [...muestras]; const caidos = [];
  let desc = null; // inicio de la desconexión en curso
  const filas = [];
  if (latidosCsv) eachRow(latidosCsv, (r) => filas.push([ms(r._time), r._measurement, r._value]));
  for (const [t, m, v] of filas.sort((a, b) => a[0] - b[0])) {
    if (m === 'comunicacion' && v === 'false') { if (desc === null) desc = t; continue; }
    if (m === 'comunicacion' && desc !== null) { caidos.push([desc, t]); desc = null; }
    hb.push(t);
  }
  if (desc !== null) caidos.push([desc, t1]);
  hb.sort((a, b) => a - b);
  const g = [...caidos];
  if (!hb.length || hb[0] > t0) g.push([t0, hb.length ? hb[0] : t1]);
  hb.forEach((h, i) => { const sig = i + 1 < hb.length ? hb[i + 1] : t1; if (sig - h > GAP_MS) g.push([h + GAP_MS, sig]); });
  g.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of g) { const u = out[out.length - 1]; if (u && x[0] <= u[1]) u[1] = Math.max(u[1], x[1]); else out.push([...x]); }
  return out;
}

// CSV (cambios de comp y arranques, más el último valor previo a desde) -> [{camara, dia, grupo, horas, horasSinDatos, arranques, maxArranquesHora}]
// comp: un cambio vale hasta el siguiente, pero no cuenta en huecos sin datos (latidos: opts.latidos = CSV de fluxLatidos; sin él, solo las muestras
// de estado sirven de latido y cada intervalo se corta a 15 min de su última muestra). Esos tiempos van a horasSinDatos, no se inventan.
// arranques: suma de aumentos del contador del PLC (si baja, reinicio: cuenta el valor nuevo).
// ponytail: sin valor previo se asume comp=0 al inicio del rango.
function parseCompresores(csv, { desde, hasta, ahora = Date.now(), latidos = '' }) {
  const o = offsetMs();
  const t0 = Date.parse(desde); const t1 = Math.min(Date.parse(hasta), ahora);
  const series = new Map(); // camara|grupo -> {camara, grupo, comp:[[t,v]], arr:[[t,v]]}
  const muestras = new Set();
  eachRow(csv, (r) => {
    if (!r.grupo || !r.camara) return;
    const k = `${r.camara}|${r.grupo}`;
    if (!series.has(k)) series.set(k, { camara: r.camara, grupo: r.grupo, comp: [], arr: [] });
    (r.campo === 'comp' ? series.get(k).comp : series.get(k).arr).push([ms(r._time), Number(r._value)]);
    muestras.add(ms(r._time));
  });
  const gaps = huecos(latidos, muestras, t0, t1);
  const sinDatos = (a, c) => gaps.reduce((n, [x, y]) => n + Math.max(0, Math.min(c, y) - Math.max(a, x)), 0);
  const diaDe = (t) => new Date(t + o).toISOString().slice(0, 10);
  const salida = [];
  for (const s of series.values()) {
    const dias = new Map(); // dia -> {horas, horasSinDatos, arranques, porHora}
    const d = (t) => {
      const k = diaDe(t);
      if (!dias.has(k)) dias.set(k, { horas: 0, sin: 0, arranques: 0, porHora: new Map() });
      return dias.get(k);
    };
    for (let t = t0; t < t1; t += DIA_MS) d(t);
    if (t1 > t0) d(t1 - 1);
    // tiempo con comp=1 de a a b, partido en límites de día local y descontando huecos
    const tramo = (a, b) => {
      while (a < b) {
        const c = Math.min(b, Math.floor((a + o) / DIA_MS) * DIA_MS + DIA_MS - o);
        const sin = sinDatos(a, c); const x = d(a);
        x.horas += (c - a - sin) / HORA_MS; x.sin += sin / HORA_MS;
        a = c;
      }
    };
    let v = null; let t = t0;
    for (const [ts, val] of s.comp.sort((a, b) => a[0] - b[0])) {
      if (ts < t0) { v = val; continue; }
      if (ts >= t1) break;
      if (v === 1) tramo(t, ts);
      if (v === 0 && val === 1) { // v===null (sin previo): el primer 1 no es un arranque observado
        const hk = Math.floor((ts + o) / HORA_MS);
        const ph = d(ts).porHora;
        ph.set(hk, (ph.get(hk) || 0) + 1);
      }
      v = val; t = ts;
    }
    if (v === 1) tramo(t, t1);
    let prev = null;
    for (const [ts, val] of s.arr.sort((a, b) => a[0] - b[0])) {
      if (ts < t0) { prev = val; continue; }
      if (ts >= t1) break;
      if (prev !== null) d(ts).arranques += val >= prev ? val - prev : val;
      prev = val;
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    for (const [dia, x] of dias) {
      salida.push({ camara: s.camara, dia, grupo: s.grupo, horas: r2(x.horas), horasSinDatos: r2(x.sin), arranques: x.arranques, maxArranquesHora: Math.max(0, ...x.porHora.values()) });
    }
  }
  return salida.sort((a, b) => a.dia.localeCompare(b.dia) || a.camara.localeCompare(b.camara) || a.grupo.localeCompare(b.grupo, 'en', { numeric: true }));
}

module.exports = { CAMARAS, offsetMs, validarParams, fluxDescongelados, fluxEventos, fluxCompresores, fluxLatidos, fluxComunicacion, parseDescongelados, parseEventos, parseCompresores, parseComunicacion };

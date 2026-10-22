'use strict';

// Reporte diario de cámaras (C4/C5) en Excel. Reusa las consultas de services/camaras.js.
const cam = require('./camaras');
const reports = require('./reports');
const influxRaw = require('./influxRaw');

const GRUPOS = Array.from({ length: 8 }, (_, i) => `G${i + 1}`);
const DIA_MS = 864e5;

// 'YYYY-MM-DD' real, 2000..2100, no futura (hora de planta). Devuelve la fecha o lanza error con status 400.
function validarFecha(fecha) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw bad('fecha inválida (YYYY-MM-DD)');
  const d = new Date(`${fecha}T00:00:00Z`);
  if (isNaN(d) || d.toISOString().slice(0, 10) !== fecha) throw bad('fecha inválida');
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw bad('fecha fuera de 2000..2100');
  const hoy = new Date(Date.now() + cam.offsetMs()).toISOString().slice(0, 10);
  if (fecha > hoy) throw bad('la fecha no puede ser futura');
  return fecha;
}

// Ayer en hora de planta.
const ayer = () => new Date(Date.now() + cam.offsetMs() - DIA_MS).toISOString().slice(0, 10);

function rangoDia(fecha) {
  const ini = Date.parse(`${fecha}T00:00:00Z`) - cam.offsetMs();
  return { desde: new Date(ini).toISOString(), hasta: new Date(ini + DIA_MS).toISOString() };
}

const hhmmss = (ts) => (ts == null ? '' : new Date(ts + cam.offsetMs()).toISOString().slice(11, 19));
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

function armarHojas({ descongelados = [], compresores = [], eventos = [], maniobras = [], temperaturas = [] }, fecha) {
  // Una fila por cámara y grupo; los que no vinieron van en cero.
  const filas = [];
  for (const c of cam.CAMARAS) {
    for (const g of GRUPOS) {
      const r = compresores.find((x) => x.camara === c && x.grupo === g && (!x.dia || x.dia === fecha)) || {};
      filas.push({ camara: c, grupo: g, horas: num(r.horas), sin: num(r.horasSinDatos), arr: num(r.arranques), max: num(r.maxArranquesHora) });
    }
  }

  const saltados = descongelados.filter((d) => d.saltado).length;
  const cortados = descongelados.filter((d) => d.cortados).length;
  const noEjec = descongelados.filter((d) => d.noEjecutada).length;
  const lineas = [
    `Descongelados: ${descongelados.length} (${saltados} saltado)`,
    `Cortados: ${cortados}`,
    `No ejecutados: ${noEjec}`,
  ];
  let sinDatos = 0;
  for (const c of cam.CAMARAS) {
    const f = filas.filter((x) => x.camara === c);
    const horas = Math.round(f.reduce((n, x) => n + x.horas, 0) * 100) / 100;
    const m = f.reduce((a, x) => (x.max > a.max ? x : a), { max: 0, grupo: '-' });
    lineas.push(`${c}: horas de compresor ${horas}`);
    lineas.push(`${c}: máx. arranques/hora ${m.max}${m.max ? ` (${m.grupo})` : ''}`);
    sinDatos += f.reduce((n, x) => n + x.sin, 0);
  }
  lineas.push(`Alarmas y eventos: ${eventos.length}`);
  sinDatos = Math.round(sinDatos * 100) / 100;
  if (sinDatos > 0) lineas.push(`Horas sin datos: ${sinDatos}`);

  return [
    { name: 'Resumen', headers: [`Reporte de cámaras ${fecha}`], rows: lineas.map((l) => [l]) },
    {
      name: 'Descongelados',
      headers: ['Cámara', 'Horario', 'Etapa', 'Grupos', 'Inicio', 'Fin', 'Duración (s)', 'Cortados', 'Estado'],
      rows: descongelados.map((d) => [d.camara, d.horario, d.etapa, d.grupos, hhmmss(d.inicio), hhmmss(d.fin), d.duracionS, d.cortados,
        d.saltado ? 'Saltado' : d.noEjecutada ? 'No ejecutado' : 'Ejecutado']),
    },
    {
      name: 'Compresores',
      headers: ['Cámara', 'Grupo', 'Horas', 'Horas sin datos', 'Arranques', 'Máx. arranques/hora'],
      rows: filas.map((x) => [x.camara, x.grupo, x.horas, x.sin, x.arr, x.max]),
    },
    {
      name: 'Alarmas y eventos',
      headers: ['Hora', 'Evento', 'Estado'],
      rows: eventos.map((e) => [hhmmss(e.ts), e.texto, e.estado]),
    },
    {
      name: 'Maniobras',
      headers: ['Hora', 'Usuario', 'Qué', 'Resultado'],
      rows: maniobras.map((x) => [hhmmss(x.ts), x.usuario, x.accion, x.respuesta]),
    },
    temperaturas.length
      ? { name: 'Temperaturas', headers: ['Hora', 'Cámara', 'Temperatura'], rows: temperaturas }
      : { name: 'Temperaturas', headers: ['Sin datos de temperatura'], rows: [] },
  ];
}

// Lee un día de Influx por el mismo camino que las rutas /api/camaras. Lanza si falla Influx.
async function leerDia(fecha, queryCsv = influxRaw.queryAnnotatedCsv) {
  const p = rangoDia(fecha);
  const [desc, comp, lat, ev, man, tram] = await Promise.all([
    queryCsv(cam.fluxDescongelados(p)), queryCsv(cam.fluxCompresores(p)),
    queryCsv(cam.fluxLatidos(p)), queryCsv(cam.fluxEventos(p)), queryCsv(cam.fluxMando(p)), queryCsv(cam.fluxTramos(p)),
  ]);
  return {
    descongelados: cam.parseDescongelados(desc),
    compresores: cam.parseCompresores(comp, { ...p, latidos: lat }),
    eventos: cam.parseEventos(ev),
    maniobras: cam.parseMando(man),
    tramos: cam.parseTramos(tram, { ...p, latidos: lat }),
    temperaturas: [],
  };
}

async function generarXlsx(fecha, queryCsv) {
  const datos = await leerDia(fecha, queryCsv);
  const hojas = armarHojas(datos, fecha);
  return { xlsx: reports.toXLSX(hojas), hojas };
}

module.exports = { validarFecha, ayer, rangoDia, armarHojas, leerDia, generarXlsx };

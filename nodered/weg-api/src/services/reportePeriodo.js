'use strict';

// Reporte semanal (lunes a domingo) y mensual: totales por cámara, comparación con el período anterior y equipos para
// revisar (promedio por día). Mismo PDF que el diario (reporteDiario.renderPdf), sin el gráfico del día ni los eventos.
const cam = require('./camaras');
const f = require('./frases');
const reporteCamaras = require('./reporteCamaras');
const reporteDiario = require('./reporteDiario');

const DIA_MS = 864e5;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const masDias = (fecha, n) => iso(Date.parse(`${fecha}T00:00:00Z`) + n * DIA_MS);
const ddmm = (fecha) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const local = (ts) => new Date(ts + cam.offsetMs()).toISOString();

// Período que contiene a `fecha` (YYYY-MM-DD de planta): semana de lunes a domingo, o el mes calendario.
function periodo(tipo, fecha) {
  if (tipo === 'semana') {
    const dow = (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
    const desde = masDias(fecha, -dow);
    const hasta = masDias(desde, 6);
    return { tipo, desde, hasta, nombre: `semana del ${ddmm(desde)} al ${ddmm(hasta)}/${hasta.slice(0, 4)}`, archivo: `reporte-semanal_${desde}.pdf` };
  }
  if (tipo === 'mes') {
    const desde = `${fecha.slice(0, 7)}-01`;
    const [y, m] = [+fecha.slice(0, 4), +fecha.slice(5, 7)];
    const hasta = iso(Date.UTC(y, m, 0)); // día 0 del mes siguiente = último de este
    return { tipo, desde, hasta, nombre: `${MESES[m - 1]} ${y}`, archivo: `reporte-mensual_${fecha.slice(0, 7)}.pdf` };
  }
  throw Object.assign(new Error('Tipo de reporte inválido (semana o mes)'), { status: 400 });
}
const anterior = (p) => periodo(p.tipo, masDias(p.desde, -1));
// El último período completo hasta `ayer` (si ayer cierra el período, ese; si no, el anterior)
function ultimoCompleto(tipo, ayer) {
  const p = periodo(tipo, ayer);
  return p.hasta === ayer ? p : anterior(p);
}
const cantidadDias = (p) => Math.round((Date.parse(p.hasta) - Date.parse(p.desde)) / DIA_MS) + 1;

const pct = (a, b) => (b > 0 ? `${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / b * 100)} %` : null);
const r1 = (x) => Math.round(x * 10) / 10;
const horasNum = (h) => String(r1(h)).replace('.', ',');

// Totales de una cámara en un período (los mismos datos que leerRango)
function totales(c, datos, periodos) {
  const desc = datos.descongelados.filter((d) => d.camara === c);
  const cuenta = f.contarDescongelados(desc);
  const equipos = f.agruparCompresores(datos.compresores.filter((x) => x.camara === c));
  const grupos = f.agruparPeriodos(periodos.filter((p) => p.clave.startsWith(`${c}.`)), { camaraImplicita: c });
  const man = datos.maniobras.filter((m) => m.camara === c && m.comando !== 'visto');
  return {
    desc, equipos, grupos, man,
    resumen: {
      ...cuenta, corridas: cuenta.hechos + cuenta.saltados + cuenta.noSeHizo,
      alarmas: grupos.length, alarmasAbiertas: grupos.filter((g) => g.fin === null).length, maniobras: man.length,
      horas: r1(equipos.reduce((n, x) => n + x.horas, 0)), arranques: equipos.reduce((n, x) => n + x.arranques, 0),
    },
    minutosAlarma: grupos.reduce((n, g) => n + (g.duracionMin || 0), 0),
    // días con datos de compresores (los promedios por día se calculan sobre estos, no sobre todo el período)
    diasConDatos: new Set(datos.compresores.filter((x) => x.camara === c && (x.horas > 0 || x.arranques > 0)).map((x) => x.dia)).size,
  };
}
const periodosDe = (datos) => f.periodosAlarma(f.quitarRemDuplicados([...datos.eventos, ...datos.maniobras]));

// datos y previo: forma de reporteCamaras.leerRango (previo puede faltar: sin comparación)
function armarPeriodo(p, datos, previo = null) {
  const dias = cantidadDias(p);
  const periodos = periodosDe(datos);
  const periodosPrev = previo ? periodosDe(previo) : [];
  const dePeriodo = p.tipo === 'semana' ? 'la semana anterior' : 'el mes anterior';
  const fechaHora = (ts) => (ts == null ? '' : `${ddmm(local(ts).slice(0, 10))} ${local(ts).slice(11, 16)}`);
  const camaras = cam.CAMARAS.map((c) => {
    const t = totales(c, datos, periodos);
    const extra = [`Alarmas activas en total: ${t.minutosAlarma ? f.duracionTxt(t.minutosAlarma) : 'nada'}`];
    const prev = previo ? totales(c, previo, periodosPrev) : null;
    if (prev && !prev.diasConDatos && !prev.resumen.corridas) extra.push(`Comparado con ${dePeriodo}: no hay datos para comparar`);
    else if (prev) {
      const a = prev.resumen;
      const comp = [pct(t.resumen.horas, a.horas) && `horas de marcha ${pct(t.resumen.horas, a.horas)}`,
        pct(t.resumen.arranques, a.arranques) && `arranques ${pct(t.resumen.arranques, a.arranques)}`,
        `alarmas ${t.resumen.alarmas} (antes ${a.alarmas})`, `descongelados hechos ${t.resumen.hechos} (antes ${a.hechos})`].filter(Boolean);
      extra.push(`Comparado con ${dePeriodo}: ${comp.join(' · ')}`);
    }
    const porDia = [];
    for (let i = 0; i < dias; i++) {
      const dia = masDias(p.desde, i);
      const cu = f.contarDescongelados(t.desc.filter((d) => d.inicio != null && local(d.inicio).slice(0, 10) === dia));
      porDia.push([ddmm(dia), String(cu.hechos), String(cu.cortados), String(cu.saltados), String(cu.noSeHizo)]);
    }
    return {
      camara: c, nombre: f.nombreCamara(c), resumen: t.resumen, extra, distintos: f.equiposDistintos(t.equipos, t.diasConDatos || dias), trend: null,
      tablas: [
        { titulo: 'Descongelados por día', columnas: ['Día', 'Hechos', 'Cortados a mano', 'Saltados', 'No se hicieron'], anchos: [0.2, 0.2, 0.2, 0.2, 0.2], filas: porDia, vacio: 'Sin días.' },
        { titulo: 'Equipos', columnas: ['Equipo', 'Horas de marcha', 'Promedio por día', 'Arranques', 'Horas sin datos'], anchos: [0.2, 0.2, 0.2, 0.2, 0.2], vacio: 'Sin datos de compresores.',
          filas: t.equipos.map((x) => [f.equipoDe(x.grupo), horasNum(x.horas), horasNum(x.horas / (t.diasConDatos || dias)), String(x.arranques), horasNum(x.horasSinDatos)]) },
        { titulo: 'Alarmas', columnas: ['Alarma', 'Inicio', 'Fin', 'Duración'], anchos: [0.52, 0.14, 0.2, 0.14], vacio: 'No hubo alarmas.',
          filas: t.grupos.map((g) => [g.texto, g.inicio === null ? 'antes del período' : fechaHora(g.inicio), g.fin === null ? 'sin cierre en el período' : fechaHora(g.fin), g.duracionMin === null ? '' : f.duracionTxt(g.duracionMin)]) },
        { titulo: 'Maniobras desde el portal', columnas: ['Fecha', 'Usuario', 'Acción', 'Resultado'], anchos: [0.14, 0.14, 0.42, 0.3], vacio: 'No hubo maniobras desde el portal.',
          filas: t.man.sort((a, b) => a.ts - b.ts).map((m) => [fechaHora(m.ts), m.usuario || '', m.accion || '', reporteDiario.resultadoManiobra(m)]) },
      ],
    };
  });
  const gruposPlanta = f.agruparPeriodos(periodos.filter((x) => !/^C\d+\./.test(x.clave)));
  const planta = {
    alarmas: { titulo: 'Alarmas', columnas: ['Alarma', 'Inicio', 'Fin', 'Duración'], anchos: [0.52, 0.14, 0.2, 0.14], vacio: 'No hubo alarmas.',
      filas: gruposPlanta.map((g) => [g.texto, g.inicio === null ? 'antes del período' : fechaHora(g.inicio), g.fin === null ? 'sin cierre en el período' : fechaHora(g.fin), g.duracionMin === null ? '' : f.duracionTxt(g.duracionMin)]) },
    eventos: { filas: [] },
  };
  const totalAlarmas = camaras.reduce((n, c) => n + c.resumen.alarmas, 0) + gruposPlanta.length;
  const titulo = `Reporte ${p.tipo === 'semana' ? 'semanal' : 'mensual'} de cámaras — ${p.nombre}`;
  const revisar = camaras.flatMap((c) => c.distintos.map((d) => `${c.nombre} ${f.equipoDe(d.grupo)}`));
  const descTxt = (r) => `${r.hechos} de ${r.corridas} descongelados${r.corridas && r.hechos === r.corridas ? ' ✓' : r.corridas ? ' ⚠' : ''}`;
  const caption = [`Reporte ${p.tipo === 'semana' ? 'semanal' : 'mensual'}: ${p.nombre}`, ...camaras.map((c) => `${c.nombre}: ${descTxt(c.resumen)}`),
    totalAlarmas === 1 ? '1 alarma' : `${totalAlarmas} alarmas`, ...(revisar.length ? [`⚠ revisar: ${revisar.join(', ')}`] : [])].join(' · ').slice(0, 1024);
  return { tipo: p.tipo, desde: p.desde, hasta: p.hasta, titulo, camaras, planta, totalAlarmas, caption, archivo: p.archivo };
}

const rango = (p) => ({ desde: reporteCamaras.rangoDia(p.desde).desde, hasta: reporteCamaras.rangoDia(p.hasta).hasta });

// Lee el período y el anterior de Influx y arma el PDF. Lanza si Influx falla.
async function generarPdf(tipo, fecha, { queryCsv } = {}) {
  const p = periodo(tipo, fecha);
  const [datos, previo] = await Promise.all([
    reporteCamaras.leerRango(rango(p), queryCsv, { sinTramos: true }),
    reporteCamaras.leerRango(rango(anterior(p)), queryCsv, { sinTramos: true }),
  ]);
  const modelo = armarPeriodo(p, datos, previo);
  return { modelo, pdf: await reporteDiario.renderPdf(modelo), nombre: p.archivo };
}

module.exports = { periodo, anterior, ultimoCompleto, armarPeriodo, generarPdf };

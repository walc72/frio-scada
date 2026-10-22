'use strict';

// Reporte diario de cámaras en PDF. armarReporte (puro) da forma a los datos del día con las mismas frases
// del portal (services/frases.js); renderPdf lo dibuja con pdfkit (A4 vertical, mismo look que reports.toPDF).
const fs = require('fs');
const cam = require('./camaras');
const f = require('./frases');
const branding = require('./branding');

const local = (ts) => new Date(ts + cam.offsetMs()).toISOString();
const hhmm = (ts) => (ts == null ? '' : local(ts).slice(11, 16));
const ddmmaaaa = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const r1 = (x) => Math.round(x * 10) / 10;
const horasNum = (h) => String(r1(h)).replace('.', ',');

// Maniobra desde el portal: estado = resultado del PLC (1 hecho, 0 sin confirmar, otro rechazado con su motivo).
function resultadoManiobra(m) {
  const e = Number(m.estado);
  if (e === 1) return 'hecho';
  if (e === 0) return 'sin confirmar';
  return m.respuesta ? `rechazado: ${m.respuesta}` : 'rechazado';
}

const TABLA = {
  descongelados: { titulo: 'Descongelados', columnas: ['Hora', 'Horario', 'Etapa', 'Equipos', 'Duración', 'Resultado'], anchos: [0.08, 0.09, 0.07, 0.16, 0.12, 0.48], vacio: 'No hubo descongelados.' },
  equipos: { titulo: 'Equipos', columnas: ['Equipo', 'Horas de marcha', 'Arranques', 'Máx. arranques por hora', 'Horas sin datos'], anchos: [0.2, 0.2, 0.16, 0.24, 0.2], vacio: 'Sin datos de compresores.' },
  alarmas: { titulo: 'Alarmas', columnas: ['Alarma', 'Inicio', 'Fin', 'Duración'], anchos: [0.52, 0.14, 0.2, 0.14], vacio: 'No hubo alarmas.' },
  maniobras: { titulo: 'Maniobras desde el portal', columnas: ['Hora', 'Usuario', 'Acción', 'Resultado'], anchos: [0.08, 0.14, 0.46, 0.32], vacio: 'No hubo maniobras desde el portal.' },
  eventos: { titulo: 'Eventos del día', columnas: ['Hora', 'Tipo', 'Evento'], anchos: [0.08, 0.2, 0.72], vacio: 'No hubo eventos.' },
};
const tabla = (k, filas) => ({ ...TABLA[k], filas });

// sigue(clave): la alarma sigue activa ahora (estado vivo). Sin eso, un período abierto queda "sin cierre en el día".
function filasAlarmas(grupos, sigue) {
  return grupos.map((g) => [g.texto, g.inicio === null ? 'antes del día' : hhmm(g.inicio),
    g.fin === null ? (g.claves.every(sigue) ? 'sigue activa' : 'sin cierre en el día') : hhmm(g.fin),
    g.duracionMin === null ? '' : f.duracionTxt(g.duracionMin)]);
}

// Eventos en palabras (orden de tiempo), con las maniobras y sin los REM duplicados.
function filasEventos(eventos) {
  return [...eventos].sort((a, b) => a.ts - b.ts).map((e) => (e.maniobra
    ? [hhmm(e.ts), 'Maniobra desde el portal', f.textoManiobra(e)]
    : [hhmm(e.ts), f.TIPO[f.tipoAviso(e.texto, e.estado)], f.fraseEvento(e.texto, e.estado)]));
}

// Etiquetas de horario: si dos quedan a menos de `minimo`, la primera va a la izquierda de su marca y la segunda a
// la derecha (copia de anclasEtiquetas de frontend-react/src/lib/trend.ts).
function anclasEtiquetas(xs, minimo) {
  const r = xs.map(() => 'middle');
  for (let i = 0; i + 1 < xs.length; i++) {
    if (xs[i + 1] - xs[i] < minimo) { if (r[i] === 'middle') r[i] = 'end'; r[i + 1] = 'start'; }
  }
  return r;
}

// "Qué hizo cada equipo" del día, en fracciones del día (0 = 00:00, 1 = 24:00): una fila por equipo con sus tramos
// (frio, descongelando, apagado, sin-datos) y las marcas de los horarios donde empezaron los descongelados.
const GRUPOS = [1, 2, 3, 4, 5, 6, 7, 8];
function armarTrend(c, fecha, tramos, desc) {
  const t0 = Date.parse(`${fecha}T00:00:00Z`) - cam.offsetMs();
  const fr = (t) => Math.min(1, Math.max(0, (t - t0) / 864e5));
  const filas = GRUPOS.map((g) => ({
    equipo: g,
    tramos: tramos.filter((t) => t.camara === c && t.grupo === `G${g}`)
      .map((t) => ({ a: fr(Date.parse(t.inicio)), b: fr(Date.parse(t.fin)), estado: t.estado })).filter((t) => t.b > t.a),
  }));
  const inicio = new Map(); // horario → primer inicio del día
  for (const d of desc) if (d.inicio != null && (!inicio.has(d.horario) || d.inicio < inicio.get(d.horario))) inicio.set(d.horario, d.inicio);
  const marcas = [...inicio.values()].sort((a, b) => a - b).map((t) => ({ x: fr(t), hora: hhmm(t) }));
  return { filas, marcas, hayDatos: filas.some((f) => f.tramos.length) };
}

// datos: { fecha, descongelados, compresores, eventos, maniobras, tramos } (forma de reporteCamaras.leerDia).
function armarReporte({ fecha, descongelados = [], compresores = [], eventos = [], maniobras = [], tramos = [] }, { sigue = () => false } = {}) {
  const todos = f.quitarRemDuplicados([...eventos, ...maniobras]);
  const camDe = (e) => (e.maniobra ? e.camara || null : f.camaraDeEvento(e.texto));
  const periodos = f.periodosAlarma(todos);
  const camaras = cam.CAMARAS.map((c) => {
    const desc = descongelados.filter((d) => d.camara === c);
    const cuenta = f.contarDescongelados(desc);
    const equipos = f.agruparCompresores(compresores.filter((x) => x.camara === c && (!x.dia || x.dia === fecha)));
    const grupos = f.agruparPeriodos(periodos.filter((p) => p.clave.startsWith(`${c}.`)), { camaraImplicita: c });
    const man = maniobras.filter((m) => m.camara === c).sort((a, b) => a.ts - b.ts);
    const resumen = {
      ...cuenta, corridas: cuenta.hechos + cuenta.saltados + cuenta.noSeHizo,
      alarmas: grupos.length, alarmasAbiertas: grupos.filter((g) => g.fin === null).length, maniobras: man.length,
      horas: r1(equipos.reduce((n, x) => n + x.horas, 0)), arranques: equipos.reduce((n, x) => n + x.arranques, 0),
    };
    return {
      camara: c, nombre: f.nombreCamara(c), resumen, trend: armarTrend(c, fecha, tramos, desc),
      tablas: [
        tabla('descongelados', desc.map((d) => {
          const b = f.badgeDescongelado(d);
          return [hhmm(d.inicio), d.horario, String(d.etapa), d.grupos ? d.grupos.replace(/G/g, '').replace(/,/g, ', ') : '—',
            d.duracionS == null ? '—' : f.duracionTxt(Math.round(d.duracionS / 60)), `${b.etiqueta}: ${b.motivo}`];
        })),
        tabla('equipos', equipos.map((x) => [f.equipoDe(x.grupo), horasNum(x.horas), String(x.arranques), String(x.maxArranquesHora), horasNum(x.horasSinDatos)])),
        tabla('alarmas', filasAlarmas(grupos, sigue)),
        tabla('maniobras', man.map((m) => [hhmm(m.ts), m.usuario || '', m.accion || '', resultadoManiobra(m)])),
        tabla('eventos', filasEventos(todos.filter((e) => camDe(e) === c))),
      ],
    };
  });
  const gruposPlanta = f.agruparPeriodos(periodos.filter((p) => !/^C\d+\./.test(p.clave)));
  const eventosPlanta = todos.filter((e) => camDe(e) === null);
  const planta = { alarmas: tabla('alarmas', filasAlarmas(gruposPlanta, sigue)), eventos: tabla('eventos', filasEventos(eventosPlanta)) };
  const totalAlarmas = camaras.reduce((n, c) => n + c.resumen.alarmas, 0) + gruposPlanta.length;
  const fechaTxt = ddmmaaaa(fecha);

  const descTxt = (r) => `${r.hechos} de ${r.corridas} descongelados${r.corridas && r.hechos === r.corridas ? ' ✓' : r.corridas ? ' ⚠' : ''}`;
  const caption = [`Reporte del ${fechaTxt.slice(0, 5)}`, ...camaras.map((c) => `${c.nombre}: ${descTxt(c.resumen)}`),
    totalAlarmas === 1 ? '1 alarma' : `${totalAlarmas} alarmas`].join(' · ').slice(0, 1024);
  return { fecha, fechaTxt, titulo: `Reporte de cámaras — ${fechaTxt}`, camaras, planta, totalAlarmas, caption };
}

// Líneas de resumen por cámara (página 1 del PDF y cuerpo del correo).
function lineasResumen(r) {
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  return [
    `Descongelados: ${r.hechos} de ${r.corridas} hechos · ${plural(r.cortados, 'cortado', 'cortados')} a mano · ${plural(r.saltados, 'saltado', 'saltados')} · ${r.noSeHizo} no ${r.noSeHizo === 1 ? 'se hizo' : 'se hicieron'}`,
    `Alarmas: ${plural(r.alarmas, 'período', 'períodos')}${r.alarmasAbiertas ? ` (${r.alarmasAbiertas} sin cerrar al final del día)` : ''}`,
    `Maniobras desde el portal: ${r.maniobras}`,
    `Compresores: ${horasNum(r.horas)} h de marcha · ${plural(r.arranques, 'arranque', 'arranques')}`,
  ];
}

// ─── PDF ────────────────────────────────────────────────────────────
const DARK = '#333333', GREY = '#888888';

function renderPdf(modelo, { ahora = Date.now() } = {}) {
  const ORANGE = branding.get().colorInforme; // color de la marca (Config avanzada → Marca)
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks = [];
  const logo = branding.logoPath();
  const hasLogo = fs.existsSync(logo);
  const pageW = doc.page.width, pageH = doc.page.height;
  const mL = 40, contentW = pageW - 80, bottom = pageH - 50;

  return new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const header = () => {
      if (hasLogo) { try { doc.image(logo, mL, 22, { fit: [110, 32] }); } catch { /* logo ilegible: sin logo */ } }
      doc.font('Helvetica-Bold').fontSize(15).fillColor(DARK).text(modelo.titulo, mL + 120, 30, { width: contentW - 120 });
      doc.moveTo(mL, 62).lineTo(pageW - mL, 62).lineWidth(2).strokeColor(ORANGE).stroke();
      doc.x = mL; doc.y = 74;
    };
    const nuevaPagina = () => { doc.addPage(); header(); };
    const espacio = (h) => { if (doc.y + h > bottom) nuevaPagina(); };
    const h1 = (t) => { espacio(60); doc.moveDown(0.3); doc.font('Helvetica-Bold').fontSize(13).fillColor(ORANGE).text(t, mL, doc.y, { width: contentW }); doc.moveDown(0.3); };
    const h2 = (t) => { espacio(50); doc.moveDown(0.4); doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(t, mL, doc.y, { width: contentW }); doc.moveDown(0.2); };
    const parrafo = (t) => { espacio(16); doc.font('Helvetica').fontSize(9).fillColor(DARK).text(t, mL, doc.y, { width: contentW }); };

    const FS = 8, PAD = 3;
    function tablaPdf(t) {
      h2(t.titulo);
      if (!t.filas.length) { parrafo(t.vacio); return; }
      const w = t.anchos.map((a) => a * contentW);
      const alto = (celdas, font) => {
        doc.font(font).fontSize(FS);
        return Math.max(...celdas.map((c, i) => doc.heightOfString(String(c), { width: w[i] - 2 * PAD }))) + 2 * PAD;
      };
      const fila = (celdas, y, font, color) => {
        let x = mL;
        doc.font(font).fontSize(FS).fillColor(color);
        celdas.forEach((c, i) => { doc.text(String(c), x + PAD, y + PAD, { width: w[i] - 2 * PAD }); x += w[i]; });
      };
      const cabecera = () => {
        const h = alto(t.columnas, 'Helvetica-Bold');
        doc.rect(mL, doc.y, contentW, h).fill(ORANGE);
        const y = doc.y; fila(t.columnas, y, 'Helvetica-Bold', '#ffffff'); doc.y = y + h;
      };
      espacio(40); cabecera();
      t.filas.forEach((celdas, k) => {
        const h = alto(celdas, 'Helvetica');
        if (doc.y + h > bottom) { nuevaPagina(); cabecera(); } // la cabecera se repite en cada página
        const y = doc.y;
        if (k % 2 === 1) doc.rect(mL, y, contentW, h).fill('#f6f6f6');
        fila(celdas, y, 'Helvetica', DARK);
        doc.y = y + h;
      });
      doc.x = mL;
    }

    header();
    h1('Resumen');
    for (const c of modelo.camaras) {
      h2(c.nombre);
      for (const l of lineasResumen(c.resumen)) parrafo(`• ${l}`);
    }
    tablaPdf({ ...modelo.planta.alarmas, titulo: 'Alarmas de la planta (PLC)' });
    if (modelo.planta.eventos.filas.length) tablaPdf({ ...modelo.planta.eventos, titulo: 'Eventos de la planta' });

    // Gráfico "Qué hizo cada equipo" (mismos colores que el portal; sin "ahora": el día ya terminó)
    const COLOR = { frio: '#1E6FD9', descongelando: '#F28C28', apagado: '#9A9A9A', 'sin-datos': '#E5E7EB' };
    const VERDE = '#047857';
    function trendPdf(t) {
      h2('Qué hizo cada equipo');
      if (!t.hayDatos) { parrafo('Sin datos de los equipos en el día.'); return; }
      const LBL = 46, RH = 11, x0 = mL + LBL, w = contentW - LBL - 6;
      const X = (fr) => x0 + fr * w;
      espacio(30 + GRUPOS.length * RH + 30);
      const top = doc.y + 18, alto = t.filas.length * RH, abajo = top + alto;
      for (let h = 0; h <= 24; h++) {
        doc.moveTo(X(h / 24), top - 3).lineTo(X(h / 24), abajo).lineWidth(0.4).strokeColor('#e5e5e5').stroke();
        if (h % 2 === 0) doc.font('Helvetica').fontSize(6.5).fillColor(GREY).text(`${String(h).padStart(2, '0')}:00`, X(h / 24) - 15, abajo + 3, { width: 30, align: 'center', lineBreak: false });
      }
      t.filas.forEach((fl, i) => {
        const y = top + i * RH;
        doc.font('Helvetica').fontSize(7.5).fillColor(DARK).text(`Equipo ${fl.equipo}`, mL, y + 1.5, { width: LBL - 4, lineBreak: false });
        for (const tr of fl.tramos) doc.rect(X(tr.a), y + 1, X(tr.b) - X(tr.a), RH - 3).fill(COLOR[tr.estado] || COLOR['sin-datos']);
      });
      const anclas = anclasEtiquetas(t.marcas.map((m) => X(m.x)), 24);
      t.marcas.forEach((m, i) => {
        const x = X(m.x);
        doc.moveTo(x - 3, top - 8).lineTo(x + 3, top - 8).lineTo(x, top - 3).fill(VERDE);
        doc.moveTo(x, top - 3).lineTo(x, abajo).lineWidth(0.6).dash(1.5, { space: 2 }).strokeColor(VERDE).stroke().undash();
        const tw = 26, lx = anclas[i] === 'end' ? x + 2 - tw : anclas[i] === 'start' ? x - 2 : x - tw / 2;
        doc.font('Helvetica-Bold').fontSize(7).fillColor(VERDE).text(m.hora, lx, top - 17, { width: tw, align: anclas[i] === 'end' ? 'right' : anclas[i] === 'start' ? 'left' : 'center', lineBreak: false });
      });
      let lx = mL; const ly = abajo + 14;
      for (const [k, txt] of [['frio', 'Enfriando'], ['descongelando', 'Descongelando'], ['apagado', 'Apagado'], ['sin-datos', 'Sin datos']]) {
        doc.rect(lx, ly + 1, 7, 7).fill(COLOR[k]);
        doc.font('Helvetica').fontSize(7).fillColor(DARK).text(txt, lx + 10, ly, { lineBreak: false });
        lx += 10 + doc.widthOfString(txt) + 14;
      }
      doc.x = mL; doc.y = ly + 14;
    }

    for (const c of modelo.camaras) {
      nuevaPagina();
      h1(c.nombre);
      trendPdf(c.trend);
      for (const t of c.tablas) tablaPdf(t);
    }

    // Pie y numeración en todas las páginas (bufferPages); sin anular el margen inferior pdfkit agregaría una página.
    const footer = branding.get().footer;
    const l = local(ahora);
    const pie = `Generado ${ddmmaaaa(l)} ${l.slice(11, 16)}${footer ? ` · Powered by ${footer}` : ''}`;
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7.5).fillColor(GREY);
      doc.text(pie, mL, pageH - 30, { width: contentW * 0.8, lineBreak: false });
      doc.text(`Página ${i - start + 1} de ${count}`, mL + contentW * 0.8, pageH - 30, { width: contentW * 0.2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

// Lee el día de Influx (mismas consultas que el Excel) y arma el PDF. Lanza si Influx falla.
async function generarPdf(fecha, { queryCsv, sigue } = {}) {
  const datos = await require('./reporteCamaras').leerDia(fecha, queryCsv);
  const modelo = armarReporte({ fecha, ...datos }, { sigue });
  return { modelo, pdf: await renderPdf(modelo) };
}

module.exports = { armarReporte, lineasResumen, renderPdf, generarPdf, resultadoManiobra, anclasEtiquetas };

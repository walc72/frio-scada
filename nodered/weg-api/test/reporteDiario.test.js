'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-diario-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.TZ_OFFSET_MIN = '-180';

const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../src/services/frases');
const rd = require('../src/services/reporteDiario');

const FECHA = '2026-10-17';
const t = (hhmm) => Date.parse(`${FECHA}T${hhmm}:00-03:00`);
const D = (x) => ({ camara: 'C4', horario: 'H1', etapa: 1, grupos: 'G1,G2', inicio: t('06:00'), fin: t('06:20'), duracionS: 1200, cortados: '', saltado: false, noEjecutada: false, ...x });
const M = (x) => ({ ts: t('09:00'), maniobra: true, usuario: 'ana', accion: 'Equipo 2 a automático', texto: 'ana: Equipo 2 a automático', camara: 'C4', estado: 1, respuesta: 'Listo', ...x });
const tablaDe = (m, c, titulo) => m.camaras.find((x) => x.camara === c).tablas.find((x) => x.titulo === titulo);

function muestra() {
  return rd.armarReporte({
    fecha: FECHA,
    descongelados: [
      D(), D({ etapa: 2, inicio: t('06:20') }),                 // una corrida (2 etapas)
      D({ horario: 'H2', inicio: t('12:00'), cortados: 'G2' }),  // cortado a mano: cuenta como hecho
      D({ horario: 'H3', inicio: t('18:00'), saltado: true }),
      D({ horario: 'H4', inicio: t('23:00'), noEjecutada: true }),
      D({ camara: 'C5' }),
    ],
    compresores: [
      { camara: 'C4', dia: FECHA, grupo: 'G1', horas: 10.26, horasSinDatos: 0.5, arranques: 7, maxArranquesHora: 3 },
      { camara: 'C4', dia: FECHA, grupo: 'G2', horas: 4.1, horasSinDatos: 0, arranques: 2, maxArranquesHora: 1 },
      { camara: 'C4', dia: '2026-10-16', grupo: 'G2', horas: 99, horasSinDatos: 0, arranques: 99, maxArranquesHora: 99 }, // otro día: fuera
    ],
    eventos: [
      // Equipos 2, 4, 6, 8: aparecen con segundos de diferencia y se cierran juntos
      ...[2, 4, 6, 8].map((g, i) => ({ ts: t('10:00') + i * 20e3, texto: `C4 G${g} SIN DESCONGELAR`, estado: 1 })),
      ...[2, 4, 6, 8].map((g, i) => ({ ts: t('11:30') + i * 20e3, texto: `C4 G${g} SIN DESCONGELAR`, estado: 0 })),
      { ts: t('20:00'), texto: 'C4 MANUAL PROLONGADO', estado: 1 },  // queda abierta
      { ts: t('09:00') + 60e3, texto: 'REM u1 C4 G2 MODO AUTO', estado: 1 },   // duplicado de la maniobra (±120 s): se va
      { ts: t('15:00'), texto: 'REM u1 C4 G3 MODO MANUAL', estado: 1 },        // sin maniobra cerca: se queda
      { ts: t('05:00'), texto: 'RELOJ DEL PLC INVALIDO', estado: 1 },
      { ts: t('05:30'), texto: 'RELOJ DEL PLC INVALIDO', estado: 0 },
    ],
    maniobras: [
      M(),
      M({ ts: t('13:00'), estado: 2, respuesta: 'El PLC no lo hizo: la cámara está en manual', texto: 'ana: Cámara 4 a automático', accion: 'Cámara 4 a automático' }),
      M({ ts: t('14:00'), estado: 0, respuesta: 'El PLC no respondió', usuario: 'bob' }),
    ],
  }, { sigue: (k) => k === 'C4.alarma_manual' });
}

test('resumen por cámara: descongelados, alarmas, maniobras y compresores', () => {
  const m = muestra();
  assert.equal(m.titulo, 'Reporte de cámaras — 17/10/2026');
  assert.deepEqual(m.camaras.map((c) => c.camara), ['C4', 'C5']);
  assert.deepEqual(m.camaras[0].resumen, {
    hechos: 2, cortados: 1, saltados: 1, noSeHizo: 1, corridas: 4,
    alarmas: 2, alarmasAbiertas: 1, maniobras: 3, horas: 14.4, arranques: 9,
  });
  assert.equal(m.camaras[1].resumen.hechos, 1);
  assert.equal(m.camaras[1].resumen.maniobras, 0);
  assert.equal(m.totalAlarmas, 3); // 2 de C4 + el reloj del PLC
  assert.equal(m.caption, 'Reporte del 17/10 · Cámara 4: 2 de 4 descongelados ⚠ · Cámara 5: 1 de 1 descongelados ✓ · 3 alarmas');
  assert.match(rd.lineasResumen(m.camaras[0].resumen)[0], /^Descongelados: 2 de 4 hechos · 1 cortado a mano · 1 saltado · 1 no se hizo$/);
});

test('alarmas agrupadas por tipo y equipos (tolerancia 5 min), con la frase del portal', () => {
  const m = muestra();
  assert.deepEqual(tablaDe(m, 'C4', 'Alarmas').filas, [
    ['Hay equipos en manual demasiado tiempo', '20:00', 'sigue activa', ''],
    ['Equipos 2, 4, 6, 8: llevan demasiadas horas sin descongelar', '10:00', '11:31', '1 h 31 min'],
  ]);
  assert.deepEqual(m.planta.alarmas.filas, [['PLC: el reloj del PLC está mal', '05:00', '05:30', '30 min']]);
  // sin la alarma viva: abierta = "sin cierre en el día"
  const sin = rd.armarReporte({ fecha: FECHA, eventos: [{ ts: t('20:00'), texto: 'C4 MANUAL PROLONGADO', estado: 1 }] });
  assert.equal(tablaDe(sin, 'C4', 'Alarmas').filas[0][2], 'sin cierre en el día');
  // a más de 5 min no se juntan
  const lejos = f.agruparPeriodos(f.periodosAlarma([
    { ts: t('10:00'), texto: 'C5 G1 SIN DESCONGELAR', estado: 1 }, { ts: t('10:06'), texto: 'C5 G2 SIN DESCONGELAR', estado: 1 },
  ]));
  assert.equal(lejos.length, 2);
});

test('eventos: REM duplicado de una maniobra se quita (±120 s), el resto en palabras', () => {
  const ev = tablaDe(muestra(), 'C4', 'Eventos del día').filas;
  assert.ok(!ev.some((r) => /equipo 2 pasó a automático/.test(r[2])), 'el REM duplicado no aparece');
  assert.deepEqual(ev.find((r) => r[0] === '15:00'), ['15:00', 'Acción de un operario', 'Desde el portal: Cámara 4, equipo 3 pasó a manual']);
  assert.deepEqual(ev.find((r) => r[0] === '09:00'), ['09:00', 'Maniobra desde el portal', 'ana: Equipo 2 a automático']);
  assert.deepEqual(ev.find((r) => r[0] === '10:00'), ['10:00', 'Alarma', 'Equipo 2 lleva mucho tiempo sin descongelar']);
  // los del PLC sin cámara van a la planta
  assert.deepEqual(muestra().planta.eventos.filas.map((r) => r[2]), ['El reloj del PLC no es válido', 'El reloj del PLC volvió a estar bien']);
  assert.equal(f.quitarRemDuplicados([{ ts: 0, texto: 'REM u1 MODO AUTO' }, { ts: 121e3, maniobra: true, texto: 'x' }]).length, 2);
});

test('maniobras: hecho, rechazado con motivo y sin confirmar', () => {
  assert.deepEqual(tablaDe(muestra(), 'C4', 'Maniobras desde el portal').filas, [
    ['09:00', 'ana', 'Equipo 2 a automático', 'hecho'],
    ['13:00', 'ana', 'Cámara 4 a automático', 'rechazado: El PLC no lo hizo: la cámara está en manual'],
    ['14:00', 'bob', 'Equipo 2 a automático', 'sin confirmar'],
  ]);
});

test('descongelados y equipos: filas en palabras', () => {
  const m = muestra();
  const d = tablaDe(m, 'C4', 'Descongelados').filas;
  assert.deepEqual(d[0], ['06:00', 'H1', '1', '1, 2', '20 min', 'completo: Terminó normalmente']);
  assert.equal(d[2][5], 'cortado a mano: Un operario cortó el descongelado del equipo 2');
  assert.equal(d[3][5].split(':')[0], 'saltado');
  assert.equal(d[4][5].split(':')[0], 'no se hizo');
  assert.deepEqual(tablaDe(m, 'C4', 'Equipos').filas, [['Equipo 1', '10,3', '7', '3', '0,5'], ['Equipo 2', '4,1', '2', '1', '0']]);
});

test('frases del portal: REM y eventos (mismos casos que frases.test.ts)', () => {
  assert.equal(f.fraseEvento('REM u12 C5 G3 MODO AUTO'), 'Desde el portal: Cámara 5, equipo 3 pasó a automático');
  assert.equal(f.fraseEvento('REM u1 AJUSTE 1 = 0'), 'Desde el portal: tope de la resistencia en manual = sin tope');
  assert.equal(f.fraseEvento('C4 G3 RESISTENCIA T.MAX', 0), 'Equipo 3: se normalizó la resistencia');
  assert.equal(f.claveAlarmaDeEvento('C5 G4 SIN DESCONGELAR'), 'C5.G4.alarma_sin_desc');
  assert.equal(f.claveAlarmaDeEvento('C5 G1 RESISTENCIA BLOQUEADA'), null);
  assert.equal(f.camaraDeEvento('REM u1 C5 G1 MODO AUTO'), 'C5');
  assert.equal(f.camaraDeEvento('ARRANQUE DEL PLC'), null);
});

const iso = (hhmm) => new Date(t(hhmm)).toISOString();
const TRAMOS = [
  { camara: 'C4', grupo: 'G1', inicio: iso('00:00'), fin: iso('06:00'), estado: 'frio' },
  { camara: 'C4', grupo: 'G1', inicio: iso('06:00'), fin: iso('06:20'), estado: 'descongelando' },
  { camara: 'C4', grupo: 'G1', inicio: iso('06:20'), fin: new Date(t('23:59') + 60e3).toISOString(), estado: 'sin-datos' },
  { camara: 'C5', grupo: 'G1', inicio: iso('00:00'), fin: iso('12:00'), estado: 'apagado' },
];

test('trend: tramos en fracción del día por equipo, marcas al inicio de cada horario', () => {
  const m = rd.armarReporte({ fecha: FECHA, tramos: TRAMOS, descongelados: [D(), D({ etapa: 2, inicio: t('06:20') }), D({ horario: 'H2', inicio: t('12:00') }), D({ horario: 'H4', inicio: null })] });
  const c4 = m.camaras.find((c) => c.camara === 'C4').trend;
  assert.equal(c4.filas.length, 8);
  assert.deepEqual(c4.filas[0].tramos.map((x) => [x.a, Math.round(x.b * 1440), x.estado]), [[0, 360, 'frio'], [0.25, 380, 'descongelando'], [380 / 1440, 1440, 'sin-datos']]);
  assert.deepEqual(c4.filas[1].tramos, []);
  assert.deepEqual(c4.marcas.map((x) => x.hora), ['06:00', '12:00']); // una por horario (la primera etapa); sin inicio no hay marca
  assert.equal(c4.hayDatos, true);
  const c5 = m.camaras.find((c) => c.camara === 'C5').trend;
  assert.equal(c5.filas[0].tramos[0].b, 0.5);
  assert.equal(rd.armarReporte({ fecha: FECHA }).camaras[0].trend.hayDatos, false);
});

test('anclasEtiquetas: igual que la del portal', () => {
  assert.deepEqual(rd.anclasEtiquetas([100, 400], 30), ['middle', 'middle']);
  assert.deepEqual(rd.anclasEtiquetas([100, 120, 600], 30), ['end', 'start', 'middle']);
});

test('PDF: Buffer no vacío que empieza con %PDF, también sin datos', async () => {
  for (const m of [muestra(), rd.armarReporte({ fecha: FECHA }), rd.armarReporte({ fecha: FECHA, tramos: TRAMOS, descongelados: [D(), D({ horario: 'H2', inicio: t('06:30') })] })]) {
    const pdf = await rd.renderPdf(m);
    assert.ok(Buffer.isBuffer(pdf) && pdf.length > 1000);
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  }
});

test('equiposDistintos: el que anda mucho más va a "Para revisar" y al texto del mensaje', () => {
  const comp = Array.from({ length: 8 }, (_, i) => ({ camara: 'C4', dia: FECHA, grupo: `G${i + 1}`, horas: i === 2 ? 21 : 16, horasSinDatos: 0, arranques: 5, maxArranquesHora: 1 }));
  const m = rd.armarReporte({ fecha: FECHA, compresores: comp });
  assert.deepEqual(m.camaras.find((c) => c.camara === 'C4').distintos, [{ grupo: 'G3', motivo: 'anduvo 21 h y el resto ~16 h' }]);
  assert.match(m.caption, /⚠ revisar: Cámara 4 Equipo 3$/);
  assert.deepEqual(rd.armarReporte({ fecha: FECHA }).camaras[0].distintos, []);
});

test('equiposDistintos: mismos casos que el portal', () => {
  const base = (h, a = 5) => Array.from({ length: 8 }, (_, i) => ({ grupo: `G${i + 1}`, horas: h, arranques: a }));
  const e = base(18, 5); e[0] = { ...e[0], horas: 6 }; e[7] = { ...e[7], arranques: 14 };
  assert.deepEqual(f.equiposDistintos(e), [{ grupo: 'G1', motivo: 'anduvo solo 6 h y el resto ~18 h' }, { grupo: 'G8', motivo: 'arrancó 14 veces y el resto ~5' }]);
  const v = base(16 * 7); v[1] = { ...v[1], horas: 21 * 7 };
  assert.deepEqual(f.equiposDistintos(v, 7), [{ grupo: 'G2', motivo: 'anduvo 21 h por día y el resto ~16 h' }]);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createDetector } = require('../src/descongelados');
const { lineaDescongelado } = require('../src/salidaInflux');

const DIR = path.join(__dirname, 'fixtures', 'secuencias');
const ms = (horaPc) => Date.parse(horaPc.replace(' ', 'T') + 'Z'); // hora PC -> tsMs (UTC fijo para el test)
const num = (s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

// Secuencia real (CSV hora_pc;hora_plc;campo;antes;ahora) + eventos sintetizados -> ciclos {ts, cambios, eventos}.
// hora_plc se agrega como cambio cuando varía, como lo vería el detector si diff no lo filtrara.
function cargar(nombre) {
  const filas = fs.readFileSync(path.join(DIR, nombre + '.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(';'));
  const fEv = path.join(DIR, nombre + '.eventos.json');
  const evs = fs.existsSync(fEv) ? JSON.parse(fs.readFileSync(fEv, 'utf8')) : [];
  const ciclos = new Map();
  const ciclo = (h) => { if (!ciclos.has(h)) ciclos.set(h, { ts: ms(h), cambios: [], eventos: [] }); return ciclos.get(h); };
  let plcAnt = null;
  for (const [pc, plc, campo, antes, ahora] of filas) {
    const c = ciclo(pc);
    if (plc !== plcAnt) { c.cambios.push({ campo: 'hora_plc', antes: plcAnt, ahora: plc }); plcAnt = plc; }
    c.cambios.push({ campo, antes: num(antes), ahora: num(ahora) });
  }
  for (const e of evs) ciclo(e.hora_pc).eventos.push({ hora: 0, estado: 1, texto: e.texto });
  return [...ciclos.values()].sort((a, b) => a.ts - b.ts);
}
function correr(ciclos) {
  const d = createDetector();
  return ciclos.flatMap((c) => d.alimentar(c.cambios, c.eventos, c.ts));
}
const base = { cortados: [], saltado: false, noEjecutada: false };

test('C5/C4 H4 normal: dos etapas de 60 s, grupos impares y pares', () => {
  const f = correr(cargar('c5c4-h4-normal'));
  const c5 = f.filter((r) => r.camara === 'C5');
  assert.deepStrictEqual(c5, [
    { camara: 'C5', horario: 4, etapa: 1, grupos: ['G1', 'G3', 'G5', 'G7'], inicio: ms('2026-10-14 18:06:16'), fin: ms('2026-10-14 18:07:16'), duracionS: 60, ...base },
    { camara: 'C5', horario: 4, etapa: 2, grupos: ['G2', 'G4', 'G6', 'G8'], inicio: ms('2026-10-14 18:10:16'), fin: ms('2026-10-14 18:11:16'), duracionS: 60, ...base },
  ]);
  const c4 = f.filter((r) => r.camara === 'C4');
  assert.deepStrictEqual(c4.map((r) => [r.horario, r.etapa, r.grupos.join(','), r.duracionS]),
    [[4, 1, 'G1,G3,G5,G7', 60], [4, 2, 'G2,G4,G6,G8', 60]]);
});

test('C5 corte del G3: cortados [G3], etapa sigue con el resto', () => {
  const f = correr(cargar('c5-h1-corte-g3'));
  assert.strictEqual(f.length, 2);
  assert.deepStrictEqual(f[0], { camara: 'C5', horario: 1, etapa: 1, grupos: ['G1', 'G3', 'G5', 'G7'],
    inicio: ms('2026-10-14 19:08:01'), fin: ms('2026-10-14 19:10:00'), duracionS: 119, cortados: ['G3'], saltado: false, noEjecutada: false });
  assert.deepStrictEqual([f[1].etapa, f[1].grupos, f[1].cortados, f[1].saltado], [2, ['G4', 'G6', 'G8'], [], false]);
});

test('C5 salto 18:28: etapa 1 saltada y etapa 2 no ejecutada', () => {
  const f = correr(cargar('c5-h1-salto'));
  const t = ms('2026-10-14 18:28:21');
  assert.deepStrictEqual(f, [
    { camara: 'C5', horario: 1, etapa: 1, grupos: ['G1', 'G3', 'G5', 'G7'], inicio: ms('2026-10-14 18:28:16'), fin: t, duracionS: 5, cortados: [], saltado: true, noEjecutada: false },
    { camara: 'C5', horario: 1, etapa: 2, grupos: [], inicio: t, fin: t, duracionS: 0, cortados: [], saltado: false, noEjecutada: true },
  ]);
});

test('C4 10:32: corte del G2 y salto en la etapa 2 (sin fila no ejecutada)', () => {
  const f = correr(cargar('c4-h1-corte-g2-salto'));
  assert.strictEqual(f.length, 2);
  assert.deepStrictEqual([f[0].etapa, f[0].saltado, f[0].cortados, f[0].duracionS], [1, false, [], 60]);
  assert.deepStrictEqual(f[1], { camara: 'C4', horario: 1, etapa: 2, grupos: ['G2', 'G4', 'G6', 'G8'],
    inicio: ms('2026-10-15 10:32:02'), fin: ms('2026-10-15 10:32:16'), duracionS: 14, cortados: ['G2'], saltado: true, noEjecutada: false });
});

test('C4 H3 reparto configurable: G1..G4 / G5..G8', () => {
  const f = correr(cargar('c4-h3-reparto'));
  assert.deepStrictEqual(f.map((r) => [r.horario, r.etapa, r.grupos]),
    [[3, 1, ['G1', 'G2', 'G3', 'G4']], [3, 2, ['G5', 'G6', 'G7', 'G8']]]);
});

test('Review Focus 3: hora_plc salta -3 años a mitad de etapa -> duración por tsMs (PC)', () => {
  const d = createDetector();
  const t0 = ms('2026-10-14 19:08:01');
  assert.deepStrictEqual(d.alimentar([
    { campo: 'hora_plc', antes: '2029-09-07 16:59:59', ahora: '2029-09-07 17:00:00' },
    { campo: 'C5.H1.etapa0_orden', antes: 0, ahora: 1 }, { campo: 'C5.G1.descongelando', antes: 0, ahora: 1 }], [], t0), []);
  d.alimentar([{ campo: 'hora_plc', antes: '2029-09-07 17:00:30', ahora: '2026-10-14 19:08:31' }], [], t0 + 30000);
  const [r] = d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 1, ahora: 0 }, { campo: 'C5.G1.descongelando', antes: 1, ahora: 0 }], [], t0 + 90000);
  assert.strictEqual(r.duracionS, 90);
});

test('Review Focus 4: corte del G2 y SALTO en el mismo tsMs -> una sola fila saltada con cortados [G2]', () => {
  const d = createDetector();
  const t0 = 1700000000000;
  d.alimentar([{ campo: 'C4.H2.etapa1_orden', antes: 0, ahora: 1 }, { campo: 'C4.G2.descongelando', antes: 0, ahora: 1 }, { campo: 'C4.G4.descongelando', antes: 0, ahora: 1 }], [], t0);
  const f = d.alimentar(
    [{ campo: 'C4.G2.descongelando', antes: 1, ahora: 0 }, { campo: 'C4.G4.descongelando', antes: 1, ahora: 0 }, { campo: 'C4.H2.etapa1_orden', antes: 1, ahora: 0 }],
    [{ texto: 'C4 G2 DESCONGELADO CORTADO' }, { texto: 'C4 SALTO DE DESCONGELADO' }], t0 + 10000);
  assert.deepStrictEqual(f, [{ camara: 'C4', horario: 2, etapa: 2, grupos: ['G2', 'G4'], inicio: t0, fin: t0 + 10000, duracionS: 10, cortados: ['G2'], saltado: true, noEjecutada: false }]);
});

test('arranque a mitad de etapa (antes null): no inventa inicio', () => {
  const d = createDetector();
  d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: null, ahora: 1 }], [], 0);
  assert.deepStrictEqual(d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 1, ahora: 0 }], [], 60000), []);
});

test('lineaDescongelado: tags, floats, strings y 1/0 float; timestamp = inicio', () => {
  const ts = 1700000000000;
  assert.strictEqual(lineaDescongelado({ camara: 'C4', horario: 1, etapa: 2, grupos: ['G2', 'G4'], inicio: ts, fin: ts + 14000, duracionS: 14, cortados: ['G2'], saltado: true, noEjecutada: false }),
    'descongelados,camara=C4,horario=1,etapa=2 grupos="G2,G4",cortados="G2",duracion_s=14,fin_ms=1700000014000,saltado=1,no_ejecutada=0 1700000000000000000');
});

// Salto en la etapa 1 de C5.H1 con etapa1_habilitada dada (primer ciclo: antes null, como el diff inicial)
function saltoConHab(hab) {
  const d = createDetector();
  d.alimentar([{ campo: 'C5.H1.etapa1_habilitada', antes: null, ahora: hab }, { campo: 'C5.H1.etapa0_orden', antes: null, ahora: 0 }], [], 0);
  d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 0, ahora: 1 }, { campo: 'C5.G1.descongelando', antes: 0, ahora: 1 }], [], 1000);
  return d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 1, ahora: 0 }], [{ texto: 'C5 SALTO DE DESCONGELADO' }], 6000);
}
test('salto en etapa 1 con etapa 2 habilitada -> fila no ejecutada', () => {
  assert.deepStrictEqual(saltoConHab(1).map((r) => [r.etapa, r.saltado, r.noEjecutada]), [[1, true, false], [2, false, true]]);
});
test('salto en etapa 1 con etapa 2 deshabilitada -> sin fila no ejecutada', () => {
  assert.deepStrictEqual(saltoConHab(0).map((r) => [r.etapa, r.saltado, r.noEjecutada]), [[1, true, false]]);
});

test('etapa vieja sin 1->0 (fin perdido) se descarta al abrir otra en la misma cámara', () => {
  const d = createDetector();
  d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 0, ahora: 1 }], [], 0); // su 1->0 nunca llega
  d.alimentar([{ campo: 'C5.H2.etapa0_orden', antes: 0, ahora: 1 }, { campo: 'C5.G1.descongelando', antes: 0, ahora: 1 }], [], 100000);
  const f = d.alimentar([{ campo: 'C5.H2.etapa0_orden', antes: 1, ahora: 0 }], [{ texto: 'C5 SALTO DE DESCONGELADO' }], 160000);
  assert.deepStrictEqual(f.map((r) => [r.horario, r.etapa, r.grupos, r.saltado, r.noEjecutada]), [[2, 1, ['G1'], true, false], [2, 2, [], false, true]]);
  // la vieja ya no existe: su 1->0 tardío no produce fila
  assert.deepStrictEqual(d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 1, ahora: 0 }], [], 200000), []);
});

test('interrumpir: cierra las etapas abiertas sin fin ni duración y las olvida', () => {
  const d = createDetector();
  d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 0, ahora: 1 }, { campo: 'C5.G1.descongelando', antes: 0, ahora: 1 }], [], 1000);
  assert.deepStrictEqual(d.interrumpir(), [{ camara: 'C5', horario: 1, etapa: 1, grupos: ['G1'], inicio: 1000, fin: null, duracionS: null, cortados: [], saltado: false, noEjecutada: false, interrumpida: true }]);
  assert.deepStrictEqual(d.interrumpir(), []);
  assert.deepStrictEqual(d.alimentar([{ campo: 'C5.H1.etapa0_orden', antes: 1, ahora: 0 }], [], 3 * 3600e3), []);
});

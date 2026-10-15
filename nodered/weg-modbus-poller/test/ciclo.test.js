'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createCiclo } = require('../src/ciclo');
const { createComunicacion } = require('../src/comunicacion');

function armar(lecturas, extra = {}) {
  let t = 1700000000000;
  const out = { lineas: [], estados: [], latidos: [], eventos: [] };
  const now = () => t;
  const ciclo = createCiclo({
    plc: {}, now, fotoIntervalMs: 60000,
    leerMapa: async () => lecturas.shift(),
    leerEventos: async () => new Array(688).fill(0),
    decodificar: (regs) => regs.est,
    nuevosEventos: extra.nuevosEventos || (() => ({ eventos: [], perdidos: 0, total: 0 })),
    escribir: async (l) => out.lineas.push(l),
    mqtt: { estado: (e, ts, c, x = {}) => out.estados.push({ e, c, ...x }), latido: (ts, c, x = {}) => out.latidos.push({ ts, c, ...x }), evento: (e) => out.eventos.push(e) },
    com: createComunicacion(now), log: { error() {} },
  });
  return { ciclo, out, avanza: (ms) => { t += ms; } };
}
const est = (comp, tot = 1) => ({ regs: Object.assign(new Array(688).fill(0), { est: { hora_plc: '2023-11-14 22:13:20', eventos_total: tot, 'C5.G3.comp': comp } }) });

test('primer ciclo escribe foto; cambio posterior escribe estado', async () => {
  const { ciclo, out } = armar([est(0), est(1)]);
  await ciclo(); await ciclo.vaciar();
  assert.match(out.lineas[0], /^estado,camara=general,campo=eventos_total valor=1 /); // estado inicial completo
  assert.match(out.lineas[0], /\nestado,camara=C5,grupo=G3,campo=comp valor=0 .*\nfoto /s);
  assert.ok(!out.lineas[0].includes('hora_plc valor'));
  await ciclo(); await ciclo.vaciar();
  assert.match(out.lineas[1], /^estado,camara=C5,grupo=G3,campo=comp valor=1 /);
  assert.strictEqual(out.estados.at(-1).c, true);
});
test('error de lectura: no escribe estado ni foto; _conectado = estado de la comunicacion (false recien a la 3a falla)', async () => {
  const f = { error: 'sin-conexion' };
  const { ciclo, out } = armar([est(0), f, f, f]);
  await ciclo(); await ciclo.vaciar(); out.lineas.length = 0;
  await ciclo(); await ciclo.vaciar();
  assert.ok(out.lineas.every((l) => l.startsWith('comunicacion')));
  assert.strictEqual(out.estados.length, 1, 'una falla suelta no republica el estado');
  assert.strictEqual(out.latidos.at(-1).c, true);
  await ciclo(); await ciclo();
  assert.deepStrictEqual(out.latidos.map((l) => l.c), [true, true, true, false]);
  assert.deepStrictEqual(out.estados.at(-1), { e: est(0).regs.est, c: false }); // cambio de conexion -> estado retenido
});

test('frio/estado solo con cambios, cambio de conexion o cada 30 s; frio/latido cada ciclo', async () => {
  const { ciclo, out, avanza } = armar([est(0), est(0), est(1), est(1), est(1)]);
  await ciclo(); avanza(1000); await ciclo(); avanza(1000); await ciclo(); avanza(1000); await ciclo();
  assert.strictEqual(out.latidos.length, 4);
  assert.deepStrictEqual(out.estados.map((x) => x.e['C5.G3.comp']), [0, 1]); // primera lectura y el cambio
  avanza(30000); await ciclo();
  assert.strictEqual(out.estados.length, 3); // refresco a los 30 s
});

test('mapa incompatible: _mapa y _version en latido y estado', async () => {
  const { ciclo, out } = armar([est(0), { error: 'version', version: 3 }, { error: 'largo', largo: 80, version: 2 }]);
  await ciclo(); await ciclo();
  assert.deepStrictEqual(out.latidos.at(-1), { ts: out.latidos.at(-1).ts, c: true, _mapa: 'incompatible', _version: 3 });
  assert.strictEqual(out.estados.at(-1)._mapa, 'incompatible');
  await ciclo();
  assert.strictEqual(out.latidos.at(-1)._version, 2);
});

test('etapa abierta + corte de 3 h + etapa apagada al volver: interrumpida, sin fila de 3 h', async () => {
  const e = (orden) => ({ regs: Object.assign(new Array(688).fill(0), { est: { hora_plc: '2023-11-14 22:13:20', eventos_total: 1, 'C5.H1.etapa0_orden': orden, 'C5.G1.descongelando': orden } }) });
  const f = { error: 'sin-conexion' };
  const lect = [e(0), e(1)];
  const { ciclo, out, avanza } = armar(lect);
  await ciclo(); avanza(1000); await ciclo();
  for (let i = 0; i < 3 * 3600; i += 60) { lect.push(f); avanza(60000); await ciclo(); }
  lect.push(e(0), e(0)); avanza(1000); await ciclo(); avanza(1000); await ciclo(); await ciclo.vaciar();
  const todas = out.lineas.join('\n').split('\n');
  const filas = todas.filter((l) => l.startsWith('descongelados'));
  assert.strictEqual(filas.length, 1);
  assert.match(filas[0], /^descongelados,camara=C5,horario=1,etapa=1 grupos="G1",cortados="",saltado=0,no_ejecutada=0,interrumpida=1 1700000001000000000$/);
  assert.ok(!/duracion_s/.test(filas[0]));
  // al volver, arranque de cero: estado inicial completo y foto
  const tras = todas.slice(todas.findLastIndex((l) => l.startsWith('comunicacion conectado=false')) + 1);
  assert.ok(tras.some((l) => l.startsWith('estado,camara=general,campo=eventos_total')));
  assert.ok(tras.some((l) => l.startsWith('foto ')));});
test('eventos_total cambia: lee eventos y los publica; perdidos va a comunicacion', async () => {
  const { ciclo, out } = armar([est(0, 1), est(0, 5)], {
    nuevosEventos: (r, ant) => { assert.strictEqual(ant, 1); return { eventos: [{ hora: 1, estado: 1, texto: 'x' }], perdidos: 2, total: 5 }; },
  });
  await ciclo(); await ciclo(); await ciclo.vaciar();
  assert.deepStrictEqual(out.eventos.length, 1);
  assert.match(out.lineas.at(-1), /\neventos .*\ncomunicacion .*eventos_perdidos=2i/s);
});

test('Influx caido: las lineas se guardan, acotadas, y salen en orden al volver', async () => {
  const lecturas = [est(0), est(1), est(0), est(1)];
  let ok = false; const enviado = []; const errores = [];
  let t = 1700000000000;
  const ciclo = createCiclo({
    plc: {}, now: () => (t += 1000), fotoIntervalMs: 1e12, maxPendientes: 3,
    leerMapa: async () => lecturas.shift(), leerEventos: async () => null,
    decodificar: (r) => r.est, nuevosEventos: () => ({ eventos: [], perdidos: 0, total: 0 }),
    escribir: async (l) => { if (!ok) throw new Error('caido'); enviado.push(l); },
    mqtt: { estado() {}, latido() {}, evento() {} }, com: createComunicacion(() => t), log: { error: (m) => errores.push(m) },
  });
  await ciclo(); await ciclo.vaciar(); await ciclo(); await ciclo.vaciar();
  assert.ok(ciclo.pendientes() <= 3);
  assert.ok(errores.some((m) => /descartaron/.test(m)));
  ok = true; await ciclo(); await ciclo.vaciar();
  const todo = enviado.join('\n');
  assert.match(todo, /lineas_descartadas=\d+i/);
  assert.strictEqual(ciclo.pendientes(), 0);
});
test('mapa incompatible: se avisa una vez y se expone', async () => {
  const llamadas = [];
  const errores = [];
  const c2 = createCiclo({ plc: {}, now: () => 1, leerMapa: (() => { const l = [{ error: 'version', version: 3 }, { error: 'version', version: 3 }, est(0)]; return async () => l.shift(); })(),
    leerEventos: async () => null, decodificar: (r) => r.est, nuevosEventos: () => ({}), escribir: async () => {}, mqtt: { estado() {}, latido() {}, evento() {} },
    com: createComunicacion(() => 1), log: { error: (m) => errores.push(m) }, onMapa: (m) => llamadas.push(m) });
  await c2(); await c2(); await c2();
  assert.strictEqual(errores.filter((m) => /incompatible/.test(m)).length, 1);
  assert.deepStrictEqual(llamadas, [{ error: 'version', version: 3 }, null]);
});

function mk(over = {}) {
  let t = 1700000000000;
  const o = { enviado: [], errores: [] };
  o.ciclo = createCiclo({
    plc: {}, now: () => (t += 1000), fotoIntervalMs: 1e12,
    leerMapa: async () => o.lectura(), leerEventos: async () => null,
    decodificar: (r) => r.est, nuevosEventos: () => ({ eventos: [], perdidos: 0, total: 0 }),
    escribir: async (l) => o.escribir(l), mqtt: { estado() {}, latido() {}, evento() {} },
    com: createComunicacion(() => t), log: { error: (m) => o.errores.push(m) }, ...over,
  });
  return o;
}
const conVal = (comp, extra = {}) => ({ regs: Object.assign(new Array(688).fill(0), { est: { hora_plc: '2023-11-14 22:13:20', eventos_total: 1, 'C5.G3.comp': comp, ...extra } }) });

test('NaN/Infinity no se escriben y se avisa una vez por campo', async () => {
  const o = mk(); const seq = [conVal(0, { 'param.x': NaN }), conVal(1, { 'param.x': Infinity })];
  o.lectura = () => seq.shift(); o.escribir = async (l) => o.enviado.push(l);
  await o.ciclo(); await o.ciclo.vaciar(); await o.ciclo(); await o.ciclo.vaciar();
  assert.ok(!/NaN|Infinity/.test(o.enviado.join('\n')));
  assert.strictEqual(o.errores.filter((m) => /param\.x/.test(m)).length, 1);
});

test('desborde durante una escritura lenta exitosa no borra lineas nuevas', async () => {
  let soltar; const o = mk({ maxPendientes: 3 });
  const seq = [conVal(0), conVal(1), conVal(0), conVal(1)];
  o.lectura = () => seq.shift();
  o.escribir = (l) => { o.enviado.push(l); return o.enviado.length === 1 ? new Promise((r) => { soltar = r; }) : Promise.resolve(); };
  await o.ciclo();            // lote 1 en vuelo (bloqueado)
  await o.ciclo(); await o.ciclo(); await o.ciclo(); // llegan más líneas y se recorta la cola
  soltar(); await o.ciclo.vaciar();
  assert.strictEqual(o.ciclo.pendientes(), 0);
  assert.ok(o.enviado.length >= 2, 'las lineas nuevas no enviadas siguen en la cola y salen');
});

test('reintento automatico sin lineas nuevas', async () => {
  const o = mk({ reintentoMs: 10 }); let ok = false;
  o.lectura = () => conVal(0); o.escribir = async (l) => { if (!ok) throw new Error('caido'); o.enviado.push(l); };
  await o.ciclo(); await o.ciclo.vaciar();
  assert.ok(o.ciclo.pendientes() > 0);
  ok = true; await new Promise((r) => setTimeout(r, 60)); await o.ciclo.vaciar();
  assert.strictEqual(o.ciclo.pendientes(), 0); assert.ok(o.enviado.length > 0);
});

test('lineas_descartadas solo se escribe cuando cambia', async () => {
  const o = mk({ maxPendientes: 1 }); let ok = false;
  o.lectura = () => conVal(0);
  o.escribir = async (l) => { if (!ok) throw new Error('caido'); o.enviado.push(l); };
  await o.ciclo(); await o.ciclo.vaciar(); // descarta
  ok = true; await o.ciclo.vaciar();
  await o.ciclo(); await o.ciclo.vaciar(); await o.ciclo(); await o.ciclo.vaciar(); await o.ciclo(); await o.ciclo.vaciar();
  const n = o.enviado.join('\n').split('\n').filter((l) => l.startsWith('comunicacion') && l.includes('lineas_descartadas')).length;
  assert.ok(n <= 2, `comunicacion con descartadas: ${n}`);
});
test('descongelado terminado se escribe como línea descongelados', async () => {
  const e = (orden, desc, tot = 1) => ({ regs: Object.assign(new Array(688).fill(0), { est: { hora_plc: '2023-11-14 22:13:20', eventos_total: tot, 'C5.H1.etapa0_orden': orden, 'C5.G1.descongelando': desc } }) });
  const { ciclo, out, avanza } = armar([e(0, 0), e(1, 1), e(0, 0)]);
  await ciclo(); avanza(1000); await ciclo(); avanza(60000); await ciclo(); await ciclo.vaciar();
  assert.match(out.lineas.join('\n'), /^descongelados,camara=C5,horario=1,etapa=1 grupos="G1",cortados="",duracion_s=60,fin_ms=1700000061000,saltado=0,no_ejecutada=0 1700000001000000000$/m);
});

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mando-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const settings = require('../src/services/settings');
const m = require('../src/services/mando');
const createMandoRouter = require('../src/routes/mando');

// Poller falso por HTTP: guarda lo recibido y contesta lo que se le diga ('colgado' = nunca contesta).
async function poller(respuesta = { resultado: 1, motivo: 0 }) {
  const visto = { pedidos: [] };
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      if (respuesta === 'colgado') return;
      visto.pedidos.push({ token: req.headers['x-mando-token'], body: JSON.parse(b) });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(respuesta));
    });
  });
  await new Promise((r) => srv.listen(0, r));
  visto.url = `http://127.0.0.1:${srv.address().port}`;
  visto.close = () => { srv.closeAllConnections(); srv.close(); };
  return visto;
}

const ESTADO = () => ({ _ts: Date.now(), _conectado: true, 'C5.G3.modo': 'MANUAL', 'C5.G3.comp': 0, 'C5.G3.res': 1, 'C5.G3.res_manual_resta_min': 30, 'param.res_man_max_min': 90, 'C4.H2.hora': '10:30' });

async function servir({ rol = 'operar', user = 'ana', url, estado = ESTADO(), token = 'tok', isReplica = false, t = { v: 1e6 }, timeoutMs, escritos = [] }, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: rol, user }; next(); });
  app.use('/api/mando', createMandoRouter({
    pollerUrl: url, token, getEstado: () => estado, userId: settings.mandoUserId,
    escribir: async (l) => { escritos.push(l); }, isReplica, ahora: () => t.v, timeoutMs,
  }));
  const srv = app.listen(0);
  const f = (body) => fetch(`http://127.0.0.1:${srv.address().port}/api/mando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  try { return await fn(f); } finally { srv.closeAllConnections(); srv.close(); }
}

test('operador 403 en cualquier comando, sin tocar el poller', async () => {
  const p = await poller();
  await servir({ rol: 'operador', url: p.url }, async (f) => {
    assert.equal((await f({ comando: 1, camara: 'C5', grupo: 3, valor: 0 })).status, 403);
    assert.equal((await f({ comando: 20, camara: 'C5', horario: 1, valor: 600 })).status, 403);
  });
  assert.equal(p.pedidos.length, 0); p.close();
});

test('operar: 403 en el 20 (hora) y 200 en el 1 (modo); admin manda el 20', async () => {
  const p = await poller();
  await servir({ url: p.url }, async (f) => {
    assert.equal((await f({ comando: 20, camara: 'C5', horario: 1, valor: 600 })).status, 403);
    const r = await f({ comando: 1, camara: 'C5', grupo: 3, valor: 0 });
    assert.equal(r.status, 200); assert.equal(r.body.resultado, 1); assert.equal(r.body.texto, 'Listo');
  });
  await servir({ rol: 'admin', user: 'jefe', url: p.url }, async (f) => {
    assert.equal((await f({ comando: 20, camara: 'C5', horario: 1, valor: 600 })).status, 200);
  });
  // destino = cámara·1000 + grupo·10 + horario (1 = C5); el token va en el header
  const [a, b] = p.pedidos;
  assert.deepEqual([a.body.comando, a.body.destino, a.body.argumento, a.token], [1, 1030, 0, 'tok']);
  assert.deepEqual([b.body.comando, b.body.destino, b.body.argumento], [20, 1001, 600]);
  p.close();
});

test('validación: grupo 9, hora 2460, cámara, comando desconocido → 400', async () => {
  const p = await poller();
  await servir({ rol: 'superadmin', url: p.url }, async (f) => {
    for (const b of [
      { comando: 1, camara: 'C5', grupo: 9, valor: 0 }, { comando: 1, camara: 'C5', valor: 0 }, { comando: 1, camara: 'C9', grupo: 1, valor: 0 },
      { comando: 1, camara: 'C5', grupo: 1, valor: 3 }, { comando: 1, camara: 'C5', grupo: 1, valor: 0.5 },
      { comando: 20, camara: 'C5', horario: 1, valor: 2460 }, { comando: 20, camara: 'C5', horario: 5, valor: 600 },
      { comando: 99, camara: 'C5', valor: 0 }, { comando: 7, valor: 0 }, { comando: 22, camara: 'C5', horario: 1, valor: 30001 },
    ]) assert.equal((await f(b)).status, 400, JSON.stringify(b));
  });
  assert.equal(p.pedidos.length, 0); p.close();
});

test('catálogo: destinos, roles y argumentos del mapa', () => {
  assert.deepEqual(Object.keys(m.CATALOGO).map(Number), [1, 2, 3, 4, 5, 6, 7, 20, 21, 22, 23, 24, 25, 30, 31]);
  const d = (c) => m.CATALOGO[c].destino;
  assert.deepEqual([1, 2, 3, 4, 6, 31].map(d), Array(6).fill('cg'));
  assert.deepEqual([20, 21, 22, 23, 24].map(d), Array(5).fill('ch'));
  assert.deepEqual([5, 25].map(d), ['c', 'c']);
  assert.deepEqual([7, 30].map(d), ['-', '-']);
  assert.deepEqual(Object.entries(m.CATALOGO).filter(([, v]) => v.rol === 'operar').map(([k]) => +k), [1, 2, 3, 4, 5, 6, 7]);
  const ok = (c, v) => m.CATALOGO[c].valida(v, { resMax: 120 });
  assert.ok(ok(7, 1) && ok(7, 2) && !ok(7, 0));
  assert.ok(ok(5, 0) && !ok(5, 1) && ok(31, 0) && !ok(6, 1));
  assert.ok(ok(20, 0) && ok(20, 2359) && !ok(20, 2360) && !ok(20, 2400));
  assert.ok(ok(22, 10001) && ok(22, 20900) && !ok(22, 10000) && !ok(22, 30001) && !ok(22, 10901));
  assert.ok(ok(23, 11) && ok(23, 20) && !ok(23, 12) && !ok(23, 31));
  assert.ok(ok(24, 1) && ok(24, 254) && !ok(24, 0) && !ok(24, 255));
  assert.ok(ok(25, 60) && !ok(25, 61));
  assert.ok(ok(30, 1000) && ok(30, 3999) && !ok(30, 4000) && !ok(30, 999));
});

test('resistencia: 0 apaga, 1..tope válido, más no; tope del estado vivo (120 por defecto, 0 = sin tope)', async () => {
  const p = await poller();
  const r = (estado, valor, user) => servir({ url: p.url, estado, user }, (f) => f({ comando: 4, camara: 'C5', grupo: 3, valor }));
  assert.equal((await r(ESTADO(), 0, 'r1')).status, 200);
  assert.equal((await r(ESTADO(), 90, 'r2')).status, 200);
  assert.equal((await r(ESTADO(), 91, 'r3')).status, 400);
  assert.equal((await r({ ...ESTADO(), 'param.res_man_max_min': 0 }, 65535, 'r4')).status, 200);
  assert.equal((await r(null, 120, 'r5')).status, 200);   // sin estado: tope documentado de 120
  assert.equal((await r(null, 121, 'r6')).status, 400);
  p.close();
});

test('el usuario se traduce a un id estable (tabla en settings)', async () => {
  const a = settings.mandoUserId('Ana'), b = settings.mandoUserId('beto');
  assert.ok(Number.isInteger(a) && a >= 1 && b > a && b <= 65535);
  assert.equal(settings.mandoUserId('ANA'), a);
  assert.equal(settings.mandoUserId('beto'), b);
  const p = await poller();
  await servir({ url: p.url, user: 'ana' }, (f) => f({ comando: 5, camara: 'C4', valor: 0 }));
  assert.equal(p.pedidos[0].body.usuario, a);
  assert.deepEqual([p.pedidos[0].body.destino, p.pedidos[0].body.argumento], [2000, 0]);
  p.close();
});

test('auditoría: valor_anterior del estado vivo; vencido → null y "sin dato"; también lo rechazado', async () => {
  const p = await poller({ resultado: 2, motivo: 2 }); const esc = [];
  await servir({ url: p.url, escritos: esc }, async (f) => {
    const r = await f({ comando: 1, camara: 'C5', grupo: 3, valor: 0 });
    assert.deepEqual([r.body.resultado, r.body.motivo, r.body.texto], [2, 2, 'El PLC no lo hizo: EL GRUPO NO ESTA EN MANUAL']);
  });
  assert.equal(esc.length, 1);
  assert.match(esc[0], /^mando,usuario=ana,camara=C5,comando=1 destino=1030,valor_anterior=1,valor_nuevo=0,resultado=2,motivo=2,texto="[^"]*\(antes: manual\)[^"]*",respuesta="El PLC no lo hizo: EL GRUPO NO ESTA EN MANUAL" 1000000000000$/);   // ts 1e6 ms en ns
  // estado vencido (más de 2 min), desconectado o ausente
  let i = 0;
  for (const estado of [{ ...ESTADO(), _ts: Date.now() - 5 * 60e3 }, { ...ESTADO(), _conectado: false }, null]) {
    const e2 = [];
    await servir({ url: p.url, user: 'zeta' + i++, estado, escritos: e2, t: { v: Date.now() } }, (f) => f({ comando: 1, camara: 'C5', grupo: 3, valor: 0 }));
    assert.doesNotMatch(e2[0], /valor_anterior/);
    assert.match(e2[0], /\(antes: sin dato\)/);
  }
  const e = ESTADO();
  assert.equal(m.valorAnterior(20, 'C4', null, 2, e), 1030);
  assert.equal(m.valorAnterior(4, 'C5', 3, null, e), 30);
  assert.equal(m.valorAnterior(2, 'C5', 3, null, e), 0);
  assert.equal(m.valorAnterior(2, 'C5', 4, null, e), null);   // clave que el estado no trae
  p.close();
});

test('un segundo pedido del mismo usuario dentro de 2 s → 429 (y no consume el límite si fue 400)', async () => {
  const p = await poller(); const t = { v: 1e6 };
  await servir({ url: p.url, t, user: 'rita' }, async (f) => {
    const b = { comando: 5, camara: 'C5', valor: 0 };
    assert.equal((await f({ comando: 5, valor: 0 })).status, 400);
    assert.equal((await f(b)).status, 200);
    t.v += 1500; assert.equal((await f(b)).status, 429);
    t.v += 600; assert.equal((await f(b)).status, 200);
  });
  assert.equal(p.pedidos.length, 2); p.close();
});

test('poller que no responde → resultado 0 y el texto no dice que no se hizo', async () => {
  const p = await poller('colgado'); const esc = [];
  await servir({ url: p.url, timeoutMs: 100, escritos: esc }, async (f) => {
    const r = await f({ comando: 5, camara: 'C5', valor: 0 });
    assert.equal(r.status, 200); assert.equal(r.body.resultado, 0);
    assert.ok(r.body.texto.startsWith('El PLC no respondió'));
    assert.match(r.body.texto, /revisá el estado antes de repetir/);
    assert.doesNotMatch(r.body.texto, /no se hizo/i);
  });
  assert.equal(esc.length, 1); p.close();
  await servir({ url: 'http://127.0.0.1:1', user: 'q', timeoutMs: 100 }, async (f) => {
    assert.equal((await f({ comando: 5, camara: 'C5', valor: 0 })).body.resultado, 0);
  });
});

test('resultados 0 del poller, 3, 4 y 5 en palabras', async () => {
  const casos = [[{ resultado: 0, motivo: 'sin-conexion' }, /^Sin conexión con el PLC.*revisá el estado antes de repetir/],
    [{ resultado: 0, motivo: 'canal-incompatible' }, /revisá el estado antes de repetir/],
    [{ resultado: 3, motivo: 0 }, /trama/i], [{ resultado: 4, motivo: 0 }, /desactivado en el panel/], [{ resultado: 5, motivo: 0 }, /no conoce/]];
  let i = 0;
  for (const [resp, re] of casos) {
    const p = await poller(resp);
    await servir({ url: p.url, user: 'u' + i++ }, async (f) => {
      const r = await f({ comando: 5, camara: 'C5', valor: 0 });
      assert.equal(r.body.resultado, resp.resultado); assert.match(r.body.texto, re);
    });
    p.close();
  }
});

test('textoMotivo en espejo de GVL_MANDO.MOTIVOS', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 8, 9].map((c) => m.textoMotivo(c)), ['', 'GRUPO FUERA DE SERVICIO', 'EL GRUPO NO ESTA EN MANUAL', 'RESISTENCIA BLOQUEADA',
    'APAGUE COMPRESOR Y EVAPORADOR', 'CADA ETAPA NECESITA UN GRUPO', 'NO HAY DESCONGELADO EN CURSO', 'NO HAY ARRANQUE PENDIENTE', 'VALOR FUERA DE RANGO']);
  assert.equal(m.textoMotivo(5, 90), 'TIEMPO: 1 A 90 MIN');
  assert.equal(m.textoMotivo(5, 0), 'TIEMPO: 1 A 0 MIN');
  assert.match(m.textoMotivo(77), /77/);
});

test('modo réplica 409, sin token 503: no se manda nada', async () => {
  const p = await poller();
  await servir({ url: p.url, isReplica: true }, async (f) => { assert.equal((await f({ comando: 5, camara: 'C5', valor: 0 })).status, 409); });
  await servir({ url: p.url, token: '' }, async (f) => {
    const r = await f({ comando: 5, camara: 'C5', valor: 0 });
    assert.equal(r.status, 503); assert.equal(r.body.error, 'mando no configurado');
  });
  assert.equal(p.pedidos.length, 0); p.close();
});

test('no se audita lo que no llega al poller (403, 400, 429)', async () => {
  const p = await poller(); const esc = [];
  await servir({ url: p.url, escritos: esc, user: 'w' }, async (f) => {
    await f({ comando: 20, camara: 'C5', horario: 1, valor: 600 }); await f({ comando: 1, camara: 'C5', grupo: 9, valor: 0 });
    await f({ comando: 5, camara: 'C5', valor: 0 }); await f({ comando: 5, camara: 'C5', valor: 0 });
  });
  assert.equal(esc.length, 1); p.close();
});

test('rol operar: se crea desde la UI, no aparece solo desde el .env', () => {
  process.env.OPERADOR_PASSWORD = 'x'; process.env.AUTH_PASSWORD = 'y';
  assert.ok(!settings.getUsersFull().some((u) => u.role === 'operar'));
  settings.createUser({ user: 'jefe', role: 'superadmin' }, { user: 'turno1', role: 'operar', password: 'clave1' });
  assert.deepEqual(settings.getUsersFull().filter((u) => u.role === 'operar').map((u) => u.user), ['turno1']);
  assert.ok(settings.ROLES.includes('operar'));
});

test('comando que no es un entero del catálogo → 400 sin llegar al poller ni tirar la API', async () => {
  const p = await poller();
  await servir({ rol: 'superadmin', url: p.url }, async (f) => {
    for (const comando of ['__proto__', 'constructor', 'toString', '1', 1.5, null, [1]]) {
      assert.equal((await f({ comando, camara: 'C5', grupo: 1, valor: 0 })).status, 400, String(comando));
    }
  });
  assert.equal(p.pedidos.length, 0); p.close();
});

test('modo previo: AUTO → MANUAL audita valor_anterior=0 (nombres del poller)', async () => {
  const p = await poller(); const esc = [];
  await servir({ url: p.url, escritos: esc, estado: { ...ESTADO(), 'C5.G3.modo': 'AUTO' } }, (f) => f({ comando: 1, camara: 'C5', grupo: 3, valor: 1 }));
  assert.match(esc[0], /valor_anterior=0,valor_nuevo=1,/);
  assert.match(esc[0], /\(antes: automático\)/);
  for (const [n, v] of [['MANUAL', 1], ['FUERA DE SERVICIO', 2]]) assert.equal(m.valorAnterior(1, 'C5', 3, null, { 'C5.G3.modo': n }), v);
  p.close();
});

test('si el id de usuario falla no se manda ni se audita nada: 500', async () => {
  const p = await poller(); const esc = [];
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: 'admin', user: 'x' }; next(); });
  app.use(createMandoRouter({ pollerUrl: p.url, token: 't', getEstado: () => null, userId: () => { throw new Error('disco'); }, escribir: async (l) => esc.push(l) }));
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comando: 5, camara: 'C5', valor: 0 }) });
  srv.closeAllConnections(); srv.close();
  assert.equal(r.status, 500); assert.equal(p.pedidos.length, 0); assert.equal(esc.length, 0); p.close();
});

test('línea de auditoría: usuario con espacio, coma, =, barra y salto de línea no rompe el protocolo', () => {
  const l = m.lineaMando({ usuario: 'a b,c=d\\e\nf', camara: 'C5', comando: 5, destino: 1000, anterior: null, valor: 0, resultado: 1, motivo: 0, texto: 'x\r\ny\\"z', respuesta: 'Listo', ts: 1e6 });
  assert.equal(l.split('\n').length, 1);
  assert.ok(l.startsWith('mando,usuario=a\\ b\\,c\\=d\\\\e\\ f,camara=C5,comando=5 destino=1000,'));
  assert.ok(l.includes('texto="x y\\\\\\"z"'));
});

test('textoResultado: motivo vencido dice que no se mandó', () => {
  const t = require('../src/services/mando').textoResultado(0, 'vencido');
  assert.equal(t, 'El pedido tardó demasiado y no se mandó; revisá el estado antes de repetir');
});

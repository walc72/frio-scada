'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const ModbusRTU = require('modbus-serial');
const { crearServidor } = require('./servidorFalso');
const fixtures = require('./fixtures/mapa-v2.json');
const { crc16Modbus, createMando } = require('../src/mando');
const { crearManejador } = require('../src/apiMando');
const { decodificar } = require('../src/mapa');

const PEDIDO = { comando: 1, destino: 1031, argumento: 0, usuario: 12 };

async function armar(opciones = {}, { mapaV3 = true } = {}) {
  const srv = await crearServidor(fixtures);
  srv.mapaV3 = mapaV3;
  const cliente = new ModbusRTU();
  await cliente.connectTCP('127.0.0.1', { port: srv.port });
  const mando = createMando({ cliente, unidad: 1, ...opciones });
  const cerrar = async () => { await new Promise((r) => cliente.close(r)); await srv.close(); };
  return { srv, mando, cerrar };
}
const escrituras = (srv) => srv.log.filter((e) => e.addr !== undefined);

test('CRC-16/MODBUS: vector "123456789" -> 0x4B37 (por bytes) y crc16Modbus coincide en palabras completas', () => {
  const porBytes = (bs) => { let c = 0xFFFF; for (const b of bs) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? (c >> 1) ^ 0xA001 : c >> 1; } return c; };
  assert.equal(porBytes(Buffer.from('123456789')), 0x4B37);
  // 8 bytes "12345678" = 4 palabras con el byte alto primero
  assert.equal(crc16Modbus([0x3132, 0x3334, 0x3536, 0x3738]), porBytes(Buffer.from('12345678')));
  // la palabra impar: "123456789" + un 0 final no es el vector, pero "9" en el byte alto da el CRC de 9 bytes + 0
  assert.equal(crc16Modbus([0x3132, 0x3334, 0x3536, 0x3738, 0x3900]), porBytes([...Buffer.from('123456789'), 0]));
});

test('orden de escritura: primero 700..704, despues 705..706 con el CRC; resultado del PLC', async () => {
  const { srv, mando, cerrar } = await armar();
  try {
    srv.mando.regs[8] = 7; // eco actual
    assert.deepEqual(await mando.pedir(PEDIDO), { resultado: 1, motivo: 0 });
    const w = escrituras(srv);
    assert.equal(w.length, 2);
    assert.equal(w[0].addr, 700);
    assert.deepEqual(w[0].valores, [8, 1, 1031, 0, 12]); // token = eco + 1
    assert.equal(w[1].addr, 705);
    assert.equal(w[1].valores.length, 2);
    assert.notEqual(w[1].valores[0], 0);
    assert.equal(w[1].valores[1], crc16Modbus(w[0].valores));
  } finally { await cerrar(); }
});

test('token = eco % 0xFFFF + 1: con eco 65535 vuelve a 1, nunca 0; el disparador cambia', async () => {
  const { srv, mando, cerrar } = await armar();
  try {
    srv.mando.regs[8] = 0xFFFF; srv.mando.regs[5] = 0xFFFF;
    await mando.pedir(PEDIDO);
    await mando.pedir(PEDIDO);
    const w = escrituras(srv);
    assert.equal(w[0].valores[0], 1);
    assert.equal(w[2].valores[0], 2);
    assert.equal(w[1].valores[0], 1); // disparador 65535 -> 1
    assert.equal(w[3].valores[0], 2);
  } finally { await cerrar(); }
});

// Review Focus 3: el segundo pedido no empieza a escribir hasta que el primero tiene su eco
test('dos pedir simultaneos: el segundo FC16 sale despues del eco del primero', async () => {
  const { srv, mando, cerrar } = await armar();
  srv.mando.demoraMs = 150;
  try {
    const [a, b] = await Promise.all([mando.pedir(PEDIDO), mando.pedir({ ...PEDIDO, usuario: 13 })]);
    assert.deepEqual([a.resultado, b.resultado], [1, 1]);
    assert.deepEqual(srv.log.map((e) => (e.eco !== undefined ? 'eco' : e.addr)), [700, 705, 'eco', 700, 705, 'eco']);
    assert.deepEqual(srv.log.filter((e) => e.eco !== undefined).map((e) => e.eco), [1, 2]);
  } finally { await cerrar(); }
});

test('sin eco: sin-respuesta a los 5 s del reloj inyectado (resultado 0 = desconocido)', async () => {
  let t = 1000;
  const { srv, mando, cerrar } = await armar({ ahora: () => t, dormir: async (ms) => { t += ms; } });
  srv.mando.responde = false;
  try {
    assert.deepEqual(await mando.pedir(PEDIDO), { resultado: 0, motivo: 'sin-respuesta' });
    assert.ok(t - 1000 >= 5000 && t - 1000 < 5200);
    assert.equal(escrituras(srv).length, 2);
  } finally { await cerrar(); }
});

// Review Focus 4: la llave se lee fresca de 309, no de una foto vieja
test('llave apagada: ninguna escritura y resultado 4', async () => {
  const { srv, mando, cerrar } = await armar();
  srv.mando.llave = false;
  try {
    assert.deepEqual(await mando.pedir(PEDIDO), { resultado: 4, motivo: 0 });
    assert.equal(escrituras(srv).length, 0);
    srv.mando.llave = true; // se prende: el siguiente pedido ya la ve, sin cache
    assert.equal((await mando.pedir(PEDIDO)).resultado, 1);
  } finally { await cerrar(); }
});

test('mapa v2 (sin canal): ninguna escritura', async () => {
  const { srv, mando, cerrar } = await armar({}, { mapaV3: false });
  try {
    assert.deepEqual(await mando.pedir(PEDIDO), { resultado: 0, motivo: 'canal-incompatible' });
    assert.equal(escrituras(srv).length, 0);
  } finally { await cerrar(); }
});

test('version de canal distinta de 1 (707): ninguna escritura', async () => {
  const { srv, mando, cerrar } = await armar();
  srv.mando.regs[7] = 2;
  try {
    assert.deepEqual(await mando.pedir(PEDIDO), { resultado: 0, motivo: 'canal-incompatible' });
    assert.equal(escrituras(srv).length, 0);
  } finally { await cerrar(); }
});

test('latir escribe el 712 con un valor distinto de 0 que cambia', async () => {
  const { srv, mando, cerrar } = await armar();
  try {
    const vistos = [];
    for (let i = 0; i < 3; i++) { await mando.latir(); vistos.push(srv.mando.regs[12]); }
    assert.ok(vistos.every((v) => v !== 0));
    assert.equal(new Set(vistos).size, 3);
    assert.ok(escrituras(srv).every((w) => w.addr === 712));
  } finally { await cerrar(); }
});

test('latir no se mete entre las dos escrituras de un pedido', async () => {
  const { srv, mando, cerrar } = await armar();
  srv.mando.demoraMs = 100;
  try {
    await Promise.all([mando.pedir(PEDIDO), mando.latir(), mando.latir()]);
    assert.deepEqual(escrituras(srv).map((w) => w.addr), [700, 705, 712]); // el 2do latir no se apila
  } finally { await cerrar(); }
});

test('mapa v3: decodifica llave, sin mando remoto y version del canal; v2 no los trae', () => {
  const regs = fixtures[0].regs.slice();
  assert.equal(decodificar(regs).mando_remoto_hab, undefined);
  regs[1] = 3; regs[309] = 0b10; regs[310] = 1;
  const d = decodificar(regs);
  assert.deepEqual([d.mando_remoto_hab, d.sin_mando_remoto, d.canal_version], [0, 1, 1]);
});

function pedirHttp(manejador, { token, cuerpo }) {
  return new Promise((resolve) => {
    const s = http.createServer(manejador).listen(0, '127.0.0.1', () => {
      const req = http.request({ port: s.address().port, method: 'POST', path: '/mando', headers: token ? { 'X-Mando-Token': token } : {} }, (res) => {
        let d = ''; res.on('data', (c) => { d += c; });
        res.on('end', () => s.close(() => resolve({ code: res.statusCode, body: d })));
      });
      req.end(cuerpo);
    });
  });
}

test('/mando: sin token o con otro -> 401 y no pide nada; cuerpo malo -> 400; bueno -> resultado', async () => {
  const pedidos = [];
  const mando = { pedir: async (p) => { pedidos.push(p); return { resultado: 1, motivo: 0 }; } };
  const m = crearManejador({ mando, token: 'secreto' });
  const ok = JSON.stringify(PEDIDO);
  assert.equal((await pedirHttp(m, { cuerpo: ok })).code, 401);
  assert.equal((await pedirHttp(m, { token: 'otro', cuerpo: ok })).code, 401);
  assert.equal((await pedirHttp(m, { token: 'secreto', cuerpo: '{no json' })).code, 400);
  assert.equal((await pedirHttp(m, { token: 'secreto', cuerpo: JSON.stringify({ ...PEDIDO, comando: 70000 }) })).code, 400);
  assert.equal((await pedirHttp(m, { token: 'secreto', cuerpo: JSON.stringify({ ...PEDIDO, usuario: 1.5 }) })).code, 400);
  assert.equal((await pedirHttp(m, { token: 'secreto', cuerpo: JSON.stringify({ comando: 1 }) })).code, 400);
  assert.equal(pedidos.length, 0);
  const r = await pedirHttp(m, { token: 'secreto', cuerpo: ok });
  assert.equal(r.code, 200);
  assert.deepEqual(JSON.parse(r.body), { resultado: 1, motivo: 0 });
  assert.deepEqual(pedidos, [PEDIDO]);
});

test('/mando: sin MANDO_TOKEN configurado el canal queda cerrado (401 aun sin header)', async () => {
  const m = crearManejador({ mando: { pedir: async () => assert.fail() }, token: '' });
  assert.equal((await pedirHttp(m, { cuerpo: JSON.stringify(PEDIDO) })).code, 401);
});

test('latir con mapa v2 (sin canal): ninguna escritura', async () => {
  const { srv, mando, cerrar } = await armar({}, { mapaV3: false });
  try {
    assert.equal(await mando.latir(), false);
    assert.equal(escrituras(srv).length, 0);
  } finally { await cerrar(); }
});

test('dos getOrCreate simultaneos abren una sola conexion', async () => {
  const connections = require('../src/connections');
  const srv = await crearServidor(fixtures);
  try {
    const [a, b] = await Promise.all([connections.getOrCreate('127.0.0.1', srv.port), connections.getOrCreate('127.0.0.1', srv.port)]);
    assert.ok(a && a === b);
  } finally { connections.closeAll(); await srv.close(); }
});

test('pedido que esperó mas de 10 s en la cola: vencido y ninguna escritura', async () => {
  let t = 1000;
  const { srv, mando, cerrar } = await armar({ ahora: () => t });
  try {
    const p = mando.pedir(PEDIDO);
    t += 10001; // la lectura previa corre despues de la llegada
    assert.deepEqual(await p, { resultado: 0, motivo: 'vencido' });
    assert.equal(escrituras(srv).length, 0);
  } finally { await cerrar(); }
});

test('/mando: MANDO_TOKEN change-me se trata como sin configurar (401 aun con ese header)', async () => {
  const m = crearManejador({ mando: { pedir: async () => assert.fail() }, token: 'change-me' });
  assert.equal((await pedirHttp(m, { token: 'change-me', cuerpo: JSON.stringify(PEDIDO) })).code, 401);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { plcDe, aplicarPlc, vigilarConfig } = require('../src/configPlc');

test('aplicarPlc: sin cambios no cierra; con cambios actualiza el mismo objeto y cierra', () => {
  const plc = plcDe({ plc: { ip: '10.0.0.1' } });
  let cierres = 0;
  assert.equal(aplicarPlc(plc, { plc: { ip: '10.0.0.1' } }, () => cierres++), false);
  assert.equal(cierres, 0);
  assert.equal(aplicarPlc(plc, { plc: { ip: '10.0.0.2', unitId: 1 } }, () => cierres++), true);
  assert.deepEqual(plc, { ip: '10.0.0.2', port: 502, unitId: 1 });
  assert.equal(cierres, 1);
});

test('vigilarConfig: al cambiar el archivo reconecta con el plc nuevo; JSON roto se ignora', async () => {
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frio-')), 'config.json');
  fs.writeFileSync(ruta, JSON.stringify({ plc: { ip: '10.0.0.1', port: 502, unitId: 255 } }));
  const plc = plcDe(JSON.parse(fs.readFileSync(ruta, 'utf8')));
  let cierres = 0;
  const silencio = { log() {}, error() {} };
  const parar = vigilarConfig(ruta, plc, () => cierres++, { intervaloMs: 20, log: silencio });
  const espera = async (cond) => { for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20)); };
  try {
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(ruta, '{roto');
    fs.utimesSync(ruta, new Date(), new Date(Date.now() + 1000));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(plc.ip, '10.0.0.1');
    fs.writeFileSync(ruta, JSON.stringify({ plc: { ip: '192.168.3.71', port: 502, unitId: 1 } }));
    fs.utimesSync(ruta, new Date(), new Date(Date.now() + 2000));
    await espera(() => plc.ip === '192.168.3.71');
    assert.deepEqual(plc, { ip: '192.168.3.71', port: 502, unitId: 1 });
    assert.equal(cierres, 1);
  } finally { parar(); }
});

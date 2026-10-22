'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'repeticion-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');

const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/services/settings');

test('repetición de avisos: 15 min y 4 veces por defecto; se cambia y se valida', () => {
  assert.deepEqual(settings.getRepeticion(), { minutos: 15, veces: 4 });
  assert.deepEqual(settings.setRepeticion({ minutos: 30 }), { minutos: 30, veces: 4 });
  assert.deepEqual(settings.setRepeticion({ veces: 0 }), { minutos: 30, veces: 0 });
  assert.throws(() => settings.setRepeticion({ minutos: 2 }), /entre 5 y 240/);
  assert.throws(() => settings.setRepeticion({ veces: 21 }), /entre 0 y 20/);
  assert.throws(() => settings.setRepeticion({ minutos: '15' }), /entre 5 y 240/);
  assert.deepEqual(settings.getRepeticion(), { minutos: 30, veces: 0 });
});

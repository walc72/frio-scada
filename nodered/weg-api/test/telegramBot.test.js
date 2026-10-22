'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bot = require('../src/services/telegramBot');

const CHAT = -100;
const q = (data, chatId = CHAT) => ({ id: 'q1', data, from: { first_name: 'Ana', last_name: 'P' }, message: { chat: { id: chatId, type: 'group' } } });

function espias(vistas = [{ clave: 'C4.alarma_manual', texto: 'C4: alarma de manual prolongado' }]) {
  const r = { onVisto: [], avisar: [], contestar: [] };
  return {
    r,
    opts: {
      onVisto: async (claves, usuario) => { r.onVisto.push([claves, usuario]); return vistas; },
      avisar: async (t) => { r.avisar.push(t); },
      contestar: async (id, t) => { r.contestar.push(t); },
    },
  };
}

test('Visto desde el chat configurado: marca, contesta y avisa al grupo quién la vio', async () => {
  const { r, opts } = espias();
  await bot.atender(CHAT, q('v:C4.alarma_manual'), opts);
  assert.deepEqual(r.onVisto, [[['C4.alarma_manual'], 'Ana P (Telegram)']]);
  assert.deepEqual(r.contestar, ['Marcada como vista']);
  assert.deepEqual(r.avisar, ['👀 Ana P vio: C4: alarma de manual prolongado']);
});

test('ya vista o resuelta: contesta sin avisar al grupo', async () => {
  const { r, opts } = espias([]);
  await bot.atender(CHAT, q('v:C4.alarma_manual'), opts);
  assert.deepEqual(r.contestar, ['Ya estaba vista o ya se resolvió']);
  assert.deepEqual(r.avisar, []);
});

test('otro chat: no marca nada', async () => {
  const { r, opts } = espias();
  await bot.atender(CHAT, q('v:C4.alarma_manual', 999), opts);
  assert.deepEqual(r.onVisto, []);
  assert.deepEqual(r.contestar, ['Este chat no está autorizado']);
});

test('dato desconocido: no marca nada', async () => {
  const { r, opts } = espias();
  await bot.atender(CHAT, q('otra cosa'), opts);
  assert.deepEqual(r.onVisto, []);
});

test('registrarChat: guarda grupos y privados con nombre', () => {
  bot._chats.clear();
  bot.registrarChat({ my_chat_member: { chat: { id: -5, type: 'supergroup', title: 'Cámaras' } } });
  bot.registrarChat({ message: { chat: { id: 7, type: 'private', first_name: 'Juan' } } });
  assert.deepEqual([...bot._chats.values()], [{ id: -5, tipo: 'grupo', nombre: 'Cámaras' }, { id: 7, tipo: 'privado', nombre: 'Juan' }]);
});

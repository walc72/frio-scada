'use strict';

const ModbusRTU = require('modbus-serial');

// Pool of Modbus TCP connections, keyed by "ip:port"
const pool = new Map();

// Tras un connect fallido, no se reintenta connectTCP (que bloquea hasta el
// timeout) durante este lapso: los hosts caidos fast-fail en vez de costar un
// timeout completo por cada lectura. Un dispositivo que se reconecta se detecta
// dentro de esta ventana.
const config = { cooldownMs: 6000 }; // solo los tests lo bajan

// Espera de cada lectura. Más que el "slave timeout" de los gateways RS-485
// (ADAM-4572: 2000 ms), así su respuesta "el equipo no contestó" llega antes
// de que acá se corte por timeout (que sí cuenta como falla de la conexión).
const READ_TIMEOUT_MS = 3000;

function key(ip, port) {
  return `${ip}:${port}`;
}

async function getOrCreate(ip, port) {
  const k = key(ip, port);
  let entry = pool.get(k);

  if (entry && entry.client.isOpen) {
    return entry.client;
  }

  // Cooldown: si el ultimo connect fallo hace poco, fast-fail sin bloquear
  if (entry && entry.failedUntil && Date.now() < entry.failedUntil) {
    return null;
  }

  // Close stale connection if exists
  if (entry) {
    try { entry.client.close(() => {}); } catch (e) {}
  }

  const client = new ModbusRTU();
  client.setTimeout(READ_TIMEOUT_MS);

  try {
    await client.connectTCP(ip, { port, timeout: 3000 });
    console.log(`[CONN] Connected to ${k}`);
    pool.set(k, { client, ip, port, errors: 0, failedUntil: 0 });
    return client;
  } catch (err) {
    // Log solo en la primera falla de la racha para no spamear
    if (!entry || !entry.failedUntil) {
      console.error(`[CONN] Failed to connect to ${k}: ${err.message}`);
    }
    pool.set(k, { client, ip, port, errors: (entry ? entry.errors : 0) + 1, failedUntil: Date.now() + config.cooldownMs });
    return null;
  }
}

async function poll(ip, port, unitId, startAddr, count) {
  const client = await getOrCreate(ip, port);
  if (!client || !client.isOpen) return null;

  const k = key(ip, port);
  client.setID(unitId);
  try {
    const resp = await client.readHoldingRegisters(startAddr, count);
    // Reset error counter on success
    const entry = pool.get(k);
    if (entry && entry.errors > 0) entry.errors = 0;
    return resp.data;
  } catch (err) {
    // Una excepción Modbus es una RESPUESTA (la conexión anda): p.ej. un
    // gateway que avisa que un esclavo no contestó. No se cuenta para cerrar
    // el socket, que cortaría a los demás equipos detrás del mismo gateway.
    if (!isTransportError(err)) return null;
    const entry = pool.get(k);
    if (entry) entry.errors++;
    // Demasiadas fallas de transporte seguidas: cerrar y reconectar en el próximo poll
    if (entry && entry.errors > 5) {
      try { client.close(() => {}); } catch (e) {}
      pool.delete(k);
      console.warn(`[CONN] Closed ${k} after ${entry.errors} errors — will reconnect`);
    }
    return null;
  }
}

// Falla de la conexión (timeout, socket cerrado) vs. excepción Modbus (hubo
// respuesta; modbus-serial le pone modbusCode).
function isTransportError(err) {
  return !(err && err.modbusCode != null);
}

function closeOne(k) {
  const entry = pool.get(k);
  if (entry) {
    try { entry.client.close(() => {}); } catch (e) {}
    pool.delete(k);
  }
}

function closeAll() {
  for (const [k, entry] of pool) {
    try { entry.client.close(() => {}); } catch (e) {}
    console.log(`[CONN] Closed ${k}`);
  }
  pool.clear();
}

function getStats() {
  const stats = {};
  for (const [k, entry] of pool) {
    stats[k] = { connected: entry.client.isOpen, errors: entry.errors };
  }
  return stats;
}

// Cliente para mando.js (el escritor único): la conexión del pool al momento de cada operación,
// así sobrevive a reconexiones y cambios de PLC. Sin conexión lanza (mando lo informa como sin-conexion).
function cliente(plc) {
  let id = plc.unitId;
  const usar = async () => {
    const c = await getOrCreate(plc.ip, plc.port);
    if (!c || !c.isOpen) throw new Error('sin-conexion');
    c.setID(id);
    return c;
  };
  return {
    setID: (u) => { id = u; },
    readHoldingRegisters: async (a, n) => (await usar()).readHoldingRegisters(a, n),
    writeRegisters: async (a, v) => (await usar()).writeRegisters(a, v),
  };
}

module.exports = { config, poll, cliente, closeOne, closeAll, getStats, isTransportError };

'use strict';
// Escritor ÚNICO del canal de comandos del PLC (registros 700..712, v3 del mapa). Espejo de
// herramientas/escritor_mando.py (Unifrisa). Toda escritura Modbus del poller pasa por acá.
// cliente: objeto modbus-serial (setID, readHoldingRegisters -> {data}, writeRegisters).

const BASE = 700;
const VERSION_CANAL = 1;
const VERSION_MAPA_CON_CANAL = 3;
const ESPERA_ECO_MS = 5000;
const SONDEO_MS = 50;

// CRC-16/MODBUS por bytes, byte alto de cada palabra primero. "123456789" -> 0x4B37.
function crc16Modbus(palabras) {
  let crc = 0xFFFF;
  for (const w of palabras) {
    for (const b of [w >> 8, w & 0xFF]) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xA001 : crc >> 1;
    }
  }
  return crc;
}

const siguiente = (v) => (v % 0xFFFF) + 1; // 1..65535, nunca 0

const CAMPOS = ['comando', 'destino', 'argumento', 'usuario'];
// Cuerpo del pedido válido: cuatro enteros 0..65535
const validar = (b) => !!b && typeof b === 'object' && CAMPOS.every((k) => Number.isInteger(b[k]) && b[k] >= 0 && b[k] <= 0xFFFF);

function createMando({ cliente, unidad, ahora = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), esperaEcoMs = ESPERA_ECO_MS }) {
  const id = () => (typeof unidad === 'function' ? unidad() : unidad);
  const leer = async (dir, n) => { cliente.setID(id()); return (await cliente.readHoldingRegisters(dir, n)).data; };
  const escribir = (dir, valores) => { cliente.setID(id()); return cliente.writeRegisters(dir, valores); };

  // Una sola cola: pedidos y latido nunca se intercalan (un pedido son dos FC16 seguidos)
  let cola = Promise.resolve();
  const encolar = (f) => { const p = cola.then(f, f); cola = p.catch(() => {}); return p; };

  async function atender({ comando, destino, argumento, usuario }) {
    // Llave, versión del mapa y del canal: lectura fresca justo antes de escribir, nunca de la última foto
    // (una foto de hasta 1 s podría ser anterior a que el panel apague la llave).
    let disp, version, eco;
    try {
      if ((await leer(1, 1))[0] < VERSION_MAPA_CON_CANAL) return { resultado: 0, motivo: 'canal-incompatible' };
      [disp, , version, eco] = await leer(BASE + 5, 4); // 705..708
      if (version !== VERSION_CANAL) return { resultado: 0, motivo: 'canal-incompatible' };
      if (!((await leer(309, 1))[0] & 1)) return { resultado: 4, motivo: 0 };
    } catch (e) { return { resultado: 0, motivo: 'sin-conexion' }; }

    const token = siguiente(eco); // distinto del eco actual: no se confunde con una respuesta vieja
    const campos = [token, comando, destino, argumento, usuario];
    try { await escribir(BASE, campos); } catch (e) { return { resultado: 0, motivo: 'sin-conexion' }; } // sin disparador: nada se ejecutó
    // Si falla este segundo FC16 puede haber llegado igual: se espera el eco de todos modos
    try { await escribir(BASE + 5, [siguiente(disp), crc16Modbus(campos)]); } catch (e) { /* se resuelve con el eco o sin-respuesta */ }

    const limite = ahora() + esperaEcoMs;
    for (;;) {
      try {
        const [e, resultado, motivo] = await leer(BASE + 8, 3); // el eco va último: resultado y motivo ya son los suyos
        if (e === token) return { resultado, motivo };
      } catch (e) { /* se reintenta hasta el límite */ }
      if (ahora() >= limite) return { resultado: 0, motivo: 'sin-respuesta' }; // resultado DESCONOCIDO, no "no hecho": quien llama dice que se relea el estado
      await dormir(SONDEO_MS);
    }
  }

  let latidoPendiente = false;
  return {
    pedir: (p) => encolar(() => atender(p)),
    // Avanza el latido (712) en la misma cola; si ya hay uno esperando no se apila otro
    latir() {
      if (latidoPendiente) return Promise.resolve(false);
      latidoPendiente = true;
      return encolar(async () => {
        latidoPendiente = false;
        try {
          // Un PLC con mapa v2 (sin canal) no define el 712: mismo chequeo fresco que un pedido, si falla no se escribe
          if ((await leer(1, 1))[0] < VERSION_MAPA_CON_CANAL || (await leer(BASE + 7, 1))[0] !== VERSION_CANAL) return false;
          await escribir(BASE + 12, [siguiente((await leer(BASE + 12, 1))[0])]);
          return true;
        } catch (e) { return false; }
      });
    },
  };
}

module.exports = { crc16Modbus, createMando, validar, BASE };

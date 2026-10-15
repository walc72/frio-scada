'use strict';
// Servidor Modbus TCP falso: sirve los `regs` de fixtures[ciclo] para FC03 en cualquier rango.
// ciclo lo fija el test (srv.ciclo = n). cortarEn: desde ese ciclo, 3 ciclos responde excepción Modbus
// (sin esperar timeouts); partirEn: en ese ciclo el tramo 106..197 llega con marca final distinta.
// srv.caer() / srv.volver(): corte de transporte real (destruye sockets y deja de escuchar / vuelve a escuchar).
const { ServerTCP } = require('modbus-serial');

function crearServidor(fixtures, { cortarEn, partirEn } = {}) {
  const srv = { ciclo: 0, port: 0 };
  const socks = new Set();
  const vector = {
    getMultipleHoldingRegisters(addr, len, unit, cb) {
      const c = srv.ciclo;
      if (cortarEn !== undefined && c >= cortarEn && c < cortarEn + 3) return cb({ modbusErrorCode: 4 });
      const v = fixtures[c].regs.slice(addr, addr + len);
      if (c === partirEn && addr === 106) v[v.length - 1] ^= 1;
      cb(null, v);
    },
  };
  // ServerTCP trata port 0 como 502: se prueba un puerto alto al azar (hasta 5 veces si está ocupado/prohibido).
  const intentar = (n) => new Promise((resolve, reject) => {
    const port = 20000 + Math.floor(Math.random() * 30000);
    const s = new ServerTCP(vector, { host: '127.0.0.1', port, unitID: 1 });
    s.on('serverError', (e) => {
      if (n > 1 && (e.code === 'EADDRINUSE' || e.code === 'EACCES')) intentar(n - 1).then(resolve, reject);
      else reject(e);
    });
    s.on('initialized', () => {
      s._server.on('connection', (k) => { socks.add(k); k.on('close', () => socks.delete(k)); });
      srv.port = port;
      srv.caer = () => new Promise((r) => { for (const k of socks) k.destroy(); s._server.close(r); });
      srv.volver = () => new Promise((r) => s._server.listen(port, '127.0.0.1', r));
      srv.close = () => new Promise((r) => { for (const k of socks) k.destroy(); s._server.close(() => r()); });
      resolve(srv);
    });
  });
  return intentar(5);
}
module.exports = { crearServidor };

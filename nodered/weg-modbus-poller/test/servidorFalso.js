'use strict';
// Servidor Modbus TCP falso: sirve los `regs` de fixtures[ciclo] para FC03 en cualquier rango.
// ciclo lo fija el test (srv.ciclo = n). cortarEn: desde ese ciclo, 3 ciclos responde excepción Modbus
// (sin esperar timeouts); partirEn: en ese ciclo el tramo 106..197 llega con marca final distinta.
// srv.caer() / srv.volver(): corte de transporte real (destruye sockets y deja de escuchar / vuelve a escuchar).
// srv.mando imita el canal de comandos del PLC v20 (700..712): cuando llega el disparador valido (CRC, token
// nuevo) pone resultado y, DESPUES de demoraMs, el eco. srv.mapaV3 pone la version 3 (+ llave en 309, canal en 310).
// srv.log registra cada FC16 y cada eco, en orden. responde=false: nunca hay eco.
const { ServerTCP } = require('modbus-serial');
const { crc16Modbus } = require('../src/mando');

function crearServidor(fixtures, { cortarEn, partirEn } = {}) {
  const srv = { ciclo: 0, port: 0, mapaV3: false, log: [] };
  const m = srv.mando = { llave: true, sinMando: false, canal: 1, resultado: 1, motivo: 0, responde: true, demoraMs: 0, regs: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], ultimoDisp: 0 };
  const procesar = () => {
    const [token, , , , , disp, crc] = m.regs.slice(0, 7);
    if (disp === 0 || disp === m.ultimoDisp || crc !== crc16Modbus(m.regs.slice(0, 5)) || token === 0 || token === m.regs[8]) return;
    m.ultimoDisp = disp;
    m.regs[9] = m.llave ? m.resultado : 4; m.regs[10] = m.llave ? m.motivo : 0;
    if (!m.responde) return;
    const eco = () => { m.regs[8] = token; srv.log.push({ eco: token }); };
    if (m.demoraMs) setTimeout(eco, m.demoraMs); else eco();
  };
  const socks = new Set();
  const vector = {
    // el servidor manda las lecturas de 1 registro a getHoldingRegister
    getHoldingRegister(addr, unit, cb) { this.getMultipleHoldingRegisters(addr, 1, unit, (e, v) => cb(e, e ? undefined : v[0])); },
    getMultipleHoldingRegisters(addr, len, unit, cb) {
      const c = srv.ciclo;
      if (cortarEn !== undefined && c >= cortarEn && c < cortarEn + 3) return cb({ modbusErrorCode: 4 });
      const v = fixtures[c].regs.slice(addr, addr + len);
      const reg = { 1: srv.mapaV3 ? 3 : undefined, 309: srv.mapaV3 ? (m.llave ? 1 : 0) | (m.sinMando ? 2 : 0) : undefined, 310: srv.mapaV3 ? m.canal : undefined };
      for (let i = 0; i < len; i++) {
        if (addr + i >= 700 && addr + i <= 712) v[i] = m.regs[addr + i - 700] ?? 0;
        else if (reg[addr + i] !== undefined) v[i] = reg[addr + i];
      }
      if (c === partirEn && addr === 106) v[v.length - 1] ^= 1;
      cb(null, v);
    },
    setRegisterArray(addr, valores, unit, cb) {
      srv.log.push({ addr, valores: [...valores] });
      valores.forEach((x, i) => { if (addr + i >= 700 && addr + i <= 712) m.regs[addr + i - 700] = x; });
      if (addr === 705) procesar();
      cb(null);
    },
    setRegister(addr, value, unit, cb) { cb(null); },
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

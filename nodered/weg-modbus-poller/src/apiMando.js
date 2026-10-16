'use strict';
// POST /mando en el puerto interno de health (3100). Solo la red de docker llega; header X-Mando-Token.
const crypto = require('crypto');
const { validar } = require('./mando');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function crearManejador({ mando, token }) {
  const esperado = sha(token);
  const responder = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  return (req, res) => {
    if (req.url !== '/mando') return responder(res, 404, { error: 'no encontrado' });
    if (req.method !== 'POST') return responder(res, 405, { error: 'metodo' });
    // Sin MANDO_TOKEN configurado el canal queda cerrado; se compara el hash para que el largo no filtre nada
    if (!token || !crypto.timingSafeEqual(sha(req.headers['x-mando-token'] || ''), esperado)) {
      req.resume();
      return responder(res, 401, { error: 'token' });
    }
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; if (cuerpo.length > 1024) req.destroy(); });
    req.on('end', async () => {
      let b;
      try { b = JSON.parse(cuerpo); } catch (e) { return responder(res, 400, { error: 'json' }); }
      if (!validar(b)) return responder(res, 400, { error: 'campos' });
      const { comando, destino, argumento, usuario } = b;
      responder(res, 200, await mando.pedir({ comando, destino, argumento, usuario }));
    });
  };
}

module.exports = { crearManejador };

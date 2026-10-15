'use strict';
// Publicación MQTT: frio/estado (retenido, completo, solo cuando hace falta: ver ciclo.js),
// frio/latido (no retenido, cada ciclo, chico: {_ts, _conectado, _mapa?, _version?}), frio/eventos (no retenido).
function createSalidaMqtt(client, prefix = 'frio') {
  const pub = (topic, obj, retain, qos = 1) => client.publish(topic, JSON.stringify(obj), { retain, qos });
  return {
    // solo importa el último estado: sin conexión no se encola
    estado: (estado, tsMs, conectado, extra = {}) => client.connected && pub(`${prefix}/estado`, { ...estado, _ts: tsMs, _conectado: conectado, ...extra }, true),
    latido: (tsMs, conectado, extra = {}) => client.connected && pub(`${prefix}/latido`, { _ts: tsMs, _conectado: conectado, ...extra }, false, 0),
    evento: (e, tsMs) => pub(`${prefix}/eventos`, { ...e, _ts: tsMs }, false),
  };
}
module.exports = { createSalidaMqtt };

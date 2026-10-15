'use strict';

// Poller de cámaras frías: lee el mapa v2 del PLC (solo lectura), escribe
// cambios/eventos/foto/descongelados en InfluxDB, publica frio/estado y frio/eventos por MQTT.

const fs = require('fs');
const http = require('http');
const mqtt = require('mqtt');
const { createScheduler } = require('./scheduler');
const { leerMapa } = require('./lectura');
const { leerEventos, nuevosEventos } = require('./eventos');
const { decodificar } = require('./mapa');
const { createComunicacion } = require('./comunicacion');
const { createSalidaMqtt } = require('./salidaMqtt');
const { createCiclo } = require('./ciclo');
const connections = require('./connections');
const { plcDe, vigilarConfig } = require('./configPlc');

const CONFIG_PATH = process.env.CONFIG_PATH || './config.json';
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { console.error('[CONFIG]', e.message); }
// Objeto único y mutable: vigilarConfig lo actualiza al cambiar config.json (Configuración del portal)
const plc = plcDe(cfg);
const dejarDeVigilar = vigilarConfig(CONFIG_PATH, plc, connections.closeAll);
const influx = { url: 'http://influxdb:8086', org: 'tecnoelectric', bucket: 'camaras', ...(cfg.influxdb || {}) };
const token = process.env.INFLUXDB_TOKEN || influx.token || '';

// Escritura InfluxDB por HTTP (line protocol, ns), como weg-scada
function escribirInflux(body) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${influx.url}/api/v2/write?org=${encodeURIComponent(influx.org)}&bucket=${encodeURIComponent(influx.bucket)}&precision=ns`);
    const req = http.request(u, { method: 'POST', timeout: 10000, headers: { Authorization: `Token ${token}`, 'Content-Type': 'text/plain; charset=utf-8' } }, (res) => {
      res.resume();
      res.on('end', () => (res.statusCode === 204 ? resolve() : reject(new Error(`Influx HTTP ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error('Influx timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://mosquitto:1883';
const STATUS_TOPIC = process.env.STATUS_TOPIC || 'frio/status';

const client = mqtt.connect(MQTT_BROKER, {
  clientId: 'frio-poller',
  will: { topic: STATUS_TOPIC, payload: JSON.stringify({ poller: 'offline' }), retain: true, qos: 1 },
});
client.on('connect', () => {
  console.log('[MQTT] Connected');
  publicarStatus();
});
client.on('error', (err) => console.error('[MQTT] Error:', err.message));

if (!plc.ip) console.error('[CONFIG] plc.ip vacío: el poller no sondea nada');
let mapaStatus = { mapa: 'ok' };
const publicarStatus = () => client.publish(STATUS_TOPIC, JSON.stringify({ poller: 'online', ts: Date.now(), ...mapaStatus }), { retain: true, qos: 1 });
const ciclo = createCiclo({
  onMapa: (m) => { mapaStatus = m ? { mapa: 'incompatible', ...m } : { mapa: 'ok' }; publicarStatus(); },
  plc, leerMapa, leerEventos, decodificar, nuevosEventos,
  escribir: escribirInflux,
  mqtt: createSalidaMqtt(client, (cfg.mqtt || {}).topicPrefix || 'frio'),
  com: createComunicacion(),
  fotoIntervalMs: cfg.fotoIntervalMs || 60000,
});
const scheduler = createScheduler({
  intervalMs: cfg.pollIntervalMs || 1000,
  // clave fija: al cambiar de PLC nunca corren dos ciclos a la vez
  getGroups: () => (plc.ip ? new Map([['plc', plc]]) : new Map()),
  runGroup: () => ciclo(),
});
const pollTimer = setInterval(scheduler.tick, 250);

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', mqtt: client.connected }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(3100, () => console.log('[HEALTH] Listening on :3100'));

// Health file (healthcheck de Docker)
const touch = () => { try { fs.writeFileSync('/tmp/poller-healthy', Date.now().toString()); } catch (e) { /* ignore */ } };
touch();
const timer = setInterval(touch, 10000);

function shutdown() {
  clearInterval(timer);
  clearInterval(pollTimer);
  dejarDeVigilar();
  healthServer.close();
  client.publish(STATUS_TOPIC, JSON.stringify({ poller: 'offline' }), { retain: true, qos: 1 }, () => client.end(false, {}, () => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

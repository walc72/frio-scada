# Poller Modbus (frío)

Servicio de sondeo Modbus TCP de las cámaras frías. Por ahora es un **stub**:
conecta a MQTT, publica `frio/status` (`{"poller":"online"}`, retained, con will
`offline`) y expone `/health` en :3100. La lectura de registros se agrega sobre
[`src/connections.js`](src/connections.js) y [`src/scheduler.js`](src/scheduler.js).

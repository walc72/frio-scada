'use strict';

// ─── Validacion de esquema de config.json ────────────────────────────
// Sin esto, un PUT malformado se escribia a disco tal cual; el poller lo
// recargaba, fallaba en cfg.devices.length y caia a un default con lista
// de dispositivos vacia — todo el polling se detenia en silencio.

function isNonEmptyString(v, max = 64) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function isHost(v) {
  // IPv4 o hostname simple; suficiente para red industrial
  return isNonEmptyString(v, 253) && /^[a-zA-Z0-9._-]+$/.test(v);
}

function isPort(v) {
  return v === undefined || (Number.isInteger(v) && v >= 1 && v <= 65535);
}

function isUnitId(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 255);
}

const OCTETO = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const IPV4 = new RegExp(`^${OCTETO}([.]${OCTETO}){3}$`);
const isIPv4 = (v) => typeof v === 'string' && IPV4.test(v);

function isOffset(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 65535);
}

function validateMeter(m, i, errors) {
  const tag = `meters[${i}]`;
  if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(m.name)) errors.push(`${tag}: name requerido`);
  if (!isNonEmptyString(m.type, 32)) errors.push(`${tag} (${m.name}): type requerido`);
  if (!isHost(m.ip)) errors.push(`${tag} (${m.name}): ip invalida`);
  if (!isPort(m.port)) errors.push(`${tag} (${m.name}): port invalido`);
  if (!isUnitId(m.unitId)) errors.push(`${tag} (${m.name}): unitId invalido`);
  if (m.regs !== undefined) {
    if (!m.regs || typeof m.regs !== 'object' || Array.isArray(m.regs)) {
      errors.push(`${tag} (${m.name}): regs debe ser un objeto`);
    } else {
      for (const [k, v] of Object.entries(m.regs)) {
        if (!Number.isInteger(v) || v < 0) errors.push(`${tag} (${m.name}): regs.${k} debe ser entero >= 0`);
      }
    }
  }
  if (m.waveform !== undefined) {
    const wf = m.waveform;
    if (!wf || typeof wf !== 'object' || Array.isArray(wf)) {
      errors.push(`${tag} (${m.name}): waveform debe ser un objeto`);
    } else {
      if (wf.freqReg !== undefined && (!Number.isInteger(wf.freqReg) || wf.freqReg < 1)) {
        errors.push(`${tag} (${m.name}): waveform.freqReg invalido`);
      }
      if (wf.numHarmonics !== undefined && (!Number.isInteger(wf.numHarmonics) || wf.numHarmonics < 1 || wf.numHarmonics > 63)) {
        errors.push(`${tag} (${m.name}): waveform.numHarmonics debe ser 1-63`);
      }
      if (wf.channels !== undefined) {
        if (!wf.channels || typeof wf.channels !== 'object' || Array.isArray(wf.channels)) {
          errors.push(`${tag} (${m.name}): waveform.channels debe ser un objeto`);
        } else {
          for (const [k, v] of Object.entries(wf.channels)) {
            if (!Number.isInteger(v) || v < 1) errors.push(`${tag} (${m.name}): waveform.channels.${k} invalido`);
          }
        }
      }
    }
  }
}

// Devuelve una lista de errores; vacia si la config es valida.
function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return ['la config debe ser un objeto JSON'];
  }

  if (cfg.meters !== undefined) {
    if (!Array.isArray(cfg.meters)) errors.push('meters debe ser un array');
    else cfg.meters.forEach((m, i) => validateMeter(m, i, errors));
  }

  if (cfg.pollIntervalMs !== undefined && (!Number.isInteger(cfg.pollIntervalMs) || cfg.pollIntervalMs < 500)) {
    errors.push('pollIntervalMs debe ser entero >= 500');
  }
  if (cfg.influxWriteIntervalMs !== undefined && (!Number.isInteger(cfg.influxWriteIntervalMs) || cfg.influxWriteIntervalMs < 1000)) {
    errors.push('influxWriteIntervalMs debe ser entero >= 1000');
  }

  // Conexión con el PLC (la lee el poller y la recarga sola: una IP rota lo dejaría sin datos)
  if (cfg.plc !== undefined) {
    const p = cfg.plc;
    if (!p || typeof p !== 'object' || Array.isArray(p)) errors.push('plc debe ser un objeto');
    else {
      if (!isIPv4(p.ip)) errors.push('plc.ip debe ser una IPv4');
      if (!isPort(p.port)) errors.push('plc.port invalido');
      if (!isUnitId(p.unitId)) errors.push('plc.unitId debe ser 0-255');
    }
  }

  for (const key of ['mqtt', 'influxdb', 'alarmSetpoints', 'gaugeZones', 'meterNames']) {
    if (cfg[key] !== undefined && (cfg[key] === null || typeof cfg[key] !== 'object' || Array.isArray(cfg[key]))) {
      errors.push(`${key} debe ser un objeto`);
    }
  }

  return errors;
}

module.exports = { validateConfig, isIPv4 };

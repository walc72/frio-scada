'use strict';

// Comandos remotos a los PLC: catálogo (espejo de docs/modbus/mapa_modbus.md, "Mando"), textos de motivo
// (espejo de GVL_MANDO.MOTIVOS, v20) y valores previos del estado vivo para la auditoría.
// El PLC valida de nuevo todo; acá se corta lo que no tiene sentido mandar y se aplica el rol.

const RES_MAN_MAX_DEFECTO = 120;   // tope de la resistencia en manual si el estado vivo no lo trae (default documentado)
const ESTADO_MAX_MS = 120000;      // estado más viejo que esto (o desconectado) = "sin dato"

const C_NUM = { C5: 1, C4: 2 };    // cámara del destino: 1 = C5, 2 = C4
const MODOS = ['automático', 'manual', 'fuera de servicio'];   // para mostrar
const MODOS_PLC = ['AUTO', 'MANUAL', 'FUERA DE SERVICIO'];      // como los publica el poller (mapa.js MODO_GRUPO)
const entero = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const onoff = (v) => (v ? 'prender' : 'apagar');
const sn = (v) => (v ? 'sí' : 'no');
const hhmm = (v) => String(v).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2');

// destino: partes que lleva ('c' cámara, 'g' grupo, 'h' horario, '-' ninguna). valida(valor, {resMax}).
// texto(valor) dice qué se pide; fmt(valor) cómo se escribe un valor (para "antes: …").
const CATALOGO = {
  1: { rol: 'operar', destino: 'cg', valida: (v) => entero(v, 0, 2), texto: (v) => `pasar a ${MODOS[v]}`, fmt: (v) => MODOS[v] },
  2: { rol: 'operar', destino: 'cg', valida: (v) => entero(v, 0, 1), texto: (v) => `${onoff(v)} el compresor`, fmt: (v) => (v ? 'prendido' : 'apagado') },
  3: { rol: 'operar', destino: 'cg', valida: (v) => entero(v, 0, 1), texto: (v) => `${onoff(v)} el evaporador`, fmt: (v) => (v ? 'prendido' : 'apagado') },
  4: { rol: 'operar', destino: 'cg', valida: (v, o) => entero(v, 0, o.resMax > 0 ? o.resMax : 65535),
    texto: (v) => (v ? `prender la resistencia ${v} min` : 'apagar la resistencia'), fmt: (v) => (v ? `${v} min` : 'apagada') },
  5: { rol: 'operar', destino: 'c', valida: (v) => v === 0, texto: () => 'saltar el descongelado en curso' },
  6: { rol: 'operar', destino: 'cg', valida: (v) => v === 0, texto: () => 'cortar el descongelado' },
  7: { rol: 'operar', destino: '-', valida: (v) => entero(v, 1, 2), texto: (v) => (v === 1 ? 'ventana del arranque: mantener en manual' : 'ventana del arranque: pasar a automático') },
  20: { rol: 'admin', destino: 'ch', valida: (v) => entero(v, 0, 2359) && v % 100 < 60, texto: (v) => `hora del horario ${hhmm(v)}`, fmt: hhmm },
  21: { rol: 'admin', destino: 'ch', valida: (v) => entero(v, 0, 1), texto: (v) => `${v ? 'habilitar' : 'deshabilitar'} el horario`, fmt: sn },
  22: { rol: 'admin', destino: 'ch', valida: (v) => entero(v, 10001, 20900) && v % 10000 >= 1 && v % 10000 <= 900,
    texto: (v) => `etapa ${Math.floor(v / 10000)}: ${(v % 10000) / 10} min`, fmt: (v) => `${(v % 10000) / 10} min` },
  23: { rol: 'admin', destino: 'ch', valida: (v) => [10, 11, 20, 21].includes(v), texto: (v) => `${v % 10 ? 'habilitar' : 'deshabilitar'} la etapa ${Math.floor(v / 10)}`, fmt: (v) => sn(v % 10) },
  24: { rol: 'admin', destino: 'ch', valida: (v) => entero(v, 1, 254), texto: (v) => `reparto de etapas, máscara ${v}`, fmt: String },
  25: { rol: 'admin', destino: 'c', valida: (v) => entero(v, 0, 60), texto: (v) => `tiempo de recuperación ${v} min`, fmt: (v) => `${v} min` },
  30: { rol: 'admin', destino: '-', valida: (v) => entero(v, 1000, 3999),
    texto: (v) => `ajuste ${['', 'tope de la resistencia en manual', 'horas máximas sin descongelar', 'horas máximas en manual'][Math.floor(v / 1000)]}: ${v % 1000}`, fmt: String },
  31: { rol: 'admin', destino: 'cg', valida: (v) => v === 0, texto: () => 'reset de mantenimiento' },
};

// Entrada del catálogo; solo para un entero que sea propiedad propia (nada de "__proto__", "toString" ni "1" como texto).
const comando = (c) => (Number.isInteger(c) && Object.hasOwn(CATALOGO, c) ? CATALOGO[c] : null);

// Qué se pide, con cámara y equipo: "C5 equipo 3: pasar a manual"
function textoAccion(comando, camara, grupo, horario, valor) {
  const donde = [camara, grupo && `equipo ${grupo}`, horario && `horario ${horario}`].filter(Boolean).join(' ');
  return `${donde ? donde + ': ' : ''}${CATALOGO[comando].texto(valor)}`;
}

// Destino de la trama: cámara·1000 + grupo·10 + horario. Solo lleva las partes del comando (el PLC rechaza el resto).
function armarDestino(comando, camara, grupo, horario) {
  const d = CATALOGO[comando].destino;
  return (d.includes('c') ? C_NUM[camara] * 1000 : 0) + (d.includes('g') ? grupo * 10 : 0) + (d.includes('h') ? horario : 0);
}

// Valida el pedido {comando, camara, grupo, horario, valor}; devuelve un mensaje de error o null.
function errorPedido(b, resMax) {
  const e = comando(b.comando);
  if (!e) return 'Comando desconocido';
  if (e.destino.includes('c') && !Object.hasOwn(C_NUM, b.camara)) return 'Cámara inválida (C4 | C5)';
  if (e.destino.includes('g') && !entero(b.grupo, 1, 8)) return 'Grupo inválido (1..8)';
  if (e.destino.includes('h') && !entero(b.horario, 1, 4)) return 'Horario inválido (1..4)';
  if (!e.valida(b.valor, { resMax })) return 'Valor fuera de rango';
  return null;
}

// Tope de la resistencia en manual: del estado vivo (registro 13) o, sin dato, el default documentado.
// 0 = sin tope (la validación deja pasar hasta 65535).
function topeResistencia(estado) {
  const t = estado && estado['param.res_man_max_min'];
  return Number.isInteger(t) && t >= 0 ? t : RES_MAN_MAX_DEFECTO;
}

// El estado sirve de "antes" solo si es reciente y el poller está conectado al PLC.
function estadoVivo(estado, ahora) {
  return estado && estado._conectado && typeof estado._ts === 'number' && ahora - estado._ts <= ESTADO_MAX_MS ? estado : null;
}

// Valor previo del dato que el comando cambia, en las unidades del valor nuevo; null si el estado no lo trae.
function valorAnterior(comando, camara, grupo, horario, e) {
  if (!e) return null;
  const g = `${camara}.G${grupo}.`, h = `${camara}.H${horario}.`;
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  switch (comando) {
    case 1: { const i = MODOS_PLC.indexOf(e[g + 'modo']); return i < 0 ? null : i; }
    case 2: return num(e[g + 'comp']);
    case 3: return num(e[g + 'eva']);
    case 4: return e[g + 'res'] === 0 ? 0 : num(e[g + 'res_manual_resta_min']);
    case 20: { const m = /^(\d\d):(\d\d)$/.exec(e[h + 'hora'] || ''); return m ? +m[1] * 100 + +m[2] : null; }
    case 24: { const s = e[h + 'etapas']; return typeof s === 'string' ? [...s].reduce((a, c, i) => a + (c === '2' ? 1 << i : 0), 0) : null; }
    case 25: return num(e[`${camara}.recuperacion_min`]);
    default: return null;
  }
}

// GVL_MANDO.MOTIVOS (mapa_modbus.md, "Mando — motivos de rechazo"). El 5 lleva el tope de la resistencia.
const MOTIVOS = ['', 'GRUPO FUERA DE SERVICIO', 'EL GRUPO NO ESTA EN MANUAL', 'RESISTENCIA BLOQUEADA', 'APAGUE COMPRESOR Y EVAPORADOR',
  'TIEMPO: 1 A {TOPE} MIN', 'CADA ETAPA NECESITA UN GRUPO', 'NO HAY DESCONGELADO EN CURSO', 'NO HAY ARRANQUE PENDIENTE', 'VALOR FUERA DE RANGO'];
function textoMotivo(codigo, tope = 0) {
  return MOTIVOS[codigo] === undefined ? `MOTIVO ${codigo}` : MOTIVOS[codigo].replace('{TOPE}', tope);
}

const REVISAR = 'revisá el estado antes de repetir';
// Respuesta del poller ({resultado, motivo}) en palabras. El 0 nunca dice "no se hizo": el resultado es desconocido.
function textoResultado(resultado, motivo, tope = 0) {
  switch (resultado) {
    case 1: return 'Listo';
    case 2: return `El PLC no lo hizo: ${textoMotivo(motivo, tope)}`;
    case 3: return 'El PLC descartó el pedido (trama inválida)';
    case 4: return 'El mando remoto está desactivado en el panel';
    case 5: return 'El PLC no conoce ese comando';
    default:
      if (motivo === 'sin-conexion') return `Sin conexión con el PLC: ${REVISAR}`;
      if (motivo === 'canal-incompatible') return `El canal de mando del PLC es incompatible: ${REVISAR}`;
      if (motivo === 'sin-respuesta') return `El PLC no respondió: ${REVISAR}`;
      return `No se pudo confirmar el resultado: ${REVISAR}`;
  }
}

// Línea de la medición mando (line protocol; números como float, como el poller). anterior null → sin ese campo.
const sinSaltos = (s) => String(s).replace(/[\r\n]+/g, ' ');   // un salto de línea cortaría la línea del protocolo
const escTag = (s) => sinSaltos(s).replace(/[\\,= ]/g, '\\$&');
const escStr = (s) => '"' + sinSaltos(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function lineaMando({ usuario, camara, comando, destino, anterior, valor, resultado, motivo, texto, respuesta, ts }) {
  const campos = [`destino=${destino}`, anterior === null ? null : `valor_anterior=${anterior}`, `valor_nuevo=${valor}`, `resultado=${resultado}`,
    `motivo=${typeof motivo === 'number' ? motivo : 0}`, `texto=${escStr(texto)}`, `respuesta=${escStr(respuesta)}`].filter(Boolean);
  return `mando,usuario=${escTag(usuario)},camara=${escTag(camara || 'general')},comando=${comando} ${campos.join(',')} ${BigInt(Math.round(ts)) * 1000000n}`;
}

module.exports = { CATALOGO, comando, C_NUM, textoAccion, armarDestino, errorPedido, topeResistencia, estadoVivo, valorAnterior, textoMotivo, textoResultado, lineaMando, RES_MAN_MAX_DEFECTO };

'use strict';
// Decodificador del mapa Modbus v2 del PLC de camaras. Espejo de
// herramientas/registrador_modbus.py (Unifrisa): mismas claves y valores.

const VERSION = 2;
const VERSIONES = [2, 3];                                                  // 3 agrega el canal de comandos (700..712)
const ULTIMO = 687;
const LARGO_CAMARA = 90;
const TRAMOS = [[0, 106], [106, 197], [197, 294], [294, 320]];            // inclusivos, solapados en la marca
const TRAMOS_EVENTOS = [[320, 440], [440, 560], [560, 680], [680, 687]];
const CAMARAS = [['C5', 16, 198, 262], ['C4', 107, 228, 278]];            // nombre, base vivo, configuracion, modos

const ESTADO_GRUPO = { 0: 'DESHABILITADO', 1: 'DETENIDO', 2: 'FRIO', 3: 'DESCONGELANDO', 4: 'ESCURRIENDO', 5: 'ALARMA RES', 6: 'MANUAL' };
const MODO_GRUPO = { 0: 'AUTO', 1: 'MANUAL', 2: 'FUERA DE SERVICIO' };
const ESTADO_HORARIO = { 0: 'DESHABILITADO', 1: 'PROGRAMADO', 2: 'EN VENTANA', 3: 'SOLAPADO', 4: 'MAL CONFIGURADO' };
const MODO = { 0: 'STOP', 1: 'AUTOMATICO', 2: 'MANUAL' };

const u32 = (r, i) => r[i] + r[i + 1] * 65536;
const s16 = (v) => (v & 0x8000 ? v - 0x10000 : v);
const bit = (v, n) => ((v >> n) & 1);
const pad = (n) => String(n).padStart(2, '0');
const nombre = (tabla, v) => String(v in tabla ? tabla[v] : v);

function real(r, i) {
  const b = new DataView(new ArrayBuffer(4));
  b.setUint16(0, r[i], true);
  b.setUint16(2, r[i + 1], true);
  return b.getFloat32(0, true);
}

// round(x, 2) de Python: exacto sobre el valor binario y, en empates exactos
// (solo x = j/8 con j impar), al par. toFixed ya es exacto salvo en el empate.
function round2(x) {
  const x8 = x * 8;
  if (Number.isInteger(x8) && Math.abs(x8) % 2 === 1) {
    const n = x * 100;                       // k + 0.5 exacto
    const f = Math.floor(n);
    return (f % 2 === 0 ? f : f + 1) / 100;
  }
  return Number(x.toFixed(2));
}

// Una lectura es sana si el primer y ultimo registro (la marca) son iguales y no cero
function tramoValido(r) {
  return r[0] !== 0 && r[0] === r[r.length - 1];
}

// Direccion de la palabra n del bloque de eventos (n = 0 en el 321), saltando las marcas 440, 560, 680
function dirBloque(n) {
  let a = 321 + n;
  for (const mk of [440, 560, 680]) if (a >= mk) a++;
  return a;
}

function horaPlc(seg) {
  const d = new Date(seg * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function decodificar(m) {
  const d = {};
  d.version_mapa = m[1];
  d.version_programa = m[12];
  d.hora_plc = horaPlc(u32(m, 4));
  d.reloj_ok = bit(m[3], 0);
  d.alarma_reloj = bit(m[3], 1);
  d.alarma_indice = bit(m[3], 2);
  d.alarma_activa = bit(m[3], 3);
  d.arranque_con_manual_pendiente = bit(m[3], 6);
  d.huso_min = s16(m[8]);
  d.alarmas_cantidad = s16(m[9]);
  d.eventos_total = u32(m, 10);
  for (const [cam, b, cb, mb] of CAMARAS) {
    d[cam + '.modo'] = nombre(MODO, m[b]);
    const ordenes = m[b + 6];
    d[cam + '.orden_etapa0'] = bit(ordenes, 0);
    d[cam + '.orden_etapa1'] = bit(ordenes, 1);
    const al = m[b + 7], hb = m[b + 8];
    d[cam + '.alarma_espera'] = bit(al, 8);
    d[cam + '.alarma_recuperacion'] = bit(al, 9);
    d[cam + '.alarma_manual'] = bit(al, 10);
    d[cam + '.alarma_activa'] = bit(al, 11);
    d[cam + '.recuperacion_min'] = m[cb + 25];
    for (let g = 0; g < 8; g++) {
      const p = `${cam}.G${g + 1}.`;
      d[p + 'estado'] = nombre(ESTADO_GRUPO, m[b + 10 + g]);
      d[p + 'modo'] = nombre(MODO_GRUPO, m[mb + g]);
      d[p + 'res_manual_resta_min'] = m[mb + 8 + g];
      d[p + 'comp'] = bit(m[b + 1], g);
      d[p + 'eva'] = bit(m[b + 2], g);
      d[p + 'res'] = bit(m[b + 3], g);
      d[p + 'descongelando'] = bit(m[b + 4], g);
      d[p + 'listo'] = bit(m[b + 5], g);
      d[p + 'alarma_res'] = bit(al, g);
      d[p + 'alarma_sin_desc'] = bit(m[b + 9], g);
      d[p + 'min_descongelado'] = m[b + 26 + g];
      d[p + 'min_recuperacion'] = m[b + 34 + g];
      d[p + 'arranques'] = u32(m, b + 42 + 2 * g);
      d[p + 'horas_marcha'] = round2(u32(m, b + 58 + 2 * g) / 3600.0);
      d[p + 'horas_sin_desc'] = round2(u32(m, b + 74 + 2 * g) / 3600.0);
      d[p + 'habilitado'] = bit(m[cb + 26], g);
      d[p + 'res_bloqueada'] = bit(m[cb + 27], g);
      if (cam === 'C4') d[p + 'habilitado_hmi'] = bit(m[cb + 28], g);
    }
    for (let h = 0; h < 4; h++) {
      const p = `${cam}.H${h + 1}.`;
      d[p + 'estado'] = nombre(ESTADO_HORARIO, m[b + 18 + h]);
      d[p + 'en_ventana'] = bit(hb, 12 + h);
      d[p + 'hora_invalida'] = bit(hb, h);
      d[p + 'solapado'] = bit(hb, 4 + h);
      d[p + 'tiempo_invalido'] = bit(hb, 8 + h);
      d[p + 'duracion_min'] = m[b + 22 + h];
      d[p + 'hora'] = `${pad(m[cb + h])}:${pad(m[cb + 4 + h])}`;
      for (let e = 0; e < 2; e++) {
        d[p + `etapa${e}_orden`] = bit(ordenes, 8 + 2 * h + e);
        d[p + `etapa${e}_min`] = round2(real(m, cb + 8 + 2 * (2 * h + e)));
        d[p + `etapa${e}_habilitada`] = bit(m[cb + 24], 2 * h + e);
      }
      if (cam === 'C4') d[p + 'habilitado_hmi'] = bit(m[cb + 29], h);
    }
  }
  d['param.horas_max_sin_desc'] = round2(real(m, 258));
  d['param.horas_max_manual'] = round2(real(m, 260));
  d['param.res_man_max_min'] = m[13];
  if (m[1] >= 2) {
    CAMARAS.forEach(([cam], ci) => {
      for (let h = 0; h < 4; h++) {
        const v = m[295 + 4 * ci + h];
        let s = '';
        for (let g = 0; g < 8; g++) s += bit(v, g) ? '2' : '1';
        d[`${cam}.H${h + 1}.etapas`] = s;
      }
      for (let g = 0; g < 8; g++) {
        const p = `${cam}.G${g + 1}.`;
        d[p + 'comp_pedido'] = bit(m[303 + 3 * ci], g);
        d[p + 'eva_pedido'] = bit(m[304 + 3 * ci], g);
        d[p + 'res_pedido'] = bit(m[305 + 3 * ci], g);
      }
    });
  }
  if (m[1] >= 3) {
    d.mando_remoto_hab = bit(m[309], 0);
    d.sin_mando_remoto = bit(m[309], 1);
    d.canal_version = m[310];
  }
  return d;
}

module.exports = { VERSION, VERSIONES, ULTIMO, LARGO_CAMARA, TRAMOS, TRAMOS_EVENTOS, decodificar, tramoValido, dirBloque, u32 };

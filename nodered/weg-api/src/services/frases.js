'use strict';

// Port al servidor de las frases del portal (frontend-react/src/lib/frases.ts, alarmas.ts e historial.ts),
// para que el reporte diario diga lo mismo que la pantalla. Solo lo que usa el reporte. Funciones puras.
// Mantener en sincronía con esos archivos (los tests de test/frases.test.js copian casos de los del frontend).

const nombreCamara = (c) => `Cámara ${String(c).slice(1)}`;

// ---- alarmas (frases.ts ALARMAS / textoAlarma) ----
const ALARMAS = {
  alarma_reloj: { texto: 'el reloj del PLC está mal', accion: 'avisar al técnico para ajustar la hora' },
  alarma_indice: { texto: 'falló el índice de alarmas del PLC', accion: 'avisar al técnico' },
  alarma_espera: { texto: 'esperó demasiado para empezar una etapa de descongelado', accion: 'revisar que los equipos de la etapa anterior hayan terminado' },
  alarma_recuperacion: { texto: 'tardó demasiado en volver a frío', accion: 'revisar que los equipos estén enfriando' },
  alarma_manual: { texto: 'hay equipos en manual demasiado tiempo', accion: 'pasarlos a automático desde el panel' },
  alarma_res: { texto: 'la resistencia se cortó por tiempo', textoPlural: 'las resistencias se cortaron por tiempo', accion: 'avisar al técnico para revisar la resistencia' },
  alarma_sin_desc: { texto: 'lleva demasiadas horas sin descongelar', textoPlural: 'llevan demasiadas horas sin descongelar', accion: 'revisar los horarios de descongelado' },
  hora_invalida: { texto: 'un horario de descongelado tiene una hora inválida', accion: 'corregirlo en la configuración del PLC' },
  solapado: { texto: 'un horario de descongelado se pisa con otro', accion: 'corregirlo en la configuración del PLC' },
  tiempo_invalido: { texto: 'un horario de descongelado tiene un tiempo inválido', accion: 'corregirlo en la configuración del PLC' },
};
const textoAlarma = (clave) => ALARMAS[String(clave).split('.').pop()] || { texto: 'hay una alarma en el PLC', accion: 'avisar al técnico' };

// ---- descongelados (frases.ts badgeDescongelado) ----
const listaEquipos = (s) => {
  const n = s.split(',').map((x) => x.trim().replace(/^G/, '')).filter(Boolean);
  return n.length ? `${n.length === 1 ? 'equipo' : 'equipos'} ${n.join(', ')}` : 'un equipo';
};
function badgeDescongelado(f) {
  if (f.cortados) return { etiqueta: 'cortado a mano', motivo: `Un operario cortó el descongelado del ${listaEquipos(f.cortados)}` };
  if (f.saltado) return { etiqueta: 'saltado', motivo: 'Se salteó porque los equipos no estaban en condiciones de descongelar' };
  if (f.noEjecutada) return { etiqueta: 'no se hizo', motivo: 'El horario pasó y el descongelado no se ejecutó' };
  if (f.interrumpida) return { etiqueta: 'sin datos', motivo: 'Se cortó la comunicación con el PLC y no se sabe cómo terminó' };
  return { etiqueta: 'completo', motivo: 'Terminó normalmente' };
}

// ---- eventos (frases.ts EVENTOS / fraseRem / fraseEvento / tipoAviso / claveAlarmaDeEvento) ----
const EVENTOS = [
  { re: /^g(\d) resistencia t\.max$/, tipo: 'alarma', flag: (m, c) => `${c}.G${m[1]}.alarma_res`,
    aparece: (m) => `Se cortó la resistencia del equipo ${m[1]} por tiempo máximo`, resuelve: (m) => `Equipo ${m[1]}: se normalizó la resistencia` },
  { re: /^g(\d) sin descongelar$/, tipo: 'alarma', flag: (m, c) => `${c}.G${m[1]}.alarma_sin_desc`,
    aparece: (m) => `Equipo ${m[1]} lleva mucho tiempo sin descongelar`, resuelve: (m) => `Equipo ${m[1]} ya descongeló` },
  { re: /^g(\d) resistencia bloqueada$/, tipo: 'atencion',
    aparece: (m) => `La resistencia del equipo ${m[1]} está bloqueada`, resuelve: (m) => `Equipo ${m[1]}: se desbloqueó la resistencia` },
  { re: /^g(\d) deshabilitado$/, tipo: 'atencion',
    aparece: (m) => `Equipo ${m[1]} deshabilitado`, resuelve: (m) => `Equipo ${m[1]} habilitado` },
  { re: /^horario (\d) solapado$/, tipo: 'alarma', flag: (m, c) => `${c}.H${m[1]}.solapado`,
    aparece: (m) => `El horario ${m[1]} se superpone con otro`, resuelve: (m) => `Horario ${m[1]}: se corrigió la superposición` },
  { re: /^horario (\d) hora invalida$/, tipo: 'alarma', flag: (m, c) => `${c}.H${m[1]}.hora_invalida`,
    aparece: (m) => `El horario ${m[1]} tiene una hora no válida`, resuelve: (m) => `Horario ${m[1]}: se corrigió la hora` },
  { re: /^horario (\d) tiempo invalido$/, tipo: 'alarma', flag: (m, c) => `${c}.H${m[1]}.tiempo_invalido`,
    aparece: (m) => `El horario ${m[1]} tiene un tiempo no válido`, resuelve: (m) => `Horario ${m[1]}: se corrigió el tiempo` },
  { re: /^descongelado etapa (\d)$/, tipo: 'info',
    aparece: (m) => `Empezó la etapa ${Number(m[1]) + 1} del descongelado`, resuelve: (m) => `Terminó la etapa ${Number(m[1]) + 1} del descongelado` },
  { re: /^etapa 1 sin confirmacion$/, tipo: 'alarma', flag: (_m, c) => `${c}.alarma_espera`,
    aparece: () => 'Esperó demasiado para empezar la etapa 2 del descongelado', resuelve: () => 'Se recuperó la espera de la etapa del descongelado' },
  { re: /^recuperacion invalida$/, tipo: 'alarma', flag: (_m, c) => `${c}.alarma_recuperacion`,
    aparece: () => 'Tardó demasiado en volver a frío', resuelve: () => 'Volvió a frío con normalidad' },
  { re: /^manual prolongado$/, tipo: 'alarma', flag: (_m, c) => `${c}.alarma_manual`,
    aparece: () => 'Hay equipos en manual demasiado tiempo', resuelve: () => 'Ya no hay equipos en manual de más' },
  { re: /^reloj del plc invalido$/, tipo: 'alarma', flag: () => 'alarma_reloj',
    aparece: () => 'El reloj del PLC no es válido', resuelve: () => 'El reloj del PLC volvió a estar bien' },
  { re: /^indice fuera de rango$/, tipo: 'alarma', flag: () => 'alarma_indice',
    aparece: () => 'Falló el índice de alarmas del PLC', resuelve: () => 'El índice de alarmas del PLC volvió a estar bien' },
  { re: /^g(\d) reset contadores$/, tipo: 'operario', aparece: (m) => `Un operario reinició los contadores del equipo ${m[1]}` },
  { re: /^modo stop$/, tipo: 'operario', aparece: () => 'La cámara se detuvo' },
  { re: /^modo automatico$/, tipo: 'operario', aparece: () => 'La cámara pasó a automático' },
  { re: /^modo manual$/, tipo: 'operario', aparece: () => 'La cámara pasó a manual' },
  { re: /^g(\d) modo auto$/, tipo: 'operario', aparece: (m) => `Equipo ${m[1]} pasó a automático` },
  { re: /^g(\d) modo manual$/, tipo: 'operario', aparece: (m) => `Equipo ${m[1]} pasó a manual` },
  { re: /^g(\d) res manual \(fin\)$/, tipo: 'info', aparece: (m) => `Equipo ${m[1]}: terminó la resistencia manual` },
  { re: /^g(\d) descongelado cortado$/, tipo: 'cortado', aparece: (m) => `Se cortó a mano el descongelado del equipo ${m[1]}` },
  { re: /^salto de descongelado$/, tipo: 'operario', aparece: () => 'Un operario saltó el descongelado' },
  { re: /^etapas cambiadas$/, tipo: 'operario', aparece: () => 'Se cambió el reparto de equipos por etapa' },
  { re: /^etapas: reparto rechazado$/, tipo: 'atencion', aparece: () => 'El PLC rechazó el reparto de equipos por etapa' },
  { re: /^arranque del plc$/, tipo: 'info', aparece: () => 'El PLC arrancó' },
  { re: /^grupos en manual al arrancar$/, tipo: 'atencion', aparece: () => 'Al arrancar el PLC había equipos en manual' },
  { re: /^arranque: manual confirmado$/, tipo: 'operario', aparece: () => 'Al arrancar, un operario confirmó dejar los equipos en manual' },
  { re: /^arranque: a auto por operador$/, tipo: 'operario', aparece: () => 'Al arrancar, un operario pasó los equipos a automático' },
  { re: /^arranque: a auto por tiempo$/, tipo: 'operario', aparece: () => 'Al arrancar, los equipos pasaron a automático por tiempo' },
  { re: /^rem\s+u\d+(?:\s+c(\d))?(?:\s+g(\d))?(?:\s+h(\d))?\s+(.+)$/, tipo: 'operario', aparece: (m) => fraseRem(m[1], m[2], m[3], m[4]) },
];
const esRem = (texto) => /^rem\s+u\d/i.test(String(texto ?? '').trim());
const REPARTO_MAX = 8;
const equiposDeReparto = (n) => Array.from({ length: REPARTO_MAX }, (_, i) => i + 1).filter((i) => (n >> (i - 1)) & 1);
const minTxt = (s) => `${s.replace(/\.0+$/, '').replace('.', ',')} min`;
const ONOFF = (on, si, no) => (on === 'on' ? si : no);
function fraseRem(c, g, h, suf) {
  const eq = g ? `equipo ${g}` : 'todos los equipos';
  const de = g ? `equipo ${g}: ` : '';
  const hor = h ? `horario ${h}` : 'horario';
  const s = suf.replace(/\s+/g, ' ');
  let m;
  const cuerpo =
    (m = s.match(/^modo (auto|manual|fuera)$/)) ? `${eq} ${g ? 'pasó' : 'pasaron'} a ${m[1] === 'auto' ? 'automático' : m[1] === 'manual' ? 'manual' : 'fuera de servicio'}`
    : (m = s.match(/^(comp|eva) (on|off)$/)) ? `${de}${m[1] === 'comp' ? 'compresor' : 'evaporador'} ${ONOFF(m[2], 'encendido', 'apagado')}`
    : s === 'res off' ? `${de}resistencia apagada`
    : (m = s.match(/^res (\d+) min$/)) ? `${de}resistencia ${m[1]} min`
    : s === 'salto desc' ? `${de}se saltó el descongelado`
    : s === 'corte desc' ? `${de}se cortó el descongelado`
    : s === 'arranque mantener' ? 'al arrancar, se dejan los equipos en manual'
    : s === 'arranque auto' ? 'al arrancar, se pasan los equipos a automático'
    : (m = s.match(/^hora (\d{2})(\d{2})$/)) ? `${hor} a las ${m[1]}:${m[2]}`
    : (m = s.match(/^hab (on|off)$/)) ? `${de}${ONOFF(m[1], 'habilitado', 'deshabilitado')}`
    : (m = s.match(/^e([12]) t (\d+(?:\.\d+)?)$/)) ? `${hor}, etapa ${m[1]} = ${minTxt(m[2])}`
    : (m = s.match(/^e([12]) (on|off)$/)) ? `${hor}, etapa ${m[1]} ${ONOFF(m[2], 'activada', 'desactivada')}`
    : (m = s.match(/^reparto (\d+)$/)) ? `${hor}, etapa 2: ${((q) => (q.length ? `equipos ${q.join(', ')}` : 'ningún equipo'))(equiposDeReparto(Number(m[1])))}`
    : (m = s.match(/^recup (\d+) min$/)) ? `recuperación ${m[1]} min`
    : (m = s.match(/^ajuste (\d) ?= ?(\d+)$/)) ? (m[1] === '1' ? `tope de la resistencia en manual = ${Number(m[2]) ? `${m[2]} min` : 'sin tope'}`
      : m[1] === '2' ? `horas máximas sin descongelar = ${m[2]} h` : m[1] === '3' ? `horas máximas en manual = ${m[2]} h` : `ajuste ${m[1]} = ${m[2]}`)
    : s === 'reset mant' ? `${de}se reinició el mantenimiento`
    : s;
  return `Desde el portal: ${c ? `Cámara ${c}, ` : ''}${cuerpo}`;
}
const normEvento = (texto) => String(texto ?? '').trim().toLowerCase();
function buscarEvento(texto) {
  const t = normEvento(texto);
  const cm = t.match(/^(c\d)\s+/);
  const c = cm ? cm[1].toUpperCase() : '';
  const sin = t.replace(/^c\d\s+/, '');
  for (const row of EVENTOS) { const m = sin.match(row.re); if (m) return { row, m, c }; }
  return null;
}
const sale = (estado) => estado != null && estado !== '' && Number(estado) === 0;

function fraseEvento(texto, estado) {
  const r = buscarEvento(texto);
  if (r) return sale(estado) && r.row.resuelve ? r.row.resuelve(r.m) : r.row.aparece(r.m);
  const t = normEvento(texto).replace(/^c\d\s+/, '').replace(/\bg(\d)\b/g, 'equipo $1');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function tipoAviso(texto, estado) {
  const r = buscarEvento(texto);
  if (!r) return 'info';
  if (sale(estado) && r.row.resuelve && (r.row.tipo === 'alarma' || r.row.tipo === 'atencion')) return 'resuelto';
  return r.row.tipo;
}
function claveAlarmaDeEvento(texto) {
  const r = buscarEvento(texto);
  if (!r || (r.row.tipo !== 'alarma' && r.row.tipo !== 'atencion') || !r.row.flag || !r.row.resuelve) return null;
  const k = r.row.flag(r.m, r.c);
  return k.startsWith('.') ? null : k;
}
// Cámara de un evento ("C5 ..." o "REM u3 C5 ..."); null = de la planta.
function camaraDeEvento(texto) {
  const t = normEvento(texto);
  const m = t.match(/^c(\d)\s/) || t.match(/^rem\s+u\d+\s+c(\d)\b/);
  return m ? `C${m[1]}` : null;
}

// ---- períodos de alarma (alarmas.ts periodosAlarma / agruparPeriodos) ----
const sube = (e) => Number(e.estado) !== 0;
const deAlarma = (e) => !e.maniobra && claveAlarmaDeEvento(e.texto) !== null;
function periodosAlarma(eventos) {
  const abiertos = new Map();
  const r = [];
  const vistas = new Set();
  for (const e of eventos.filter(deAlarma).sort((a, b) => a.ts - b.ts)) {
    const clave = claveAlarmaDeEvento(e.texto);
    const p = abiertos.get(clave);
    const primera = !vistas.has(clave); vistas.add(clave);
    if (sube(e)) {
      if (p) continue;
      const n = { clave, frase: e.texto, inicio: e.ts, fin: null, duracionMin: null };
      abiertos.set(clave, n); r.push(n);
    } else if (p) {
      p.fin = e.ts; p.duracionMin = Math.round((e.ts - p.inicio) / 60000); abiertos.delete(clave);
    } else if (primera) {
      r.push({ clave, frase: e.texto, inicio: null, fin: e.ts, duracionMin: null });
    }
  }
  return r.reverse();
}
const parseClave = (clave) => {
  const p = clave.split('.');
  const g = p.find((x) => /^G\d+$/.test(x));
  return { camara: /^C\d+$/.test(p[0]) ? p[0] : null, equipo: g ? Number(g.slice(1)) : null, tipo: p[p.length - 1] };
};
// camaraImplicita: se omite el nombre de esa cámara (sección de la cámara). Sin sujeto, la frase va con mayúscula.
const titulo = (camara, equipos, tipo, camaraImplicita) => {
  const t = textoAlarma(tipo);
  const txt = equipos.length > 1 ? t.textoPlural || t.texto : t.texto;
  const eq = equipos.length ? `${equipos.length > 1 ? 'Equipos' : 'Equipo'} ${equipos.join(', ')}` : '';
  const cam = camara === null ? 'PLC' : camara === camaraImplicita ? '' : nombreCamara(camara);
  const suj = [cam, eq].filter(Boolean).join(' · ');
  return suj ? `${suj}: ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1);
};
const TOLERANCIA_MIN = 5;
const TOL = TOLERANCIA_MIN * 60000;
const cerca = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= TOL : (a ?? null) === (b ?? null) && typeof a !== 'number');
function agrupar(items, base, tiempos) {
  const orden = [...items].sort((a, b) => (tiempos(a)[0] ?? -Infinity) - (tiempos(b)[0] ?? -Infinity));
  const grupos = [];
  for (const x of orden) {
    const g = grupos.find((g) => base(g[0]) === base(x) && tiempos(g[0]).every((t, k) => cerca(t, tiempos(x)[k])));
    if (g) g.push(x); else grupos.push([x]);
  }
  return grupos;
}
const numeros = (v) => v.filter((t) => typeof t === 'number');
const minimo = (v) => (numeros(v).length ? Math.min(...numeros(v)) : null);
const maximo = (v) => (numeros(v).length ? Math.max(...numeros(v)) : null);
// Más nueva primero, como en el portal.
function agruparPeriodos(periodos, { camaraImplicita } = {}) {
  return agrupar(periodos.map((p) => ({ p, ...parseClave(p.clave) })), (x) => `${x.camara}|${x.tipo}`, (x) => [x.p.inicio, x.p.fin]).map((g) => {
    const equipos = g.map((x) => x.equipo).filter((e) => e !== null).sort((a, b) => a - b);
    const { camara, tipo } = g[0];
    const inicio = minimo(g.map((x) => x.p.inicio)); const fin = maximo(g.map((x) => x.p.fin));
    return { claves: g.map((x) => x.p.clave), camara, equipos, texto: titulo(camara, equipos, tipo, camaraImplicita), inicio, fin,
      duracionMin: inicio !== null && fin !== null ? Math.round((fin - inicio) / 60000) : null };
  }).sort((a, b) => (b.inicio ?? b.fin ?? 0) - (a.inicio ?? a.fin ?? 0));
}

// ---- historial.ts ----
function agruparCompresores(filas) {
  const m = new Map();
  for (const f of filas) {
    const k = `${f.camara}.${f.grupo}`;
    const a = m.get(k) || { camara: f.camara, grupo: f.grupo, horas: 0, horasSinDatos: 0, arranques: 0, maxArranquesHora: 0 };
    a.horas += Number(f.horas) || 0;
    a.horasSinDatos += Number(f.horasSinDatos) || 0;
    a.arranques += Number(f.arranques) || 0;
    a.maxArranquesHora = Math.max(a.maxArranquesHora, Number(f.maxArranquesHora) || 0);
    m.set(k, a);
  }
  const n = (g) => Number(g.replace(/\D/g, '')) || 0;
  return [...m.values()].sort((a, b) => a.camara.localeCompare(b.camara) || n(a.grupo) - n(b.grupo));
}
const equipoDe = (grupo) => `Equipo ${String(grupo).replace(/^G/, '')}`;
const horasTxt = (h) => `${(Math.round(h * 10) / 10).toString().replace('.', ',')} h`;
const duracionTxt = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

const VENTANA_CORRIDA_MS = 2 * 36e5;
const GRAVEDAD = ['completo', 'cortado a mano', 'sin datos', 'saltado', 'no se hizo'];
function contarDescongelados(filas) {
  const porHorario = new Map();
  for (const f of filas) {
    const k = `${f.camara}|${f.horario}`;
    porHorario.set(k, [...(porHorario.get(k) || []), f]);
  }
  const r = { hechos: 0, saltados: 0, noSeHizo: 0, cortados: 0 };
  for (const fs of porHorario.values()) {
    const orden = [...fs].sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0));
    let corrida = [];
    const cerrar = () => {
      if (!corrida.length) return;
      const e = corrida.map((f) => badgeDescongelado(f).etiqueta).sort((a, b) => GRAVEDAD.indexOf(b) - GRAVEDAD.indexOf(a))[0];
      if (e === 'saltado') r.saltados++;
      else if (e === 'no se hizo') r.noSeHizo++;
      else if (e !== 'sin datos') { r.hechos++; if (e === 'cortado a mano') r.cortados++; }
      corrida = [];
    };
    for (const f of orden) {
      if (corrida.length && (f.inicio ?? 0) - (corrida[0].inicio ?? 0) > VENTANA_CORRIDA_MS) cerrar();
      corrida.push(f);
    }
    cerrar();
  }
  return r;
}

const TIPO = { alarma: 'Alarma', atencion: 'Atención', resuelto: 'Resuelto', cortado: 'Se cortó', operario: 'Acción de un operario', info: 'Informativo' };
const textoManiobra = (f) => (Number(f.estado) === 1 ? f.texto : `${f.texto} (${Number(f.estado) === 0 ? 'sin confirmar' : 'no se hizo'})`);
const VENTANA_REM_MS = 120e3;
function quitarRemDuplicados(eventos) {
  const man = eventos.filter((e) => e.maniobra && e.comando !== 'visto').map((e) => e.ts); // un "visto" no genera REM en el PLC
  return eventos.filter((e) => e.maniobra || !esRem(e.texto) || !man.some((t) => Math.abs(t - e.ts) <= VENTANA_REM_MS));
}

// Equipos que trabajan distinto al resto de su cámara (copia de equiposDistintos de frontend-react/src/lib/historial.ts).
// Contra la mediana: bastante más horas (≥ +25 % y +2 h), muchos más arranques (≥ ×2 y +6) o bastante menos horas (≤ ½ y −4 h).
// ponytail: umbrales fijos; si en planta molestan, pasarlos a Configuración.
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const h1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
function equiposDistintos(equipos, dias = 1) {
  if (equipos.length < 4) return [];
  const d = Math.max(1, dias);
  const hs = equipos.map((e) => e.horas / d), as = equipos.map((e) => e.arranques / d);
  const mh = mediana(hs), ma = mediana(as);
  const r = [];
  equipos.forEach((e, i) => {
    const h = hs[i], a = as[i];
    const motivos = [];
    if (mh > 0 && h >= mh * 1.25 && h - mh >= 2) motivos.push(`anduvo ${h1(h)} h${d > 1 ? ' por día' : ''} y el resto ~${h1(mh)} h`);
    if (mh > 0 && h <= mh * 0.5 && mh - h >= 4) motivos.push(`anduvo solo ${h1(h)} h${d > 1 ? ' por día' : ''} y el resto ~${h1(mh)} h`);
    if (a >= Math.max(1, ma) * 2 && a - ma >= 6) motivos.push(`arrancó ${h1(a)} veces${d > 1 ? ' por día' : ''} y el resto ~${h1(ma)}`);
    if (motivos.length) r.push({ grupo: e.grupo, motivo: motivos.join('; ') });
  });
  return r;
}

module.exports = {
  nombreCamara, textoAlarma, badgeDescongelado, esRem, fraseEvento, tipoAviso, claveAlarmaDeEvento, camaraDeEvento,
  periodosAlarma, agruparPeriodos, TOLERANCIA_MIN, agruparCompresores, equiposDistintos, equipoDe, horasTxt, duracionTxt, contarDescongelados,
  TIPO, textoManiobra, quitarRemDuplicados,
};

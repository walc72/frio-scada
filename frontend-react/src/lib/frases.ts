// Traductor del estado plano del PLC (mapa.js decodificar) a frases para personas no técnicas. Funciones puras.
// Nunca inventa números: si algo no se puede calcular, la frase lo dice sin cifra.
import type { Estado } from '../store/camaras'
import { GRUPOS, HORARIOS, nombreCamara, txt, num, hhmm, aMin, minutoAhora, type FilaDescongelado } from './camaras'
import { colorEstadoGrupo } from './estadoGrupo'

export type Nivel = 'ok' | 'atencion' | 'alarma' | 'sin-datos'
export type NombreIcono = 'frio' | 'descongelando' | 'escurriendo' | 'alarma' | 'manual' | 'apagado'
export type ClaveEstado = 'sin-datos' | 'DESHABILITADO' | 'DETENIDO' | 'FRIO' | 'DESCONGELANDO' | 'ESCURRIENDO' | 'ALARMA RES' | 'MANUAL'

export const UMBRAL_ARRANQUES_HORA = 6

const EQUIPO: Record<ClaveEstado, { texto: string; icono: NombreIcono }> = {
  'sin-datos': { texto: 'Sin datos', icono: 'apagado' },
  'DESHABILITADO': { texto: 'Apagado', icono: 'apagado' },
  'DETENIDO': { texto: 'Detenido', icono: 'apagado' },
  'FRIO': { texto: 'Enfriando', icono: 'frio' },
  'DESCONGELANDO': { texto: 'Descongelando', icono: 'descongelando' },
  'ESCURRIENDO': { texto: 'Escurriendo', icono: 'escurriendo' },
  'ALARMA RES': { texto: 'Con alarma', icono: 'alarma' },
  'MANUAL': { texto: 'Manual', icono: 'manual' },
}

export function estadoEquipo(estado: Estado, c: string, g: number) {
  const k = txt(estado, `${c}.G${g}.estado`)
  const clave = (k !== 'sin-datos' && k in EQUIPO ? k : 'sin-datos') as ClaveEstado
  return { clave, ...EQUIPO[clave], color: colorEstadoGrupo(clave === 'sin-datos' ? 'DETENIDO' : clave).fondo }
}

const gruposEn = (e: Estado, c: string, clave: ClaveEstado) => GRUPOS.filter(g => estadoEquipo(e, c, g).clave === clave)
const horaValida = (s: string) => /^\d{1,2}:\d{2}$/.test(s)
const hhmmMin = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }
const hhmmDe = (s: string) => hhmmMin(aMin(s))
const equipos = (n: number) => (n === 1 ? '1 equipo' : `${n} equipos`)
const esNum = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v))

// Horario en ventana (el descongelado que está corriendo ahora)
const horarioEnVentana = (e: Estado, c: string) =>
  HORARIOS.find(h => txt(e, `${c}.H${h}.estado`) === 'EN VENTANA' || num(e, `${c}.H${h}.en_ventana`) === 1)

// Minutos que lleva descongelando la cámara: el mayor de sus equipos descongelando (solo para "desde HH:MM")
function minTranscurridos(e: Estado, c: string): number | null {
  const v = gruposEn(e, c, 'DESCONGELANDO').map(g => e[`${c}.G${g}.min_descongelado`]).filter(esNum).map(Number)
  return v.length ? Math.max(...v) : null
}

// Minutos que faltan para terminar la etapa en curso. Por equipo descongelando: duración de su etapa (Hh.etapaE_min,
// con E sacado del dígito 1|2 de Hh.etapas) menos su propio Gg.min_descongelado. Si los equipos están en etapas
// distintas o a alguno le falta un dato, null (no se mezcla la etapa de uno con el tiempo de otro).
export function faltanMin(estado: Estado, c: string): number | null {
  const h = horarioEnVentana(estado, c)
  const gs = gruposEn(estado, c, 'DESCONGELANDO')
  if (h == null || !gs.length) return null
  const etapas = txt(estado, `${c}.H${h}.etapas`)
  const falta: number[] = []
  let digito = ''
  for (const g of gs) {
    const d = etapas[g - 1]
    const trans = estado[`${c}.G${g}.min_descongelado`]
    if ((d !== '1' && d !== '2') || (digito && d !== digito) || !esNum(trans)) return null
    digito = d
    const dur = estado[`${c}.H${h}.etapa${Number(d) - 1}_min`]
    if (!esNum(dur) || !(Number(dur) > 0)) return null
    falta.push(Math.max(0, Math.round(Number(dur) - Number(trans))))
  }
  return Math.max(...falta)
}

// "hoy 12:00" | "mañana 04:00" | "Sin descongelados programados". Reloj: minutoAhora (hora del PLC si el estado es fresco).
export function proximoTexto(estado: Estado, c: string, ahora: number): string {
  const horas = HORARIOS.filter(h => txt(estado, `${c}.H${h}.estado`) === 'PROGRAMADO').map(h => txt(estado, `${c}.H${h}.hora`)).filter(horaValida)
    .sort((a, b) => aMin(a) - aMin(b))
  if (!horas.length) return 'Sin descongelados programados'
  const ahoraMin = minutoAhora(estado, ahora)
  const hoy = horas.find(h => aMin(h) > ahoraMin)
  return hoy ? `hoy ${hhmmDe(hoy)}` : `mañana ${hhmmDe(horas[0])}`
}

// ---- alarmas ----
const ALARMAS: Record<string, { texto: string; textoPlural?: string; accion?: string }> = {
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
}
export function textoAlarma(clave: string): { texto: string; textoPlural?: string; accion?: string } {
  return ALARMAS[clave.split('.').pop() ?? ''] ?? { texto: 'hay una alarma en el PLC', accion: 'avisar al técnico' }
}

// Mantener en sincronía con definiciones() de nodered/weg-api/src/services/alertasCamaras.js (mismos flags de alarma).
interface AlarmaActiva { clave: string; c?: string; g?: number }
export function alarmasActivas(e: Estado, c?: string): AlarmaActiva[] {
  const r: AlarmaActiva[] = []
  if (!c) for (const k of ['alarma_reloj', 'alarma_indice']) if (e[k]) r.push({ clave: k })
  for (const cam of c ? [c] : ['C4', 'C5']) {
    for (const k of ['alarma_espera', 'alarma_recuperacion', 'alarma_manual']) if (e[`${cam}.${k}`]) r.push({ clave: `${cam}.${k}`, c: cam })
    for (const g of GRUPOS) {
      if (e[`${cam}.G${g}.alarma_res`] || e[`${cam}.G${g}.estado`] === 'ALARMA RES') r.push({ clave: `${cam}.G${g}.alarma_res`, c: cam, g })
      if (e[`${cam}.G${g}.alarma_sin_desc`]) r.push({ clave: `${cam}.G${g}.alarma_sin_desc`, c: cam, g })
    }
    for (const h of HORARIOS) for (const k of ['hora_invalida', 'solapado', 'tiempo_invalido']) if (e[`${cam}.H${h}.${k}`]) r.push({ clave: `${cam}.H${h}.${k}`, c: cam })
  }
  return r
}

const tituloAlarma = (a: AlarmaActiva) =>
  a.c ? (a.g ? `${nombreCamara(a.c)}: el equipo ${a.g} necesita atención` : `${nombreCamara(a.c)} necesita atención`) : 'El PLC necesita atención'
function detalleAlarma(a: AlarmaActiva, total = 1) {
  const t = textoAlarma(a.clave)
  const sujeto = a.g ? `Equipo ${a.g}` : a.c ? nombreCamara(a.c) : 'PLC'
  return `${sujeto}: ${t.texto}${t.accion ? ` · ${t.accion}` : ''}${total > 1 ? ` (y ${total - 1} más)` : ''}`
}

// Por qué la cámara no tiene ningún equipo funcionando (enfriando, descongelando o escurriendo), o null si lo tiene
function sinFuncionar(e: Estado, c: string): string | null {
  if (txt(e, `${c}.modo`) === 'STOP') return 'La cámara está detenida'
  if (GRUPOS.some(g => ['FRIO', 'DESCONGELANDO', 'ESCURRIENDO'].includes(estadoEquipo(e, c, g).clave))) return null
  return 'Los equipos están deshabilitados o detenidos'
}
const hayDatos = (e: Estado, c: string) => Object.keys(e).some(k => k.startsWith(`${c}.`))

// ---- frases ----
export function fraseCamara(estado: Estado, c: string, ahora: number): { titulo: string; detalle: string; nivel: Nivel } {
  if (!estado || !hayDatos(estado, c)) return { titulo: 'Sin datos todavía', detalle: '', nivel: 'sin-datos' }
  const prox = proximoTexto(estado, c, ahora)
  const detProx = prox.startsWith('Sin') ? prox : `Próximo descongelado: ${prox}`

  const al = alarmasActivas(estado, c)
  if (al.length) {
    const gs = [...new Set(al.filter(a => a.g).map(a => a.g!))]
    const titulo = gs.length === 1 ? `El equipo ${gs[0]} necesita atención` : gs.length > 1 ? `${gs.length} equipos necesitan atención` : 'La cámara necesita atención'
    return { titulo, detalle: detalleAlarma(al[0], al.length), nivel: 'alarma' }
  }

  const sf = sinFuncionar(estado, c)
  if (sf) return { titulo: `${nombreCamara(c)}: ningún equipo está funcionando`, detalle: sf, nivel: 'atencion' }

  const n = (k: ClaveEstado) => gruposEn(estado, c, k).length
  const desc = n('DESCONGELANDO')
  if (desc) {
    const falta = faltanMin(estado, c)
    let desde = ''
    if (falta == null) {
      const trans = minTranscurridos(estado, c)
      const h = horarioEnVentana(estado, c)
      const hora = trans != null ? hhmmMin(minutoAhora(estado, ahora) - trans) : h != null ? txt(estado, `${c}.H${h}.hora`) : ''
      desde = horaValida(hora) ? ` desde ${hhmmDe(hora)}` : ''
    }
    const titulo = `${equipos(desc)} descongelando` + (falta != null ? `, ${desc === 1 ? 'termina' : 'terminan'} en ${falta} min` : desde)
    const p = prox.startsWith('Sin') ? '' : ` · próximo: ${prox.replace(/^(hoy|mañana) /, '')}`
    return { titulo, detalle: `Después vuelven a frío${p}`, nivel: 'ok' }
  }
  const esc = n('ESCURRIENDO')
  if (esc) return { titulo: `${equipos(esc)} escurriendo`, detalle: `Después vuelven a frío · ${detProx}`, nivel: 'ok' }
  const man = n('MANUAL')
  if (man) return { titulo: `${equipos(man)} en manual`, detalle: man === 1 ? 'Pasarlo a automático desde el panel' : 'Pasarlos a automático desde el panel', nivel: 'atencion' }
  const frio = n('FRIO')
  if (frio === GRUPOS.length) return { titulo: `Los ${GRUPOS.length} equipos enfriando`, detalle: detProx, nivel: 'ok' }
  if (frio) return { titulo: `${equipos(frio)} enfriando`, detalle: detProx, nivel: 'ok' }
  return { titulo: 'Sin equipos funcionando', detalle: detProx, nivel: 'ok' }
}

// `mapa` = store.mapa (el store saca _mapa del estado)
export function semaforo(estado: Estado | null, fresco: boolean, ts: number | null, mapa?: string | null): { nivel: Nivel; titulo: string; detalle: string } {
  if (mapa === 'incompatible') {
    return { nivel: 'atencion', titulo: 'El PLC tiene un programa viejo', detalle: 'Los datos no se pueden interpretar. Avisar al técnico' }
  }
  if (!estado || !fresco) {
    return ts ? { nivel: 'sin-datos', titulo: `Sin datos desde ${hhmm(ts)}`, detalle: 'No se está recibiendo información del PLC' }
      : { nivel: 'sin-datos', titulo: 'Sin datos todavía', detalle: 'Esperando información del PLC' }
  }
  const al = alarmasActivas(estado)
  if (al.length) return { nivel: 'alarma', titulo: tituloAlarma(al[0]), detalle: detalleAlarma(al[0], al.length) }
  for (const c of ['C4', 'C5']) {
    if (!hayDatos(estado, c)) return { nivel: 'sin-datos', titulo: 'Sin datos todavía', detalle: 'Esperando información del PLC' }
    const sf = sinFuncionar(estado, c)
    if (sf) return { nivel: 'atencion', titulo: `${nombreCamara(c)}: ningún equipo está funcionando`, detalle: sf }
  }
  for (const c of ['C4', 'C5']) {
    const m = gruposEn(estado, c, 'MANUAL')
    if (m.length) return { nivel: 'atencion', titulo: `${nombreCamara(c)}: ${m.length === 1 ? `el equipo ${m[0]} está` : `${m.length} equipos están`} en manual`, detalle: m.length === 1 ? 'Pasarlo a automático desde el panel' : 'Pasarlos a automático desde el panel' }
  }
  const ahora = ts ?? Date.now()
  return { nivel: 'ok', titulo: 'Todo funcionando bien', detalle: ['C4', 'C5'].map(c => `${nombreCamara(c)}: ${fraseCamara(estado, c, ahora).titulo}`).join(' · ') }
}

// ---- historial de descongelados ----
const listaEquipos = (s: string) => {
  const n = s.split(',').map(x => x.trim().replace(/^G/, '')).filter(Boolean)
  return n.length ? `${n.length === 1 ? 'equipo' : 'equipos'} ${n.join(', ')}` : 'un equipo'
}
export function badgeDescongelado(f: FilaDescongelado): { etiqueta: 'completo' | 'cortado a mano' | 'saltado' | 'no se hizo' | 'sin datos'; motivo: string } {
  if (f.cortados) return { etiqueta: 'cortado a mano', motivo: `Un operario cortó el descongelado del ${listaEquipos(f.cortados)}` }
  if (f.saltado) return { etiqueta: 'saltado', motivo: 'Se salteó porque los equipos no estaban en condiciones de descongelar' }
  if (f.noEjecutada) return { etiqueta: 'no se hizo', motivo: 'El horario pasó y el descongelado no se ejecutó' }
  if (f.interrumpida) return { etiqueta: 'sin datos', motivo: 'Se cortó la comunicación con el PLC y no se sabe cómo terminó' }
  return { etiqueta: 'completo', motivo: 'Terminó normalmente' }
}

// ---- avisos ----
// Catálogo de textos reales del PLC (ver eventos-plc-catalogo.md). Las alarmas y condiciones con flanco salen con el MISMO
// texto: estado 1 al aparecer y 0 al resolverse. `flag` = clave del estado vivo (con la cámara `c` del texto) si la hay.
export type TipoAviso = 'alarma' | 'atencion' | 'resuelto' | 'cortado' | 'operario' | 'info'
interface RowEvento {
  re: RegExp; tipo: TipoAviso
  flag?: (m: RegExpMatchArray, c: string) => string
  aparece: (m: RegExpMatchArray) => string
  resuelve?: (m: RegExpMatchArray) => string
}
// Los flags de las alarmas deben coincidir con alertasCamaras.js definiciones() y con alarmasActivas: mantener en sincronía.
const EVENTOS: RowEvento[] = [
  { re: /^g(\d) resistencia t\.max$/, tipo: 'alarma', flag: (m, c) => `${c}.G${m[1]}.alarma_res`,
    aparece: m => `Se cortó la resistencia del equipo ${m[1]} por tiempo máximo`, resuelve: m => `Equipo ${m[1]}: se normalizó la resistencia` },
  { re: /^g(\d) sin descongelar$/, tipo: 'alarma', flag: (m, c) => `${c}.G${m[1]}.alarma_sin_desc`,
    aparece: m => `Equipo ${m[1]} lleva mucho tiempo sin descongelar`, resuelve: m => `Equipo ${m[1]} ya descongeló` },
  { re: /^g(\d) resistencia bloqueada$/, tipo: 'atencion',
    aparece: m => `La resistencia del equipo ${m[1]} está bloqueada`, resuelve: m => `Equipo ${m[1]}: se desbloqueó la resistencia` },
  { re: /^g(\d) deshabilitado$/, tipo: 'atencion',
    aparece: m => `Equipo ${m[1]} deshabilitado`, resuelve: m => `Equipo ${m[1]} habilitado` },
  { re: /^horario (\d) solapado$/, tipo: 'alarma', flag: (m, c) => `${c}.H${m[1]}.solapado`,
    aparece: m => `El horario ${m[1]} se superpone con otro`, resuelve: m => `Horario ${m[1]}: se corrigió la superposición` },
  { re: /^horario (\d) hora invalida$/, tipo: 'alarma', flag: (m, c) => `${c}.H${m[1]}.hora_invalida`,
    aparece: m => `El horario ${m[1]} tiene una hora no válida`, resuelve: m => `Horario ${m[1]}: se corrigió la hora` },
  { re: /^horario (\d) tiempo invalido$/, tipo: 'alarma', flag: (m, c) => `${c}.H${m[1]}.tiempo_invalido`,
    aparece: m => `El horario ${m[1]} tiene un tiempo no válido`, resuelve: m => `Horario ${m[1]}: se corrigió el tiempo` },
  { re: /^descongelado etapa (\d)$/, tipo: 'info',
    aparece: m => `Empezó la etapa ${Number(m[1]) + 1} del descongelado`, resuelve: m => `Terminó la etapa ${Number(m[1]) + 1} del descongelado` },
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
  { re: /^g(\d) reset contadores$/, tipo: 'operario', aparece: m => `Un operario reinició los contadores del equipo ${m[1]}` },
  { re: /^modo stop$/, tipo: 'operario', aparece: () => 'La cámara se detuvo' },
  { re: /^modo automatico$/, tipo: 'operario', aparece: () => 'La cámara pasó a automático' },
  { re: /^modo manual$/, tipo: 'operario', aparece: () => 'La cámara pasó a manual' },
  { re: /^g(\d) modo auto$/, tipo: 'operario', aparece: m => `Equipo ${m[1]} pasó a automático` },
  { re: /^g(\d) modo manual$/, tipo: 'operario', aparece: m => `Equipo ${m[1]} pasó a manual` },
  { re: /^g(\d) res manual \(fin\)$/, tipo: 'info', aparece: m => `Equipo ${m[1]}: terminó la resistencia manual` },
  { re: /^g(\d) descongelado cortado$/, tipo: 'cortado', aparece: m => `Se cortó a mano el descongelado del equipo ${m[1]}` },
  { re: /^salto de descongelado$/, tipo: 'operario', aparece: () => 'Un operario saltó el descongelado' },
  { re: /^etapas cambiadas$/, tipo: 'operario', aparece: () => 'Se cambió el reparto de equipos por etapa' },
  { re: /^etapas: reparto rechazado$/, tipo: 'atencion', aparece: () => 'El PLC rechazó el reparto de equipos por etapa' },
  { re: /^arranque del plc$/, tipo: 'info', aparece: () => 'El PLC arrancó' },
  { re: /^grupos en manual al arrancar$/, tipo: 'atencion', aparece: () => 'Al arrancar el PLC había equipos en manual' },
  { re: /^arranque: manual confirmado$/, tipo: 'operario', aparece: () => 'Al arrancar, un operario confirmó dejar los equipos en manual' },
  { re: /^arranque: a auto por operador$/, tipo: 'operario', aparece: () => 'Al arrancar, un operario pasó los equipos a automático' },
  { re: /^arranque: a auto por tiempo$/, tipo: 'operario', aparece: () => 'Al arrancar, los equipos pasaron a automático por tiempo' },
]
const normEvento = (texto: string) => String(texto ?? '').trim().toLowerCase()
function buscarEvento(texto: string) {
  const t = normEvento(texto)
  const c = t.match(/^(c\d)\s+/)?.[1].toUpperCase() ?? ''
  const sin = t.replace(/^c\d\s+/, '')
  for (const row of EVENTOS) { const m = sin.match(row.re); if (m) return { row, m, c } }
  return null
}
const sale = (estado: unknown) => estado != null && estado !== '' && Number(estado) === 0

export function fraseEvento(texto: string, estado?: number | string): string {
  const r = buscarEvento(texto)
  if (r) return sale(estado) && r.row.resuelve ? r.row.resuelve(r.m) : r.row.aparece(r.m)
  const t = normEvento(texto).replace(/^c\d\s+/, '').replace(/\bg(\d)\b/g, 'equipo $1')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Tipo de aviso (color del punto). Alarma y condición con flanco: estado 0 = resuelto.
export function tipoAviso(texto: string, estado?: number | string): TipoAviso {
  const r = buscarEvento(texto)
  if (!r) return 'info'
  if (sale(estado) && r.row.resuelve && (r.row.tipo === 'alarma' || r.row.tipo === 'atencion')) return 'resuelto'
  return r.row.tipo
}

// ¿El flag de esa alarma sigue prendido en el estado vivo? Solo con estado fresco; sin flag conocido, false.
export function sigueActivo(texto: string, estado: Estado | null, fresco: boolean): boolean {
  if (!estado || !fresco) return false
  const r = buscarEvento(texto)
  const k = r?.row.flag?.(r.m, r.c)
  return !!k && !k.startsWith('.') && !!estado[k]
}

// Clave de estado vivo (la misma de alarmasActivas) del evento si es una alarma/atención con flag y texto de resuelto; si no, null.
// Por tipo: "DESCONGELADO ETAPA e" es info y no cuenta aunque tenga flanco.
export function claveAlarmaDeEvento(texto: string): string | null {
  const r = buscarEvento(texto)
  if (!r || (r.row.tipo !== 'alarma' && r.row.tipo !== 'atencion') || !r.row.flag || !r.row.resuelve) return null
  const k = r.row.flag(r.m, r.c)
  return k.startsWith('.') ? null : k
}

// Etiqueta de estado de la cámara (mismos colores que el HMI); null si no hay datos o nada que decir
export function badgeCamara(estado: Estado, c: string, nivel: Nivel): { t: string; c: string } | null {
  if (nivel === 'sin-datos') return null
  if (nivel === 'alarma') return { t: 'Atención', c: colorEstadoGrupo('ALARMA RES').fondo }
  if (nivel === 'atencion') return { t: 'Atención', c: '#F59E0B' }
  const n = (k: ClaveEstado) => gruposEn(estado, c, k).length
  return n('DESCONGELANDO') ? { t: 'Descongelando', c: colorEstadoGrupo('DESCONGELANDO').fondo }
    : n('ESCURRIENDO') ? { t: 'Escurriendo', c: colorEstadoGrupo('ESCURRIENDO').fondo }
    : n('FRIO') ? { t: 'Enfriando', c: colorEstadoGrupo('FRIO').fondo } : null
}

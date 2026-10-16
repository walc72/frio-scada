// Traductor del estado plano del PLC (mapa.js decodificar) a frases para personas no técnicas. Funciones puras.
// Nunca inventa números: si algo no se puede calcular, la frase lo dice sin cifra.
import type { Estado } from '../store/camaras'
import { GRUPOS, HORARIOS, nombreCamara, txt, num, hhmm, type FilaDescongelado } from './camaras'
import { colorEstadoGrupo } from './estadoGrupo'

export type Nivel = 'ok' | 'atencion' | 'alarma' | 'sin-datos'
export type NombreIcono = 'frio' | 'descongelando' | 'escurriendo' | 'alarma' | 'manual' | 'apagado'
export type ClaveEstado = 'DESHABILITADO' | 'DETENIDO' | 'FRIO' | 'DESCONGELANDO' | 'ESCURRIENDO' | 'ALARMA RES' | 'MANUAL'

export const UMBRAL_ARRANQUES_HORA = 6

const EQUIPO: Record<ClaveEstado, { texto: string; icono: NombreIcono }> = {
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
  const clave = (k in EQUIPO ? k : 'DESHABILITADO') as ClaveEstado
  return { clave, ...EQUIPO[clave], color: colorEstadoGrupo(clave).fondo }
}

const gruposEn = (e: Estado, c: string, clave: ClaveEstado) => GRUPOS.filter(g => estadoEquipo(e, c, g).clave === clave)
const aMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
const horaValida = (s: string) => /^\d{1,2}:\d{2}$/.test(s)
const hhmmDe = (s: string) => { const m = aMin(s); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
const equipos = (n: number) => (n === 1 ? '1 equipo' : `${n} equipos`)
const esNum = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v))

// Horario en ventana (el descongelado que está corriendo ahora)
const horarioEnVentana = (e: Estado, c: string) =>
  HORARIOS.find(h => txt(e, `${c}.H${h}.estado`) === 'EN VENTANA' || num(e, `${c}.H${h}.en_ventana`) === 1)

// Minutos que lleva descongelando la cámara: el dato de cámara, o el mayor de sus equipos descongelando
function minTranscurridos(e: Estado, c: string): number | null {
  if (esNum(e[`${c}.min_descongelado`])) return Number(e[`${c}.min_descongelado`])
  const v = gruposEn(e, c, 'DESCONGELANDO').map(g => e[`${c}.G${g}.min_descongelado`]).filter(esNum).map(Number)
  return v.length ? Math.max(...v) : null
}

// Minutos que faltan para terminar la etapa en curso: duración de la etapa (Hh.etapaE_min) menos lo transcurrido.
// La etapa sale de Hh.etapas (un dígito 1|2 por equipo) del primer equipo descongelando.
export function faltanMin(estado: Estado, c: string): number | null {
  const h = horarioEnVentana(estado, c)
  const g = gruposEn(estado, c, 'DESCONGELANDO')[0]
  const trans = minTranscurridos(estado, c)
  if (h == null || g == null || trans == null) return null
  const d = txt(estado, `${c}.H${h}.etapas`)[g - 1]
  if (d !== '1' && d !== '2') return null
  const dur = estado[`${c}.H${h}.etapa${Number(d) - 1}_min`]
  if (!esNum(dur) || !(Number(dur) > 0)) return null
  return Math.max(0, Math.round(Number(dur) - trans))
}

// "hoy 12:00" | "mañana 04:00" | "Sin descongelados programados". `ahora` en ms; hora de planta.
export function proximoTexto(estado: Estado, c: string, ahora: number): string {
  const horas = HORARIOS.filter(h => txt(estado, `${c}.H${h}.estado`) === 'PROGRAMADO').map(h => txt(estado, `${c}.H${h}.hora`)).filter(horaValida)
    .sort((a, b) => aMin(a) - aMin(b))
  if (!horas.length) return 'Sin descongelados programados'
  const ahoraMin = aMin(hhmm(ahora))
  const hoy = horas.find(h => aMin(h) > ahoraMin)
  return hoy ? `hoy ${hhmmDe(hoy)}` : `mañana ${hhmmDe(horas[0])}`
}

// ---- alarmas ----
const ALARMAS: Record<string, { texto: string; accion?: string }> = {
  alarma_reloj: { texto: 'el reloj del PLC está mal', accion: 'avisar al técnico para ajustar la hora' },
  alarma_indice: { texto: 'falló el índice de alarmas del PLC', accion: 'avisar al técnico' },
  alarma_espera: { texto: 'esperó demasiado para empezar una etapa de descongelado', accion: 'revisar que los equipos de la etapa anterior hayan terminado' },
  alarma_recuperacion: { texto: 'tardó demasiado en volver a frío', accion: 'revisar que los equipos estén enfriando' },
  alarma_manual: { texto: 'hay equipos en manual demasiado tiempo', accion: 'pasarlos a automático desde el panel' },
  alarma_res: { texto: 'la resistencia se cortó por tiempo', accion: 'avisar al técnico para revisar la resistencia' },
  alarma_sin_desc: { texto: 'lleva demasiadas horas sin descongelar', accion: 'revisar los horarios de descongelado' },
  hora_invalida: { texto: 'un horario de descongelado tiene una hora inválida', accion: 'corregirlo en la configuración del PLC' },
  solapado: { texto: 'un horario de descongelado se pisa con otro', accion: 'corregirlo en la configuración del PLC' },
  tiempo_invalido: { texto: 'un horario de descongelado tiene un tiempo inválido', accion: 'corregirlo en la configuración del PLC' },
}
export function textoAlarma(clave: string): { texto: string; accion?: string } {
  return ALARMAS[clave.split('.').pop() ?? ''] ?? { texto: 'hay una alarma en el PLC', accion: 'avisar al técnico' }
}

interface AlarmaActiva { clave: string; c?: string; g?: number }
function alarmasActivas(e: Estado, c?: string): AlarmaActiva[] {
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
  a.c ? `${nombreCamara(a.c)}: ${a.g ? `el equipo ${a.g}` : 'la cámara'} necesita atención` : 'El PLC necesita atención'
function detalleAlarma(a: AlarmaActiva) {
  const t = textoAlarma(a.clave)
  const sujeto = a.g ? `Equipo ${a.g}` : a.c ? nombreCamara(a.c) : 'PLC'
  return `${sujeto}: ${t.texto}${t.accion ? ` · ${t.accion}` : ''}`
}

// ---- frases ----
export function fraseCamara(estado: Estado, c: string, ahora: number): { titulo: string; detalle: string; nivel: Nivel } {
  if (!estado || !Object.keys(estado).some(k => k.startsWith(`${c}.`))) return { titulo: 'Sin datos todavía', detalle: '', nivel: 'sin-datos' }
  const prox = proximoTexto(estado, c, ahora)
  const detProx = prox.startsWith('Sin') ? prox : `Próximo descongelado: ${prox}`

  const al = alarmasActivas(estado, c)
  if (al.length) {
    const gs = [...new Set(al.filter(a => a.g).map(a => a.g!))]
    const titulo = gs.length === 1 ? `El equipo ${gs[0]} necesita atención` : gs.length > 1 ? `${gs.length} equipos necesitan atención` : 'La cámara necesita atención'
    return { titulo, detalle: detalleAlarma(al[0]), nivel: 'alarma' }
  }

  const n = (k: ClaveEstado) => gruposEn(estado, c, k).length
  const desc = n('DESCONGELANDO')
  if (desc) {
    const falta = faltanMin(estado, c)
    let desde = ''
    if (falta == null) {
      const trans = minTranscurridos(estado, c)
      const h = horarioEnVentana(estado, c)
      const hora = trans != null ? hhmm(ahora - trans * 60000) : h != null ? txt(estado, `${c}.H${h}.hora`) : ''
      desde = horaValida(hora) ? ` desde ${hhmmDe(hora)}` : ''
    }
    const titulo = `${equipos(desc)} descongelando` + (falta != null ? `, ${desc === 1 ? 'termina' : 'terminan'} en ${falta} min` : desde)
    const p = prox.startsWith('Sin') ? '' : ` · próximo: ${prox.replace(/^(hoy|mañana) /, '')}`
    return { titulo, detalle: `Después vuelven a frío${p}`, nivel: 'ok' }
  }
  const esc = n('ESCURRIENDO')
  if (esc) return { titulo: `${equipos(esc)} escurriendo`, detalle: `Después vuelven a frío · ${detProx}`, nivel: 'ok' }
  const man = n('MANUAL')
  if (man) return { titulo: `${equipos(man)} en manual`, detalle: 'Pasarlos a automático desde el panel', nivel: 'atencion' }
  const frio = n('FRIO')
  if (frio === GRUPOS.length) return { titulo: `Los ${GRUPOS.length} equipos enfriando`, detalle: detProx, nivel: 'ok' }
  if (frio) return { titulo: `${equipos(frio)} enfriando`, detalle: detProx, nivel: 'ok' }
  return { titulo: 'Sin equipos funcionando', detalle: detProx, nivel: 'ok' }
}

// `mapa` (store.mapa) es opcional: el store saca _mapa del estado, así que los consumidores reales lo pasan acá.
export function semaforo(estado: Estado | null, fresco: boolean, ts: number | null, mapa?: string | null): { nivel: Nivel; titulo: string; detalle: string } {
  if (!estado || !fresco) {
    return ts ? { nivel: 'sin-datos', titulo: `Sin datos desde ${hhmm(ts)}`, detalle: 'No se está recibiendo información del PLC' }
      : { nivel: 'sin-datos', titulo: 'Sin datos todavía', detalle: 'Esperando información del PLC' }
  }
  if (mapa === 'incompatible' || estado._mapa === 'incompatible') {
    return { nivel: 'atencion', titulo: 'El PLC tiene un programa viejo', detalle: 'Los datos no se pueden interpretar. Avisar al técnico' }
  }
  const al = alarmasActivas(estado)
  if (al.length) return { nivel: 'alarma', titulo: tituloAlarma(al[0]), detalle: detalleAlarma(al[0]) }
  for (const c of ['C4', 'C5']) {
    const m = gruposEn(estado, c, 'MANUAL')
    if (m.length) return { nivel: 'atencion', titulo: `${nombreCamara(c)}: ${m.length === 1 ? `el equipo ${m[0]} está` : `${m.length} equipos están`} en manual`, detalle: 'Pasarlos a automático desde el panel' }
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

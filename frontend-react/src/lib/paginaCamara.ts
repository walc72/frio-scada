// Helpers puros de la página de una cámara: tramos -> segmentos de barra y horarios -> frases.
import type { Estado } from '../store/camaras'
import { HORARIOS, ZONA, txt, num, hhmm, type FilaDescongelado } from './camaras'
import { badgeDescongelado } from './frases'

export type EstadoTramo = 'frio' | 'descongelando' | 'apagado' | 'sin-datos'
// La API devuelve inicio/fin como ISO; el resto del código usa ms
export interface TramoApi { camara: string; grupo: string; inicio: string; fin: string; estado: EstadoTramo }
export interface Tramo { camara: string; grupo: string; inicio: number; fin: number; estado: EstadoTramo }
export const aTramos = (rows: TramoApi[]): Tramo[] => rows.map(r => ({ ...r, inicio: Date.parse(r.inicio), fin: Date.parse(r.fin) })).filter(t => Number.isFinite(t.inicio) && Number.isFinite(t.fin))
export const COLOR_TRAMO: Record<EstadoTramo, string> = { frio: '#1E6FD9', descongelando: '#F28C28', apagado: '#9A9A9A', 'sin-datos': '#E5E7EB' }
export const TEXTO_TRAMO: Record<EstadoTramo, string> = { frio: 'Enfriando', descongelando: 'Descongelando', apagado: 'Apagado', 'sin-datos': 'Sin datos' }

const aMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export const pct = (min: number) => Math.min(100, Math.max(0, (min / 1440) * 100))

// Día de planta (YYYY-MM-DD) de un instante
export const diaPlanta = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: ZONA })
// Minutos desde las 00:00 de planta
export const minutoDelDia = (ms: number) => aMin(hhmm(ms))

// Tramos de un equipo -> segmentos {izq, ancho} en % del día, recortados a [dia0, ahora]
export function segmentos(tramos: Tramo[], grupo: number, dia0: number, ahora: number) {
  const ms = (t: number) => pct((Math.min(Math.max(t, dia0), ahora) - dia0) / 60000)
  return tramos.filter(t => t.grupo === `G${grupo}` && t.fin > dia0 && t.inicio < ahora)
    .map(t => ({ izq: ms(t.inicio), ancho: ms(t.fin) - ms(t.inicio), estado: t.estado }))
    .filter(s => s.ancho > 0)
}

export type EstadoHorario = 'hecho' | 'en curso' | 'próximo' | 'pendiente' | 'sin registro' | 'ya pasó' | 'solapado' | 'mal configurado'
export interface HorarioVista { h: number; hora: string; min: number; estado: EstadoHorario; frase: string; nota: string }

const IMPARES = [1, 3, 5, 7], PARES = [2, 4, 6, 8]
const igual = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])
const sufijo = (gs: number[]) => igual(gs, IMPARES) ? 'impares' : igual(gs, PARES) ? 'pares' : ''
const un = (gs: number[]) => gs.length === 8 ? 'todos los equipos' : sufijo(gs) ? `equipos ${sufijo(gs)} (${gs.join(', ')})` : `${gs.length === 1 ? 'equipo' : 'equipos'} ${gs.join(', ')}`
const art = (gs: number[]) => gs.length === 8 ? 'todos' : sufijo(gs) ? `los ${sufijo(gs)}` : `${gs.length === 1 ? 'el equipo' : 'los equipos'} ${gs.join(', ')}`

// "equipos pares (2, 4, 6, 8)" | "primero los impares, después los pares" | '' si no hay reparto
export function repartoTexto(e: Estado, c: string, h: number): string {
  const s = txt(e, `${c}.H${h}.etapas`)
  const etapas = [0, 1].filter(i => num(e, `${c}.H${h}.etapa${i}_habilitada`) === 1)
    .map(i => [...s].map((d, g) => (d === String(i + 1) ? g + 1 : 0)).filter(Boolean))
    .filter(gs => gs.length)
  if (etapas.length === 1) return un(etapas[0])
  if (etapas.length === 2) return `primero ${art(etapas[0])}, después ${art(etapas[1])}`
  return ''
}

// "Ahora" en minutos del día: la hora del PLC (reloj de pared) si viene, si no la de planta
export function minutoAhora(e: Estado | null, ahora: number): number {
  const p = txt(e, 'hora_plc').slice(11, 16)
  return /^\d{2}:\d{2}$/.test(p) ? aMin(p) : minutoDelDia(ahora)
}

// Horarios habilitados, ordenados por hora. "hecho" sale de las filas de /descongelados de hoy (filas=null: todavía no se sabe).
export function horariosVista(e: Estado, c: string, ahora: number, filas: FilaDescongelado[] | null = null): HorarioVista[] {
  const m = minutoAhora(e, ahora)
  const hs = HORARIOS.map(h => ({ h, est: txt(e, `${c}.H${h}.estado`), hora: txt(e, `${c}.H${h}.hora`) }))
    .filter(x => x.est && x.est !== 'DESHABILITADO' && /^\d{1,2}:\d{2}$/.test(x.hora))
    .map(x => ({ ...x, min: aMin(x.hora) })).sort((a, b) => a.min - b.min)
  const prox = hs.find(x => x.est === 'PROGRAMADO' && x.min > m)
  return hs.map(x => {
    const mias = (filas ?? []).filter(f => f.camara === c && Number(String(f.horario).replace(/\D/g, '')) === x.h)
    const nota = mias.map(f => badgeDescongelado(f).etiqueta).find(t => t !== 'completo') ?? ''
    const estado: EstadoHorario = x.est === 'EN VENTANA' || num(e, `${c}.H${x.h}.en_ventana`) === 1 ? 'en curso'
      : mias.length ? 'hecho'
      : x.est === 'SOLAPADO' ? 'solapado'
      : x.est !== 'PROGRAMADO' ? 'mal configurado'
      : x.min <= m ? (filas ? 'sin registro' : 'ya pasó') : x === prox ? 'próximo' : 'pendiente'
    const frase = estado === 'solapado' ? 'Se superpone con otro horario: revisar la programación'
      : estado === 'mal configurado' ? 'Horario mal configurado, avisar al técnico' : repartoTexto(e, c, x.h)
    return { h: x.h, hora: x.hora, min: x.min, estado, frase, nota }
  })
}

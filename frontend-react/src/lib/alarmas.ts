// Alarmas del PLC: desde cuándo están activas y sus períodos inicio/fin. Funciones puras sobre /api/camaras/eventos.
import type { Estado } from '../store/camaras'
import { nombreCamara } from './camaras'
import { alarmasActivas, claveAlarmaDeEvento, textoAlarma } from './frases'

export interface Evento { ts: number; texto: string; estado: number | string; maniobra?: boolean }

const sube = (e: Evento) => Number(e.estado) !== 0
const deAlarma = (e: Evento) => !e.maniobra && claveAlarmaDeEvento(e.texto) !== null
const porTs = (eventos: Evento[]) => eventos.filter(deAlarma).sort((a, b) => a.ts - b.ts)

export const esEventoDeAlarma = (e: Evento) => claveAlarmaDeEvento(e.texto) !== null

// ts de la última aparición sin cierre posterior; null si no hay (la alarma viene de antes de los eventos cargados)
export function desdeAlarma(eventos: Evento[], clave: string): number | null {
  const ult = porTs(eventos).filter(e => claveAlarmaDeEvento(e.texto) === clave).pop()
  return ult && sube(ult) ? ult.ts : null
}

export interface AlarmaActivaVista { clave: string; titulo: string; accion?: string; desde: number | null }
export function alarmasActivasVista(estado: Estado, eventos: Evento[], camara?: string): AlarmaActivaVista[] {
  return alarmasActivas(estado, camara).map(a => {
    const t = textoAlarma(a.clave)
    const sujeto = a.g ? `Equipo ${a.g}` : a.c ? nombreCamara(a.c) : 'PLC'
    return { clave: a.clave, titulo: `${sujeto}: ${t.texto}`, accion: t.accion, desde: desdeAlarma(eventos, a.clave) }
  })
}

export interface PeriodoAlarma { clave: string; frase: string; inicio: number; fin: number | null; duracionMin: number | null }
// Cada aparición con su cierre (mismo texto, estado 0). Más nueva primero.
export function periodosAlarma(eventos: Evento[]): PeriodoAlarma[] {
  const abiertos = new Map<string, PeriodoAlarma>()
  const r: PeriodoAlarma[] = []
  for (const e of porTs(eventos)) {
    const clave = claveAlarmaDeEvento(e.texto)!
    const p = abiertos.get(clave)
    if (sube(e)) {
      if (p) continue // repetido sin cierre: se queda el inicio original
      const n = { clave, frase: e.texto, inicio: e.ts, fin: null, duracionMin: null }
      abiertos.set(clave, n); r.push(n)
    } else if (p) {
      p.fin = e.ts; p.duracionMin = Math.round((e.ts - p.inicio) / 60000); abiertos.delete(clave)
    }
  }
  return r.reverse()
}

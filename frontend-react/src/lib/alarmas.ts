// Alarmas del PLC: desde cuándo están activas y sus períodos inicio/fin. Funciones puras sobre /api/camaras/eventos.
import type { Estado } from '../store/camaras'
import { nombreCamara } from './camaras'
import { alarmasActivas, claveAlarmaDeEvento, textoAlarma } from './frases'

export interface Evento { ts: number; texto: string; estado: number | string; maniobra?: boolean }

const sube = (e: Evento) => Number(e.estado) !== 0
const deAlarma = (e: Evento) => !e.maniobra && claveAlarmaDeEvento(e.texto) !== null
const porTs = (eventos: Evento[]) => eventos.filter(deAlarma).sort((a, b) => a.ts - b.ts)

// Último evento de cada alarma (por clave), una sola pasada
export function ultimoPorClave(eventos: Evento[]): Map<string, Evento> {
  const m = new Map<string, Evento>()
  for (const e of porTs(eventos)) m.set(claveAlarmaDeEvento(e.texto)!, e)
  return m
}

// ts de la última aparición sin cierre posterior; null si no hay (la alarma viene de antes de los eventos cargados)
export function desdeAlarma(ult: Map<string, Evento>, clave: string): number | null {
  const e = ult.get(clave)
  return e && sube(e) ? e.ts : null
}

export interface AlarmaActivaVista { clave: string; titulo: string; accion?: string; desde: number | null }
// Con camara: las de esa cámara más las de la planta (reloj, índice)
export function alarmasActivasVista(estado: Estado, ult: Map<string, Evento>, camara?: string): AlarmaActivaVista[] {
  return alarmasActivas(estado).filter(a => !camara || !a.c || a.c === camara).map(a => {
    const t = textoAlarma(a.clave)
    const sujeto = a.g ? `Equipo ${a.g}` : a.c ? nombreCamara(a.c) : 'PLC'
    return { clave: a.clave, titulo: `${sujeto}: ${t.texto}`, accion: t.accion, desde: desdeAlarma(ult, a.clave) }
  })
}

export interface PeriodoAlarma { clave: string; frase: string; inicio: number | null; fin: number | null; duracionMin: number | null }
// Cada aparición con su cierre (mismo texto, estado 0). Más nueva primero.
export function periodosAlarma(eventos: Evento[]): PeriodoAlarma[] {
  const abiertos = new Map<string, PeriodoAlarma>()
  const r: PeriodoAlarma[] = []
  const vistas = new Set<string>()
  for (const e of porTs(eventos)) {
    const clave = claveAlarmaDeEvento(e.texto)!
    const p = abiertos.get(clave)
    const primera = !vistas.has(clave); vistas.add(clave)
    if (sube(e)) {
      if (p) continue // repetido sin cierre: se queda el inicio original
      const n = { clave, frase: e.texto, inicio: e.ts, fin: null, duracionMin: null }
      abiertos.set(clave, n); r.push(n)
    } else if (p) {
      p.fin = e.ts; p.duracionMin = Math.round((e.ts - p.inicio!) / 60000); abiertos.delete(clave)
    } else if (primera) { // cierre sin inicio dentro de los eventos cargados: empezó antes del período
      r.push({ clave, frase: e.texto, inicio: null, fin: e.ts, duracionMin: null })
    }
  }
  return r.reverse()
}

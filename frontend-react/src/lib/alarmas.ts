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

// "C5.G4.alarma_sin_desc" → cámara C5, equipo 4, tipo alarma_sin_desc; "alarma_reloj" → planta
const parseClave = (clave: string) => {
  const p = clave.split('.')
  const g = p.find(x => /^G\d+$/.test(x))
  return { camara: /^C\d+$/.test(p[0]) ? p[0] : null, equipo: g ? Number(g.slice(1)) : null, tipo: p[p.length - 1] }
}
const ordenCamara = (c: string | null) => (c === null ? '' : c)
// Un solo renglón por (cámara, tipo, instante): "Cámara 5 · Equipos 1, 3: lleva(n)…". camaraImplicita: se omite su nombre (página de esa cámara).
const titulo = (camara: string | null, equipos: number[], tipo: string, camaraImplicita?: string) => {
  const t = textoAlarma(tipo)
  const txt = equipos.length > 1 ? t.textoPlural ?? t.texto : t.texto
  const eq = equipos.length ? `${equipos.length > 1 ? 'Equipos' : 'Equipo'} ${equipos.join(', ')}` : ''
  const cam = camara === null ? 'PLC' : camara === camaraImplicita ? '' : nombreCamara(camara)
  return `${[cam, eq].filter(Boolean).join(' · ')}: ${txt}`
}
const agrupar = <T,>(items: T[], clave: (x: T) => string) => {
  const m = new Map<string, T[]>()
  for (const x of items) { const k = clave(x); m.set(k, [...(m.get(k) ?? []), x]) }
  return [...m.values()]
}

export interface GrupoActivo { clave: string; camara: string | null; titulo: string; accion?: string; desde: number | null | undefined; equipos: number[] }
export function agruparActivas(lista: (Omit<AlarmaActivaVista, 'desde'> & { desde?: number | null })[], opciones: { camaraImplicita?: string } = {}): GrupoActivo[] {
  const ps = lista.map(a => ({ a, ...parseClave(a.clave) }))
  return agrupar(ps, x => `${x.camara}|${x.tipo}|${x.a.desde === null ? 'null' : x.a.desde === undefined ? 'u' : Math.floor(x.a.desde / 60000)}`)
    .map(g => {
      const equipos = g.map(x => x.equipo).filter((e): e is number => e !== null).sort((a, b) => a - b)
      const { camara, tipo } = g[0]
      return { clave: `${camara}|${tipo}|${g[0].a.desde}`, camara, titulo: titulo(camara, equipos, tipo, opciones.camaraImplicita), accion: textoAlarma(tipo).accion, desde: g[0].a.desde, equipos, tipo }
    })
    .sort((a, b) => ordenCamara(a.camara).localeCompare(ordenCamara(b.camara)) || a.tipo.localeCompare(b.tipo) || 0)
    .map(({ tipo: _t, ...r }) => r)
}

export interface GrupoPeriodo { claves: string[]; camara: string | null; equipos: number[]; texto: string; inicio: number | null; fin: number | null; duracionMin: number | null }
export function agruparPeriodos(periodos: PeriodoAlarma[]): GrupoPeriodo[] {
  const min = (t: number | null) => (t === null ? 'null' : Math.floor(t / 60000))
  return agrupar(periodos.map(p => ({ p, ...parseClave(p.clave) })), x => `${x.camara}|${x.tipo}|${min(x.p.inicio)}|${min(x.p.fin)}`).map(g => {
    const equipos = g.map(x => x.equipo).filter((e): e is number => e !== null).sort((a, b) => a - b)
    const { camara, tipo, p } = g[0]
    return { claves: g.map(x => x.p.clave), camara, equipos, texto: titulo(camara, equipos, tipo), inicio: p.inicio, fin: p.fin, duracionMin: p.duracionMin }
  })
}

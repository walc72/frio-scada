// Funciones puras del Historial: agregación de compresores y filas de exportación (columnas visibles, en palabras).
import { nombreCamara, fechaHora, type FilaDescongelado } from './camaras'
import type { Estado } from '../store/camaras'
import type { PeriodoAlarma } from './alarmas'
import { badgeDescongelado, fraseEvento, tipoAviso, sigueActivo, type TipoAviso } from './frases'

export interface FilaCompresor { camara: string; dia: string; grupo: string; horas: number; horasSinDatos?: number; arranques: number; maxArranquesHora: number }
export interface Compresor { camara: string; grupo: string; horas: number; horasSinDatos: number; arranques: number; maxArranquesHora: number }

// Un renglón por equipo: suma horas y arranques de los días, y toma el máximo de arranques por hora.
export function agruparCompresores(filas: FilaCompresor[]): Compresor[] {
  const m = new Map<string, Compresor>()
  for (const f of filas) {
    const k = `${f.camara}.${f.grupo}`
    const a = m.get(k) ?? { camara: f.camara, grupo: f.grupo, horas: 0, horasSinDatos: 0, arranques: 0, maxArranquesHora: 0 }
    a.horas += Number(f.horas) || 0
    a.horasSinDatos += Number(f.horasSinDatos) || 0
    a.arranques += Number(f.arranques) || 0
    a.maxArranquesHora = Math.max(a.maxArranquesHora, Number(f.maxArranquesHora) || 0)
    m.set(k, a)
  }
  const n = (g: string) => Number(g.replace(/\D/g, '')) || 0
  return [...m.values()].sort((a, b) => a.camara.localeCompare(b.camara) || n(a.grupo) - n(b.grupo))
}

export const equipoDe = (grupo: string) => `Equipo ${grupo.replace(/^G/, '')}`
export const horasTxt = (h: number) => `${(Math.round(h * 10) / 10).toString().replace('.', ',')} h`

// Las filas de /descongelados son una por ETAPA. Una corrida = (cámara, horario, inicio más temprano de las etapas
// que empezaron a <= 2 h entre sí). Cada corrida se clasifica con badgeDescongelado: gana la peor etiqueta.
// hechos = corridas que se ejecutaron (completo + cortado a mano); cortados es el subconjunto cortado a mano.
const VENTANA_CORRIDA_MS = 2 * 36e5
const GRAVEDAD = ['completo', 'cortado a mano', 'sin datos', 'saltado', 'no se hizo']
export function contarDescongelados(filas: FilaDescongelado[]): { hechos: number; saltados: number; noSeHizo: number; cortados: number } {
  const porHorario = new Map<string, FilaDescongelado[]>()
  for (const f of filas) {
    const k = `${f.camara}|${f.horario}`
    porHorario.set(k, [...(porHorario.get(k) ?? []), f])
  }
  const r = { hechos: 0, saltados: 0, noSeHizo: 0, cortados: 0 }
  for (const fs of porHorario.values()) {
    const orden = [...fs].sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0))
    let corrida: FilaDescongelado[] = []
    const cerrar = () => {
      if (!corrida.length) return
      const e = corrida.map(f => badgeDescongelado(f).etiqueta).sort((a, b) => GRAVEDAD.indexOf(b) - GRAVEDAD.indexOf(a))[0]
      if (e === 'saltado') r.saltados++
      else if (e === 'no se hizo') r.noSeHizo++
      else if (e !== 'sin datos') { r.hechos++; if (e === 'cortado a mano') r.cortados++ }
      corrida = []
    }
    for (const f of orden) {
      if (corrida.length && (f.inicio ?? 0) - (corrida[0].inicio ?? 0) > VENTANA_CORRIDA_MS) cerrar()
      corrida.push(f)
    }
    cerrar()
  }
  return r
}

export const filasDescongelados = (data: FilaDescongelado[]) => data.map(f => {
  const b = badgeDescongelado(f)
  return { Cámara: nombreCamara(f.camara), Hora: f.inicio ? fechaHora(f.inicio) : '', Equipos: f.grupos.replace(/G/g, ''), Resultado: b.etiqueta, Motivo: b.motivo }
})

const TIPO: Record<TipoAviso, string> = { alarma: 'Alarma', atencion: 'Atención', resuelto: 'Resuelto', cortado: 'Se cortó', operario: 'Acción de un operario', info: 'Informativo' }

export interface AvisoFila { ts: number; texto: string; estado: string | number; tipo: TipoAviso; frase: string; sigue: boolean; maniobra?: boolean }
// Maniobra desde el portal ("usuario: acción"); el estado es el resultado del PLC (1 hecho, 0 sin confirmar, otro no se hizo)
export const textoManiobra = (f: { texto: string; estado: string | number }) =>
  Number(f.estado) === 1 ? f.texto : `${f.texto} (${Number(f.estado) === 0 ? 'sin confirmar' : 'no se hizo'})`
// Más nuevo primero. "Sigue activo" solo en el último evento de cada texto, si apareció (estado 1) y el flag vivo sigue prendido.
export function prepararAvisos(data: { ts: number; texto: string; estado: string | number; maniobra?: boolean }[], estado: Estado | null, fresco: boolean): AvisoFila[] {
  const vistos = new Set<string>()
  return [...data].sort((a, b) => b.ts - a.ts).map(f => {
    const k = String(f.texto ?? "").trim().toUpperCase()
    const nuevo = !vistos.has(k)
    vistos.add(k)
    if (f.maniobra) return { ...f, tipo: 'info' as TipoAviso, frase: textoManiobra(f), sigue: false }
    return { ...f, tipo: tipoAviso(f.texto, f.estado), frase: fraseEvento(f.texto, f.estado), sigue: nuevo && Number(f.estado) === 1 && sigueActivo(f.texto, estado, fresco) }
  })
}
export const filasEventos = (a: AvisoFila[]) =>
  a.map(f => ({ Hora: fechaHora(f.ts), Tipo: TIPO[f.tipo], Aviso: f.frase, 'Sigue activo': f.sigue ? 'sí' : '' }))

export const filasCompresores = (c: Compresor[]) => c.map(x => ({
  Cámara: nombreCamara(x.camara), Equipo: equipoDe(x.grupo), 'Horas en marcha': Math.round(x.horas * 10) / 10, Arranques: x.arranques,
  'Máximo de arranques por hora': x.maxArranquesHora, 'Horas sin datos': x.horasSinDatos,
}))

export const duracionTxt = (min: number) => min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
export const filasAlarmas = (p: PeriodoAlarma[]) => p.map(x => ({
  Inicio: fechaHora(x.inicio), Fin: x.fin === null ? 'sigue activa' : fechaHora(x.fin),
  'Duración (min)': x.duracionMin ?? '', Alarma: fraseEvento(x.frase, 1),
}))

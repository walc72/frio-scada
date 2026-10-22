// Funciones puras del Historial: agregación de compresores y filas de exportación (columnas visibles, en palabras).
import { nombreCamara, fechaHora, ventanaPlanta, type FilaDescongelado } from './camaras'
import type { Estado } from '../store/camaras'
import { agruparPeriodos, type PeriodoAlarma } from './alarmas'
import { badgeDescongelado, esRem, fraseEvento, tipoAviso, sigueActivo, type TipoAviso } from './frases'

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

// Pestaña Equipos: por cámara, cada equipo con su fila de días (horas en marcha y % del tiempo con datos),
// el % del período y los descongelados en que participó (filas por etapa con grupos "G1,G3"; sin saltados ni no ejecutados).
export interface DiaEquipo { dia: string; horas: number; pct: number | null; arranques: number }
export interface EquipoHist extends Compresor { dias: DiaEquipo[]; pct: number | null; descongelados: number }
export function equiposPorCamara(filas: FilaCompresor[], descong: FilaDescongelado[], ahora = Date.now()): { camara: string; equipos: EquipoHist[] }[] {
  const posibles = new Map<string, number>() // horas transcurridas del día de planta (el de hoy, parcial)
  const posible = (dia: string) => {
    if (!posibles.has(dia)) {
      const t0 = Date.parse(ventanaPlanta(dia, dia).desde)
      posibles.set(dia, Math.max(0, Math.min(24, (ahora - t0) / 36e5)))
    }
    return posibles.get(dia)!
  }
  const pct = (h: number, base: number) => base > 0.01 ? Math.min(1, h / base) : null
  const porCamara = new Map<string, EquipoHist[]>()
  for (const c of agruparCompresores(filas)) {
    const propias = filas.filter(f => f.camara === c.camara && f.grupo === c.grupo).sort((a, b) => a.dia.localeCompare(b.dia))
    const dias = propias.map(f => {
      const h = Number(f.horas) || 0
      return { dia: f.dia, horas: h, pct: pct(h, posible(f.dia) - (Number(f.horasSinDatos) || 0)), arranques: Number(f.arranques) || 0 }
    })
    const base = propias.reduce((s, f) => s + posible(f.dia) - (Number(f.horasSinDatos) || 0), 0)
    const descongelados = descong.filter(d => d.camara === c.camara && !d.saltado && !d.noEjecutada && d.grupos.split(',').includes(c.grupo)).length
    porCamara.set(c.camara, [...(porCamara.get(c.camara) ?? []), { ...c, dias, pct: pct(c.horas, base), descongelados }])
  }
  return [...porCamara].map(([camara, equipos]) => ({ camara, equipos }))
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
// El PLC registra "REM u.." al aplicar un comando del portal, y el API ya guarda esa misma acción como maniobra: se oculta el REM
// si hay una maniobra a +-120 s (sin maniobra cercana, p.ej. falló la auditoría, se queda).
const VENTANA_REM_MS = 120e3
export function quitarRemDuplicados<T extends { ts: number; texto: string; maniobra?: boolean; comando?: string }>(eventos: T[]): T[] {
  const man = eventos.filter(e => e.maniobra && e.comando !== 'visto').map(e => e.ts) // un "visto" no genera REM en el PLC
  return eventos.filter(e => e.maniobra || !esRem(e.texto) || !man.some(t => Math.abs(t - e.ts) <= VENTANA_REM_MS))
}
// Más nuevo primero. "Sigue activo" solo en el último evento de cada texto, si apareció (estado 1) y el flag vivo sigue prendido.
export function prepararAvisos(data: { ts: number; texto: string; estado: string | number; maniobra?: boolean }[], estado: Estado | null, fresco: boolean): AvisoFila[] {
  const vistos = new Set<string>()
  return [...quitarRemDuplicados(data)].sort((a, b) => b.ts - a.ts).map(f => {
    const k = String(f.texto ?? "").trim().toUpperCase()
    const nuevo = !vistos.has(k)
    vistos.add(k)
    if (f.maniobra) return { ...f, tipo: 'info' as TipoAviso, frase: textoManiobra(f), sigue: false }
    return { ...f, tipo: tipoAviso(f.texto, f.estado), frase: fraseEvento(f.texto, f.estado), sigue: nuevo && Number(f.estado) === 1 && sigueActivo(f.texto, estado, fresco) }
  })
}
export const filasEventos = (a: AvisoFila[]) =>
  a.map(f => ({ Hora: fechaHora(f.ts), Tipo: TIPO[f.tipo], Aviso: f.frase, 'Sigue activo': f.sigue ? 'sí' : '' }))

export const filasCompresores = (c: (Compresor & { pct?: number | null; descongelados?: number })[]) => c.map(x => ({
  Cámara: nombreCamara(x.camara), Equipo: equipoDe(x.grupo), 'Horas en marcha': Math.round(x.horas * 10) / 10,
  '% en marcha': x.pct == null ? '' : Math.round(x.pct * 100), Descongelados: x.descongelados ?? '', Arranques: x.arranques,
  'Máximo de arranques por hora': x.maxArranquesHora, 'Horas sin datos': x.horasSinDatos,
}))

export const duracionTxt = (min: number) => min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
// sigue(clave): la alarma sigue activa ahora y el rango termina hoy; si no, un período abierto es "sin cierre en el período"
export const filasAlarmas = (p: PeriodoAlarma[], sigue: (clave: string) => boolean = () => false) => agruparPeriodos(p).map(x => ({
  'Cámara': x.camara === null ? 'PLC' : nombreCamara(x.camara), Equipos: x.equipos.join(', '),
  Inicio: x.inicio === null ? 'antes del período' : fechaHora(x.inicio),
  Fin: x.fin === null ? (x.claves.every(sigue) ? 'sigue activa' : 'sin cierre en el período') : fechaHora(x.fin),
  'Duración (min)': x.duracionMin ?? '', Alarma: x.texto.replace(/^[^:]*: /, ''),
}))

// Equipos que trabajan distinto al resto de su cámara (por día: con varios días se compara el promedio diario).
// Contra la mediana de la cámara: bastante más horas (≥ +25 % y +2 h), muchos más arranques (≥ ×2 y +6) o bastante
// menos horas (≤ ½ y −4 h). Copia en weg-api/src/services/frases.js (equiposDistintos): mantener iguales.
// ponytail: umbrales fijos; si en planta molestan, pasarlos a Configuración.
export interface Distinto { grupo: string; motivo: string }
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const h1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',')
export function equiposDistintos(equipos: { grupo: string; horas: number; arranques: number }[], dias = 1): Distinto[] {
  if (equipos.length < 4) return []
  const d = Math.max(1, dias)
  const hs = equipos.map(e => e.horas / d), as = equipos.map(e => e.arranques / d)
  const mh = mediana(hs), ma = mediana(as)
  const r: Distinto[] = []
  equipos.forEach((e, i) => {
    const h = hs[i], a = as[i]
    const motivos: string[] = []
    if (mh > 0 && h >= mh * 1.25 && h - mh >= 2) motivos.push(`anduvo ${h1(h)} h${d > 1 ? ' por día' : ''} y el resto ~${h1(mh)} h`)
    if (mh > 0 && h <= mh * 0.5 && mh - h >= 4) motivos.push(`anduvo solo ${h1(h)} h${d > 1 ? ' por día' : ''} y el resto ~${h1(mh)} h`)
    if (a >= Math.max(1, ma) * 2 && a - ma >= 6) motivos.push(`arrancó ${h1(a)} veces${d > 1 ? ' por día' : ''} y el resto ~${h1(ma)}`)
    if (motivos.length) r.push({ grupo: e.grupo, motivo: motivos.join('; ') })
  })
  return r
}

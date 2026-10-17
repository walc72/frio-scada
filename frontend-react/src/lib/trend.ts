import type { Tramo, EstadoTramo } from './paginaCamara'
import { hhmm, type FilaDescongelado } from './camaras'

export type EstadoInstante = 'enfriando' | 'descongelando' | 'apagado' | 'sin datos'
const ESTADO: Record<EstadoTramo, EstadoInstante> = { frio: 'enfriando', descongelando: 'descongelando', apagado: 'apagado', 'sin-datos': 'sin datos' }

// Intervalo de cada tramo: [inicio, fin)
export function estadoEn(tramos: Tramo[], grupo: number, ts: number): EstadoInstante {
  const t = tramos.find(t => t.grupo === `G${grupo}` && t.inicio <= ts && ts < t.fin)
  return t ? ESTADO[t.estado] : 'sin datos'
}

export interface DescongeladoEnCurso { horario: number; inicio: number; etapa: 1 | 2; llevaMin: number; faltaMin: number | null; finEtapa: number | null }

export function descongeladoEn(filas: FilaDescongelado[], camara: string, ts: number, minutosPlan?: number): DescongeladoEnCurso | null {
  const f = filas.find(f => f.camara === camara && f.inicio <= ts && ts < (f.fin ?? Infinity))
  if (!f) return null
  // Misma corrida: la etapa 0 más cercana (hacia atrás) del mismo horario; si no hay, la propia fila
  const inicio = f.etapa === 0 ? f.inicio : filas.filter(x => x.camara === camara && x.horario === f.horario && x.etapa === 0 && x.inicio <= f.inicio).reduce((a, x) => Math.max(a, x.inicio), -Infinity)
  const llevaMin = Math.round((ts - (Number.isFinite(inicio) ? inicio : f.inicio)) / 60000)
  return { horario: Number(f.horario.replace(/\D/g, '')), inicio: Number.isFinite(inicio) ? inicio : f.inicio, etapa: (f.etapa + 1) as 1 | 2, llevaMin, faltaMin: minutosPlan == null ? null : minutosPlan - llevaMin, finEtapa: f.fin }
}

export interface DetalleInstante { ts: number; hora: string; equipos: { grupo: number; estado: EstadoInstante }[]; descongelado: DescongeladoEnCurso | null; resumen: string }

export function detalleEnInstante(tramos: Tramo[], filas: FilaDescongelado[], camara: string, ts: number, minutosPlan?: number): DetalleInstante {
  const equipos = [1, 2, 3, 4, 5, 6, 7, 8].map(grupo => ({ grupo, estado: estadoEn(tramos, grupo, ts) }))
  const de = (e: EstadoInstante) => equipos.filter(x => x.estado === e).map(x => x.grupo)
  const lista = (e: EstadoInstante) => de(e).join(', ')
  let resumen: string
  if (de('enfriando').length === 8) resumen = 'Los 8 equipos enfriando'
  else if (de('sin datos').length === 8) resumen = 'Sin datos'
  else {
    const cola = (['apagado', 'sin datos'] as const).filter(e => de(e).length).map(e => ` · ${e === 'apagado' ? 'apagados' : 'sin datos'}: ${lista(e)}`).join('')
    const n = de('enfriando').length
    resumen = (de('descongelando').length ? `Descongelando: equipos ${lista('descongelando')}` : `${n} equipo${n === 1 ? '' : 's'} enfriando`) + cola
  }
  return { ts, hora: hhmm(ts), equipos, descongelado: descongeladoEn(filas, camara, ts, minutosPlan), resumen }
}

// Funciones puras del Historial: agregación de compresores y filas de exportación (columnas visibles, en palabras).
import { nombreCamara, fechaHora, type FilaDescongelado } from './camaras'
import { badgeDescongelado, fraseEvento, tipoAviso, type TipoAviso } from './frases'

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

export const filasDescongelados = (data: FilaDescongelado[]) => data.map(f => {
  const b = badgeDescongelado(f)
  return { Cámara: nombreCamara(f.camara), Hora: f.inicio ? fechaHora(f.inicio) : '', Equipos: f.grupos.replace(/G/g, ''), Resultado: b.etiqueta, Motivo: b.motivo }
})

const TIPO: Record<TipoAviso, string> = { alarma: 'Alarma', corte: 'Se cortó', resuelto: 'Resuelto', operario: 'Acción de un operario' }
export const filasAvisos = (data: { ts: number; texto: string; estado: string | number }[], activo: (texto: string) => boolean) =>
  data.map(f => ({ Hora: fechaHora(f.ts), Tipo: TIPO[tipoAviso(f.texto, f.estado)], Aviso: fraseEvento(f.texto), 'Sigue activo': activo(f.texto) ? 'sí' : '' }))

export const filasCompresores = (c: Compresor[]) => c.map(x => ({
  Cámara: nombreCamara(x.camara), Equipo: equipoDe(x.grupo), 'Horas en marcha': Math.round(x.horas * 10) / 10, Arranques: x.arranques,
  'Máximo de arranques por hora': x.maxArranquesHora, 'Horas sin datos': x.horasSinDatos,
}))

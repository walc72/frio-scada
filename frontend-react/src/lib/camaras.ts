import type { Estado } from '../store/camaras'

export const CAMARAS = ['C4', 'C5'] as const
export const nombreCamara = (c: string) => `Cámara ${c.slice(1)}`
export const GRUPOS = [1, 2, 3, 4, 5, 6, 7, 8]
export const HORARIOS = [1, 2, 3, 4]

export const txt = (e: Estado | null, k: string) => (e && e[k] != null ? String(e[k]) : '')
export const num = (e: Estado | null, k: string) => Number(e?.[k] ?? 0)

export const aMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// Hora de planta (Paraguay), sea cual sea la zona del navegador. La API usa TZ_OFFSET_MIN (compose) para lo mismo.
export const ZONA = 'America/Asuncion'
// Paraguay, UTC-3 permanente desde 2024; ponytail: fijo, cambiar acá si vuelve el horario de verano
export const PLANTA_OFFSET = '-03:00'
// Ventana de días de planta [desde 00:00:00, hasta 23:59:59.999] como ISO UTC
export const ventanaPlanta = (desde: string, hasta: string) => ({
  desde: new Date(`${desde}T00:00:00${PLANTA_OFFSET}`).toISOString(),
  hasta: new Date(`${hasta}T23:59:59.999${PLANTA_OFFSET}`).toISOString(),
})
// Desvío máximo tolerado del reloj del PLC (s); lo usan Sistema y la Cámara. Igual a DESVIO_MAX_S de alertasCamaras.js
export const DESVIO_MAX_S = 120
// Planta en ms (UTC-3 fijo). Se formatea `ms + offset` como UTC: no depende de la zona ni del tzdata del dispositivo.
export const PLANTA_OFFSET_MS = -3 * 36e5
const enPlanta = (ms: number) => new Date(ms + PLANTA_OFFSET_MS)
// Día de planta (YYYY-MM-DD) de un instante, +offsetDias
export const diaPlanta = (ms: number, offsetDias = 0) => enPlanta(ms + offsetDias * 864e5).toISOString().slice(0, 10)
export const hhmm = (ms: number) => enPlanta(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
export const fechaHora = (ms: number) => enPlanta(ms).toLocaleString('es-AR', { hourCycle: 'h23', timeZone: 'UTC' })
export const fechaDia = (ms: number) => enPlanta(ms).toLocaleDateString('es-AR', { timeZone: 'UTC' })
// Minutos desde las 00:00 de planta
export const minutoDelDia = (ms: number) => aMin(hhmm(ms))
// "Ahora" en minutos del día: la hora del PLC (reloj de pared) si el estado es fresco y la trae, si no la de planta.
// Pasar estado=null cuando está vencido.
export function minutoAhora(e: Estado | null, ahora: number): number {
  const p = txt(e, 'hora_plc').slice(11, 16)
  return /^\d{2}:\d{2}$/.test(p) ? aMin(p) : minutoDelDia(ahora)
}

// Hora del PLC de un evento: segundos de su hora LOCAL (el PLC no tiene zona) -> se formatea como UTC,
// igual que mapa.horaPlc del poller. Vacío si no es un número.
export function horaPlc(s: unknown): string {
  const n = Number(s)
  if (s === '' || s == null || !Number.isFinite(n)) return ''
  return new Date(n * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

const OCTETO = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
export const esIPv4 = (v: string) => new RegExp(`^${OCTETO}([.]${OCTETO}){3}$`).test(v)

// Fila de /api/camaras/descongelados (grupos y cortados: "G1,G3")
export interface FilaDescongelado { camara: string; horario: string; etapa: number; grupos: string; inicio: number; fin: number | null; duracionS: number | null; cortados: string; saltado: boolean; noEjecutada: boolean; interrumpida?: boolean }

// Ayer como dia de planta (YYYY-MM-DD)
export const ayerPlanta = (ahora = Date.now()) => diaPlanta(ahora, -1)

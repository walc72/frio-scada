import type { Estado } from '../store/camaras'

export const CAMARAS = ['C4', 'C5'] as const
export const nombreCamara = (c: string) => `Cámara ${c.slice(1)}`
export const GRUPOS = [1, 2, 3, 4, 5, 6, 7, 8]
export const HORARIOS = [1, 2, 3, 4]

export const txt = (e: Estado | null, k: string) => (e && e[k] != null ? String(e[k]) : '')
export const num = (e: Estado | null, k: string) => Number(e?.[k] ?? 0)

const aMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// Próximo horario de descongelado habilitado, a partir de la hora del PLC ("YYYY-MM-DD HH:MM:SS").
export function proximoDescongelado(e: Estado | null, cam: string): string | null {
  if (!e) return null
  const ahora = aMin(txt(e, 'hora_plc').slice(11, 16) || '00:00')
  const falta = (h: string) => (aMin(h) - ahora + 1440) % 1440
  const hs = HORARIOS
    .filter(h => ['PROGRAMADO', 'EN VENTANA'].includes(txt(e, `${cam}.H${h}.estado`)))
    .map(h => txt(e, `${cam}.H${h}.hora`)).filter(Boolean)
    .sort((a, b) => falta(a) - falta(b))
  return hs[0] ?? null
}

// Hora de planta (Paraguay), sea cual sea la zona del navegador. La API usa TZ_OFFSET_MIN (compose) para lo mismo.
export const ZONA = 'America/Asuncion'
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA })
export const fechaHora = (ms: number) => new Date(ms).toLocaleString('es-AR', { hour12: false, timeZone: ZONA })
export const fechaDia = (ms: number) => new Date(ms).toLocaleDateString('es-AR', { timeZone: ZONA })

// Hora del PLC de un evento: segundos de su hora LOCAL (el PLC no tiene zona) -> se formatea como UTC,
// igual que mapa.horaPlc del poller. Vacío si no es un número.
export function horaPlc(s: unknown): string {
  const n = Number(s)
  if (s === '' || s == null || !Number.isFinite(n)) return ''
  return new Date(n * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

const OCTETO = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
export const esIPv4 = (v: string) => new RegExp(`^${OCTETO}([.]${OCTETO}){3}$`).test(v)

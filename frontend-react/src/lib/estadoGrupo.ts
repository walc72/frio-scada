// Colores del HMI por estado de grupo
const COLORES: Record<string, { fondo: string; texto: string }> = {
  'DESHABILITADO': { fondo: '#9A9A9A', texto: '#FFFFFF' },
  'DETENIDO':      { fondo: '#9A9A9A', texto: '#FFFFFF' },
  'FRIO':          { fondo: '#1E6FD9', texto: '#FFFFFF' },
  'DESCONGELANDO': { fondo: '#F28C28', texto: '#000000' },
  'ESCURRIENDO':   { fondo: '#4FC3F7', texto: '#000000' },
  'ALARMA RES':    { fondo: '#D32F2F', texto: '#FFFFFF' },
  'MANUAL':        { fondo: '#7E57C2', texto: '#FFFFFF' },
}
const ALIAS: Record<string, string> = { 'DESHAB.': 'DESHABILITADO', 'DESCONG.': 'DESCONGELANDO', 'ESCURRE': 'ESCURRIENDO', 'ALARMA': 'ALARMA RES' }

export function colorEstadoGrupo(estado: string): { fondo: string; texto: string } {
  return COLORES[ALIAS[estado] ?? estado] ?? COLORES.DESHABILITADO
}

// Sin dato fresco: nunca llegó o pasó el umbral desde el último ok
export function estaVencido(ts: number | null, ahora: number, umbralMs = 5000): boolean {
  return ts === null || ahora - ts > umbralMs
}

// Un mensaje retenido puede ser viejo (llega al suscribirse): solo cuenta como fresco si su _ts está a <= 60 s del reloj local
export function recepcionFresca(retenido: boolean, tsPoller: number | undefined, ahora: number, toleranciaMs = 60000): boolean {
  return !retenido || (typeof tsPoller === 'number' && ahora - tsPoller <= toleranciaMs)
}

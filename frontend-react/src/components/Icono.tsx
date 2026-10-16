import type { NombreIcono } from '../lib/frases'

// SVG de línea con currentColor, 24x24
const PATHS: Record<NombreIcono, string> = {
  // copo de 6 brazos con ramitas
  frio: 'M12 2.5v19M3.8 7.25l16.4 9.5M20.2 7.25L3.8 16.75 M9.6 4.2L12 6.4l2.4-2.2M9.6 19.8L12 17.6l2.4 2.2M4.4 10.3l3.1-.9-.8-3.1M19.6 13.7l-3.1.9.8 3.1M19.6 10.3l-3.1-.9.8-3.1M4.4 13.7l3.1.9-.8 3.1',
  // tres ondas de calor
  descongelando: 'M6 3c-2 3 2 6 0 9s2 6 0 9M12 3c-2 3 2 6 0 9s2 6 0 9M18 3c-2 3 2 6 0 9s2 6 0 9',
  // dos gotas
  escurriendo: 'M8 3.5C8 3.5 3.5 9 3.5 12.5a4.5 4.5 0 009 0C12.5 9 8 3.5 8 3.5zM17 11C17 11 13.5 15 13.5 17.5a3.5 3.5 0 007 0C20.5 15 17 11 17 11z',
  // triángulo con !
  alarma: 'M12 3L2.5 20h19L12 3zM12 10v4.5M12 17.4v.2',
  // mano
  manual: 'M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v6M17 10a1.5 1.5 0 013 0v4c0 4-2.5 7-7 7-3 0-4.5-1.5-6-4l-2.5-4a1.5 1.5 0 012.4-1.8L8 14',
  // pausa
  apagado: 'M9 5v14M15 5v14',
}

export function Icono({ nombre, size = 24 }: { nombre: NombreIcono; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[nombre]} />
    </svg>
  )
}
export default Icono

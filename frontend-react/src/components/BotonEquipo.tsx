import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { estadoEquipo } from '../lib/frases'
import { useNow } from '../lib/useNow'
import { Icono } from './Icono'

// Botón lleno con el color del estado, ícono blanco y el número del equipo debajo. Sin dato fresco: gris y apagado.
export function BotonEquipo({ c, g }: { c: string; g: number }) {
  const estado = useCamarasStore(s => s.estado)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const ahora = useNow()
  const sinDatos = !estado || incompatible || estaVencido(recibidoEn, ahora)
  const eq = estado && !sinDatos ? estadoEquipo(estado, c, g) : { texto: 'Sin datos', color: '#9A9A9A', icono: 'apagado' as const }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg text-white" style={{ backgroundColor: eq.color }} role="img" aria-label={`Equipo ${g}: ${eq.texto}`}>
        <Icono nombre={eq.icono} size={26} />
      </div>
      <span className="text-xs font-medium">{g}</span>
    </div>
  )
}
export default BotonEquipo

import { Link } from 'react-router-dom'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { alarmasActivas, semaforo, type Nivel } from '../lib/frases'
import { useNow } from '../lib/useNow'

const ESTILO: Record<Nivel, { bg: string; icono: string }> = {
  ok: { bg: 'bg-green-600', icono: '✅' },
  atencion: { bg: 'bg-amber-500', icono: '⚠️' },
  alarma: { bg: 'bg-red-600', icono: '🚨' },
  'sin-datos': { bg: 'bg-gray-500', icono: '⏳' },
}

export default function Semaforo() {
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const mapa = useCamarasStore(s => s.mapa)
  const ahora = useNow(1000)
  const fresco = !estaVencido(recibidoEn, ahora)
  const s = semaforo(estado, fresco, ts, mapa)
  const hace = recibidoEn ? Math.max(0, Math.round((ahora - recibidoEn) / 1000)) : null
  const cam = s.nivel === 'alarma' && estado ? alarmasActivas(estado)[0]?.c : undefined
  const cuerpo = (
    <div className={`${ESTILO[s.nivel].bg} text-white rounded-xl p-3 shadow-sm`}>
      <div className="text-[18px] font-bold" aria-live="polite">{ESTILO[s.nivel].icono} {s.titulo}</div>
      {s.detalle && <div className="text-sm opacity-90">{s.detalle}</div>}
      {hace != null && <div className="text-xs opacity-80 mt-1">Actualizado hace {hace} s</div>}
    </div>
  )
  return cam ? <Link to={`/camara/${cam}`} className="block">{cuerpo}</Link> : cuerpo
}

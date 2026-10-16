import { Card } from './ui/card'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { alarmasActivas, badgeDescongelado } from '../lib/frases'
import { CAMARAS, GRUPOS, ZONA, num, type FilaDescongelado } from '../lib/camaras'
import { useDatos } from '../lib/useDatos'
import { useNow } from '../lib/useNow'

export default function ResumenHoy() {
  const estado = useCamarasStore(s => s.estado)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const ahora = useNow(1000)
  const fresco = !!estado && !estaVencido(recibidoEn, ahora)
  // día de planta (no del navegador)
  const dia = new Date(ahora).toLocaleDateString('en-CA', { timeZone: ZONA })
  const { data, error } = useDatos<FilaDescongelado>('descongelados', dia, dia, '', 60000)
  const hechos = data?.filter(f => ['completo', 'cortado a mano'].includes(badgeDescongelado(f).etiqueta)).length
  const desc = error || !data ? '—' : String(hechos)
  const alarmas = fresco ? String(alarmasActivas(estado!).length) : '—'
  const comp = fresco ? `${CAMARAS.flatMap(c => GRUPOS.map(g => num(estado, `${c}.G${g}.comp`))).filter(v => v === 1).length}/16` : '—'
  const Num = ({ v, t }: { v: string; t: string }) => (
    <div className="text-center"><div className="text-3xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{t}</div></div>
  )
  return (
    <Card className="p-4 rounded-2xl shadow-sm">
      <div className="font-semibold mb-2">Hoy</div>
      <div className="grid grid-cols-3 gap-2">
        <Num v={desc} t="descongelados" /><Num v={alarmas} t="alarmas" /><Num v={comp} t="compresores en marcha" />
      </div>
    </Card>
  )
}

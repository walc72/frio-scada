import { Card } from './ui/card'
import { useCamarasStore } from '../store/camaras'
import { alarmasActivas } from '../lib/frases'
import { CAMARAS, GRUPOS, ZONA, num } from '../lib/camaras'
import { useDatos } from '../lib/useDatos'

export default function ResumenHoy() {
  const estado = useCamarasStore(s => s.estado)
  // día de planta (no del navegador)
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
  const { data, error } = useDatos('descongelados', dia, dia)
  const desc = error || !data ? '—' : String(data.length)
  const alarmas = estado ? String(alarmasActivas(estado).length) : '—'
  const comp = estado ? `${CAMARAS.flatMap(c => GRUPOS.map(g => num(estado, `${c}.G${g}.comp`))).filter(v => v === 1).length}/16` : '—'
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

import { Link } from 'react-router-dom'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import BotonEquipo from './BotonEquipo'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { fraseCamara, proximoTexto, estadoEquipo } from '../lib/frases'
import { GRUPOS, nombreCamara, hhmm } from '../lib/camaras'
import { useNow } from '../lib/useNow'

export default function TarjetaCamara({ cam }: { cam: string }) {
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const ahora = useNow(1000)
  const vencido = !estado || estaVencido(recibidoEn, ahora)
  const f = estado && !vencido ? fraseCamara(estado, cam, ahora) : null
  const alarma = f?.nivel === 'alarma'
  const descongelando = !!estado && GRUPOS.some(g => estadoEquipo(estado, cam, g).clave === 'DESCONGELANDO')
  const badge = alarma || f?.nivel === 'atencion' ? { t: 'Atención', v: 'destructive' as const }
    : descongelando ? { t: 'Descongelando', v: 'warning' as const } : { t: 'Enfriando', v: 'info' as const }
  return (
    <Link to={`/camara/${cam}`} className="block">
      <Card className={`p-4 space-y-3 rounded-2xl shadow-sm hover:border-primary transition-colors ${alarma ? 'border-2 border-red-600' : ''} ${vencido ? 'opacity-70' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="font-semibold text-lg">{nombreCamara(cam)}</div>
          {!vencido && <Badge variant={badge.v} className="ml-auto">{badge.t}</Badge>}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 justify-items-center">
          {GRUPOS.map(g => <BotonEquipo key={g} c={cam} g={g} />)}
        </div>
        {f ? (
          <div>
            <div className="font-bold">{f.titulo}</div>
            {f.detalle && <div className="text-sm text-muted-foreground">{f.detalle}</div>}
            <div className="text-sm text-muted-foreground">Próximo: {proximoTexto(estado!, cam, ahora)}</div>
          </div>
        ) : (
          <div className="font-bold text-muted-foreground">{ts ? `Sin datos desde ${hhmm(ts)}` : 'Sin datos todavía'}</div>
        )}
      </Card>
    </Link>
  )
}

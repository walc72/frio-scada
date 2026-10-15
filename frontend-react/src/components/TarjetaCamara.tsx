import { Link } from 'react-router-dom'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import GrupoChip from './GrupoChip'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { GRUPOS, nombreCamara, txt, num, proximoDescongelado, hhmm } from '../lib/camaras'
import { useNow } from '../lib/useNow'

export default function TarjetaCamara({ cam }: { cam: string }) {
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const ahora = useNow(1000)
  const vencido = estaVencido(recibidoEn, ahora)
  const alarma = num(estado, `${cam}.alarma_activa`) === 1
  const prox = proximoDescongelado(estado, cam)
  return (
    <Link to={`/camara/${cam}`}>
      <Card className="p-4 space-y-3 hover:border-primary transition-colors">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-lg">{nombreCamara(cam)}</div>
          {!vencido && <Badge variant="secondary">{txt(estado, `${cam}.modo`) || '—'}</Badge>}
          {!vencido && alarma && <Badge variant="destructive">ALARMA</Badge>}
          <div className="ml-auto text-sm text-muted-foreground" title="La temperatura llega con el subproyecto 1">Temp: —</div>
        </div>
        {vencido && (
          <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
            {incompatible ? 'Mapa del PLC incompatible' : `sin datos${ts ? ` desde ${hhmm(ts)}` : ''}`}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {GRUPOS.map(g => <GrupoChip key={g} n={g} estado={txt(estado, `${cam}.G${g}.estado`)} vencido={vencido} />)}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Próximo descongelado: {vencido ? '—' : prox ?? '—'}</span>
          <span>Última lectura: {ts ? hhmm(ts) : '—'}</span>
        </div>
      </Card>
    </Link>
  )
}

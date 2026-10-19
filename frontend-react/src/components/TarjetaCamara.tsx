import { Link } from 'react-router-dom'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import BotonEquipo from './BotonEquipo'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { alarmasActivas, fraseCamara, proximoTexto, badgeCamara } from '../lib/frases'
import { GRUPOS, nombreCamara, hhmm } from '../lib/camaras'
import { useNow } from '../lib/useNow'

export default function TarjetaCamara({ cam }: { cam: string }) {
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const ahora = useNow(1000)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const vencido = !estado || estaVencido(recibidoEn, ahora)
  const f = estado && !vencido && !incompatible ? fraseCamara(estado, cam, ahora) : null
  const hayDatos = !!f && f.nivel !== 'sin-datos'
  const alarma = f?.nivel === 'alarma'
  const nAlarmas = estado && !vencido && !incompatible ? alarmasActivas(estado).filter(a => !a.c || a.c === cam).length : 0
  const badge = hayDatos ? badgeCamara(estado!, cam, f!.nivel) : null
  // Siempre título + 2 renglones (los que sobran quedan vacíos): la tarjeta no cambia de alto con el estado.
  const renglones: { t: string; c: string }[] = hayDatos ? [
    ...(nAlarmas > 0 ? [{ t: `${nAlarmas} ${nAlarmas === 1 ? 'alarma activa' : 'alarmas activas'}`, c: 'font-semibold text-red-600' }] : []),
    ...(f!.detalle ? [{ t: f!.detalle, c: 'text-muted-foreground' }] : []),
    ...(!/Próximo|Sin descongelados/.test(f!.detalle) ? [{ t: `Próximo: ${proximoTexto(estado!, cam, ahora)}`, c: 'text-muted-foreground' }] : []),
  ].slice(0, 2) : []
  const titulo = hayDatos ? f!.titulo : incompatible ? 'El PLC tiene un programa viejo' : ts ? `Sin datos desde ${hhmm(ts)}` : 'Sin datos todavía'
  return (
    <Link to={`/camara/${cam}`} className="block h-full">
      <Card className={`h-full p-3 space-y-3 rounded-xl shadow-sm hover:border-primary transition-colors ${alarma ? 'border-2 border-red-600' : ''} ${vencido || incompatible ? 'grayscale bg-muted opacity-70' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="font-semibold text-lg">{nombreCamara(cam)}</div>
          {badge && <Badge className="ml-auto border-transparent text-white" style={{ backgroundColor: badge.c }}>{badge.t}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="grid grid-cols-4 sm:flex gap-2 justify-items-center">
            {GRUPOS.map(g => <BotonEquipo key={g} c={cam} g={g} />)}
          </div>
          <div className="min-w-[14rem] flex-1 text-sm">
            <div className={`truncate font-bold text-base ${hayDatos ? '' : 'text-muted-foreground'}`} title={titulo}>{titulo}</div>
            {[0, 1].map(i => <div key={i} className={`truncate ${renglones[i]?.c ?? ''}`} title={renglones[i]?.t}>{renglones[i]?.t ?? ' '}</div>)}
          </div>
        </div>
      </Card>
    </Link>
  )
}

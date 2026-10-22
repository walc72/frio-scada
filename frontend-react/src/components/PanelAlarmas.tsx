import { hhmm } from '../lib/camaras'
import type { AlarmaActivaVista } from '../lib/alarmas'
import { useVistas } from '../lib/vistas'
import BotonVisto from './BotonVisto'

type Vista = Omit<AlarmaActivaVista, 'desde'> & { desde?: number | null; claves?: string[] }

// alarmas = null: sin datos frescos del PLC
export default function PanelAlarmas({ alarmas }: { alarmas: Vista[] | null }) {
  const { vistas, marcar } = useVistas(!!alarmas?.length)
  if (!alarmas) return <div className="rounded-xl border bg-muted p-3 text-sm text-muted-foreground">Sin datos del PLC</div>
  if (!alarmas.length) return <div className="rounded-xl border border-green-600/40 bg-green-50 p-3 text-sm font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">Sin alarmas</div>
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-red-600/40 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
      <div className="font-semibold">Alarmas activas ({alarmas.length})</div>
      {alarmas.map(a => (
        <div key={a.clave}><b>{a.titulo}</b>{a.accion && ` · ${a.accion}`} {a.desde !== undefined && <span className="text-xs">{a.desde === null ? 'desde antes de hoy' : `desde ${hhmm(a.desde)}`}</span>}
          {' '}<BotonVisto claves={a.claves ?? [a.clave]} vistas={vistas} marcar={marcar} /></div>
      ))}
    </div>
  )
}

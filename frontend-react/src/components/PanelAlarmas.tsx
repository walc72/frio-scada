import { hhmm } from '../lib/camaras'
import type { AlarmaActivaVista } from '../lib/alarmas'

// alarmas = null: sin datos frescos del PLC
export default function PanelAlarmas({ alarmas }: { alarmas: AlarmaActivaVista[] | null }) {
  if (!alarmas) return <div className="rounded-xl border bg-muted p-3 text-sm text-muted-foreground">Sin datos del PLC</div>
  if (!alarmas.length) return <div className="rounded-xl border border-green-600/40 bg-green-50 p-3 text-sm font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">Sin alarmas</div>
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-red-600/40 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
      <div className="font-semibold">Alarmas activas ({alarmas.length})</div>
      {alarmas.map(a => (
        <div key={a.clave}><b>{a.titulo}</b>{a.accion && ` · ${a.accion}`} <span className="text-xs">{a.desde == null ? 'desde antes de hoy' : `desde ${hhmm(a.desde)}`}</span></div>
      ))}
    </div>
  )
}

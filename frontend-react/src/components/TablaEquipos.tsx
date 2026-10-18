import { useState } from 'react'
import { Card } from './ui/card'
import { Button } from './ui/button'
import HojaEquipo from './HojaEquipo'
import { usePermiso } from './Confirmar'
import { estadoEquipo, faltanMin } from '../lib/frases'
import { GRUPOS, num, txt } from '../lib/camaras'
import { horasTxt } from '../lib/historial'
import type { Estado } from '../store/camaras'

const SALIDAS = [['comp', 'C', 'Compresor'], ['eva', 'E', 'Evaporador'], ['res', 'R', 'Resistencia']] as const

// Un renglón por equipo; desde md es tabla, abajo cada equipo ocupa dos renglones (sin scroll horizontal).
export default function TablaEquipos({ estado, cam, hayDatos }: { estado: Estado | null; cam: string; hayDatos: boolean }) {
  const permiso = usePermiso(1)
  const [hoja, setHoja] = useState<number | null>(null)
  const falta = hayDatos && estado ? faltanMin(estado, cam) : null
  const dato = (g: number, k: string, horas = false) => {
    const v = hayDatos ? txt(estado, `${cam}.G${g}.${k}`) : ''
    return v === '' || !Number.isFinite(Number(v)) ? '—' : horas ? horasTxt(Number(v)) : v
  }
  const fila = (g: number) => {
    const eq = hayDatos && estado ? estadoEquipo(estado, cam, g) : null
    const desc = eq?.clave === 'DESCONGELANDO'
    const estadoTxt = (eq ? eq.texto : 'Sin datos') + (desc && falta != null ? ` · faltan ${falta} min` : '')
    const punto = <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: eq?.color ?? '#9A9A9A' }} />
    const chips = (
      <span className="inline-flex gap-1">
        {SALIDAS.map(([k, l, n]) => {
          const on = hayDatos && num(estado, `${cam}.G${g}.${k}`) === 1
          const cls = !on ? 'bg-muted text-muted-foreground' : k === 'res' && desc ? 'bg-orange-500 text-white' : 'bg-green-600 text-white'
          return <span key={k} title={`${n}: ${on ? 'prendido' : 'apagado'}`} aria-label={`${n}: ${on ? 'prendido' : 'apagado'}`} className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-medium ${cls}`}>{l}</span>
        })}
      </span>
    )
    const boton = <Button variant="outline" className="shrink-0 px-3" disabled={!permiso.ok} onClick={() => setHoja(g)}>Cambiar…</Button>
    return { estadoTxt, punto, chips, boton }
  }
  return (
    <Card className={`p-3 rounded-xl ${hayDatos ? '' : 'grayscale opacity-70'}`}>
      <div className="mb-2 text-sm font-semibold">Equipos</div>
      <table className="hidden w-full text-left text-sm md:table">
        <thead><tr className="text-xs text-muted-foreground"><th className="pb-1 pr-2 font-medium">Eq.</th><th className="pb-1 pr-2 font-medium">Estado</th><th className="pb-1 pr-2 font-medium">Salidas</th><th className="pb-1 pr-2 font-medium">Arranques</th><th className="pb-1 pr-2 font-medium">Horas de marcha</th><th className="pb-1 pr-2 font-medium">Sin descongelar</th><th /></tr></thead>
        <tbody>{GRUPOS.map(g => { const r = fila(g); return (
          <tr key={g} className="border-t">
            <td className="py-1 pr-2 font-medium">{g}</td>
            <td className="py-1 pr-2"><span className="flex items-center gap-1.5">{r.punto}{r.estadoTxt}</span></td>
            <td className="py-1 pr-2">{r.chips}</td>
            <td className="py-1 pr-2">{dato(g, 'arranques')}</td>
            <td className="py-1 pr-2">{dato(g, 'horas_marcha', true)}</td>
            <td className="py-1 pr-2">{dato(g, 'horas_sin_desc', true)}</td>
            <td className="py-1 text-right">{r.boton}</td>
          </tr>) })}</tbody>
      </table>
      <div className="divide-y md:hidden">{GRUPOS.map(g => { const r = fila(g); return (
        <div key={g} className="space-y-1 py-2 text-sm">
          <div className="flex items-center gap-2">{r.punto}<span className="min-w-0 flex-1"><b>Equipo {g}</b> · {r.estadoTxt}</span>{r.boton}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{r.chips}<span>{dato(g, 'arranques')} arranques</span><span>{dato(g, 'horas_marcha', true)} marcha</span><span>{dato(g, 'horas_sin_desc', true)} sin desc.</span></div>
        </div>) })}</div>
      {!permiso.ok && <div className="mt-2 text-xs text-muted-foreground">{permiso.motivo}</div>}
      {hoja != null && <HojaEquipo cam={cam} g={hoja} onCerrar={() => setHoja(null)} />}
    </Card>
  )
}

import { useState } from 'react'
import { Input } from './ui/input'
import { CAMARAS, nombreCamara } from '../lib/camaras'
import { hoy } from '../lib/useDatos'
import { cn } from '../lib/utils'

export interface Rango { desde: string; hasta: string; camara: string }

const PRESETS = [
  { id: 'hoy', label: 'Hoy', rango: () => ({ desde: hoy(), hasta: hoy() }) },
  { id: 'ayer', label: 'Ayer', rango: () => ({ desde: hoy(-1), hasta: hoy(-1) }) },
  { id: '7', label: '7 días', rango: () => ({ desde: hoy(-6), hasta: hoy() }) },
]
const chip = (on: boolean) => cn('px-3 py-1.5 rounded-full text-sm border whitespace-nowrap', on ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')

export function Filtros({ r, set, sinCamara }: { r: Rango; set: (r: Rango) => void; sinCamara?: boolean }) {
  const [elegir, setElegir] = useState(false)
  const activo = elegir ? 'fecha' : (PRESETS.find(p => { const x = p.rango(); return x.desde === r.desde && x.hasta === r.hasta })?.id ?? 'fecha')
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => <button key={p.id} className={chip(activo === p.id)} onClick={() => { setElegir(false); set({ ...r, ...p.rango() }) }}>{p.label}</button>)}
        <button className={chip(activo === 'fecha')} onClick={() => setElegir(true)}>Elegir fecha</button>
        {!sinCamara && (
          <select aria-label="Cámara" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={r.camara} onChange={e => set({ ...r, camara: e.target.value })}>
            <option value="">Todas las cámaras</option>
            {CAMARAS.map(c => <option key={c} value={c}>{nombreCamara(c)}</option>)}
          </select>
        )}
      </div>
      {activo === 'fecha' && (
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" className="w-40" value={r.desde} max={r.hasta} onChange={e => e.target.value && set({ ...r, desde: e.target.value })} />
          <span>a</span>
          <Input type="date" className="w-40" value={r.hasta} min={r.desde} onChange={e => e.target.value && set({ ...r, hasta: e.target.value })} />
        </div>
      )}
    </div>
  )
}

export const SinDatos = ({ error, vacio }: { error: boolean; vacio: boolean }) =>
  error || vacio ? <div className="text-center text-sm text-muted-foreground py-8">{error ? 'No se pudo cargar' : 'No hay registros en este período'}</div> : null

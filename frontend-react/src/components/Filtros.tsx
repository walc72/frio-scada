import { Input } from './ui/input'
import { Button } from './ui/button'
import { CAMARAS, nombreCamara } from '../lib/camaras'
import { downloadXlsx } from '../lib/xlsx'

export interface Rango { desde: string; hasta: string; camara: string }

export function Filtros({ r, set, exportar }: { r: Rango; set: (r: Rango) => void; exportar?: { nombre: string; filas: Record<string, unknown>[] } }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" className="w-40" value={r.desde} max={r.hasta} onChange={e => e.target.value && set({ ...r, desde: e.target.value })} />
      <Input type="date" className="w-40" value={r.hasta} min={r.desde} onChange={e => e.target.value && set({ ...r, hasta: e.target.value })} />
      <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={r.camara} onChange={e => set({ ...r, camara: e.target.value })}>
        <option value="">Todas las cámaras</option>
        {CAMARAS.map(c => <option key={c} value={c}>{nombreCamara(c)}</option>)}
      </select>
      {exportar && (
        <Button size="sm" variant="outline" className="ml-auto" disabled={!exportar.filas.length}
          onClick={() => downloadXlsx(exportar.nombre, exportar.filas)}>Exportar a Excel</Button>
      )}
    </div>
  )
}

export const SinDatos = ({ error, vacio }: { error: boolean; vacio: boolean }) =>
  error || vacio ? <div className="text-center text-sm text-muted-foreground py-8">{error ? 'sin datos' : 'Sin registros en el período'}</div> : null

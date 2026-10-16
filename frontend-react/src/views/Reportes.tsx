import { useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { apiBlob } from '../lib/api'
import { useDatos, hoy } from '../lib/useDatos'
import { resumenAyer } from '../lib/sistema'
import { fechaDia } from '../lib/camaras'

const n = (v: number | null, u = '') => (v == null ? 'sin datos' : `${v}${u}`)

export default function Reportes() {
  const dia = hoy(-1)
  const [fecha, setFecha] = useState(dia)
  const [otro, setOtro] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const desc = useDatos<any>('descongelados', dia, dia)
  const ev = useDatos<any>('eventos', dia, dia)
  const comp = useDatos<any>('compresores', dia, dia)
  const r = useMemo(() => resumenAyer(desc.data, ev.data, comp.data), [desc.data, ev.data, comp.data])

  async function descargar(f: string) {
    setBusy(true); setErr('')
    try {
      const blob = await apiBlob('/reports/camaras/xlsx', { method: 'POST', body: JSON.stringify({ fecha: f }) })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `reporte-camaras_${f}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al descargar')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 max-w-md">
      <h1 className="text-xl font-semibold">Reporte diario</h1>
      <div className="rounded-2xl bg-white dark:bg-card shadow-sm p-4 space-y-1 text-sm">
        <div className="font-semibold">Ayer, {fechaDia(Date.parse(`${dia}T12:00:00-03:00`))}</div>
        <div>Descongelados: {n(r.descongelados)}{r.saltados ? ` (${r.saltados} se saltaron)` : ''}</div>
        <div>Avisos de alarma: {n(r.avisos)}</div>
        <div>Horas de compresores: {n(r.horas, ' h')}</div>
      </div>
      <div className="space-y-2">
        <Button className="w-full" onClick={() => descargar(dia)} disabled={busy}>{busy ? 'Generando…' : '⬇ Descargar Excel de ayer'}</Button>
        <Button variant="outline" className="w-full" onClick={() => setOtro(o => !o)}>Elegir otro día</Button>
        {otro && (
          <div className="flex items-center gap-2">
            <input type="date" value={fecha} max={dia} min="2000-01-01" onChange={(e) => setFecha(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm" />
            <Button onClick={() => descargar(fecha)} disabled={busy || !fecha}>Descargar</Button>
          </div>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
      <p className="text-sm text-muted-foreground">Se manda solo por mail todos los días a las 07:00</p>
    </div>
  )
}

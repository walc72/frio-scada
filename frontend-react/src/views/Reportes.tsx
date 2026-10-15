import { useState } from 'react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { apiBlob } from '../lib/api'

// Ayer en fecha local del navegador (YYYY-MM-DD)
function ayer() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Reportes() {
  const [fecha, setFecha] = useState(ayer())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function descargar() {
    setBusy(true); setErr('')
    try {
      const blob = await apiBlob('/reports/camaras/xlsx', { method: 'POST', body: JSON.stringify({ fecha }) })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `reporte-camaras_${fecha}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al descargar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6 space-y-3 max-w-md">
      <div className="text-lg font-semibold">Reporte diario de cámaras</div>
      <p className="text-sm text-muted-foreground">Descongelados, compresores y alarmas del día elegido (00:00 a 24:00). También se envía por correo cada mañana.</p>
      <div className="flex items-center gap-2">
        <input type="date" value={fecha} max={ayer()} min="2000-01-01" onChange={(e) => setFecha(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm" />
        <Button onClick={descargar} disabled={busy || !fecha}>{busy ? 'Generando…' : 'Descargar Excel'}</Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </Card>
  )
}

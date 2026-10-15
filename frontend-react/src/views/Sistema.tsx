import { useState } from 'react'
import { Card } from '../components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { useCamarasStore } from '../store/camaras'
import { hhmm, txt, fechaHora } from '../lib/camaras'

export default function Sistema() {
  const { poller, mapa, conectado, ts, estado } = useCamarasStore()
  const [r, setR] = useState<Rango>({ desde: hoy(-1), hasta: hoy(), camara: '' })
  const { data, error, cargando } = useDatos<Record<string, any>>('comunicacion', r.desde, r.hasta)
  const cols = data && data.length ? Object.keys(data[0]) : []
  const fmt = (k: string, v: any) => (k === 'ts' || k === 'time' ? fechaHora(v) : String(v ?? ''))
  const dato = (t: string, v: string) => <div><div className="text-xs text-muted-foreground">{t}</div><div className="font-medium">{v}</div></div>
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sistema</h1>
      <Card className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
        {dato('Poller', poller ?? 'sin dato')}
        {dato('PLC', conectado ? 'comunicando' : 'sin comunicación')}
        {dato('Última lectura', ts ? hhmm(ts) : '—')}
        {dato('Mapa', mapa === 'incompatible' ? 'incompatible' : mapa === 'ok' ? 'ok' : '—')}
        {dato('Hora del PLC', txt(estado, 'hora_plc') || '—')}
      </Card>
      <div className="text-sm font-semibold">Historial de comunicación (cortes, lecturas descartadas, desvío del reloj)</div>
      <Filtros r={{ ...r, camara: '' }} set={x => setR({ ...x, camara: '' })} />
      <Card className="p-2">
        {cargando && !data ? <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div> : <>
          <SinDatos error={error} vacio={!!data && data.length === 0} />
          {data && data.length > 0 && (
            <Table>
              <TableHeader><TableRow>{cols.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{data.map((f, i) => <TableRow key={i}>{cols.map(c => <TableCell key={c}>{fmt(c, f[c])}</TableCell>)}</TableRow>)}</TableBody>
            </Table>
          )}
        </>}
      </Card>
    </div>
  )
}

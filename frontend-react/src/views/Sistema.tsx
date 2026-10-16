import { useEffect, useState } from 'react'
import { Card } from '../components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { useCamarasStore } from '../store/camaras'
import { hhmm, txt, fechaHora } from '../lib/camaras'
import { apiJson } from '../lib/api'
import { filasSistema, textoCortes, type Resumen, type Color } from '../lib/sistema'

function Detalle() {
  const { poller, mapa, conectado, ts, estado } = useCamarasStore()
  const [r, setR] = useState<Rango>({ desde: hoy(-1), hasta: hoy(), camara: '' })
  const { data, error, cargando } = useDatos<Record<string, any>>('comunicacion', r.desde, r.hasta)
  const cols = data && data.length ? Object.keys(data[0]) : []
  const fmt = (k: string, v: any) => (k === 'ts' || k === 'time' ? fechaHora(v) : String(v ?? ''))
  const dato = (t: string, v: string) => <div><div className="text-xs text-muted-foreground">{t}</div><div className="font-medium">{v}</div></div>
  return (
    <div className="space-y-4">
      <Card className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
        {dato('Poller', poller ?? 'sin dato')}
        {dato('PLC', conectado ? 'comunicando' : 'sin comunicación')}
        {dato('Última lectura', ts ? hhmm(ts) : '—')}
        {dato('Mapa', mapa === 'incompatible' ? 'incompatible' : mapa === 'ok' ? 'ok' : '—')}
        {dato('Hora del PLC', txt(estado, 'hora_plc') || '—')}
      </Card>
      <div className="text-sm font-semibold">Historial de comunicación (cortes, lecturas descartadas, desvío del reloj)</div>
      <Filtros r={r} set={setR} sinCamara />
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

const PUNTO: Record<Color, string> = { verde: 'bg-green-500', rojo: 'bg-red-500', gris: 'bg-gray-400' }

export default function Sistema() {
  const [res, setRes] = useState<Resumen | null>(null)
  const [ahora, setAhora] = useState(Date.now())
  const [det, setDet] = useState(false)
  useEffect(() => {
    let vivo = true
    const cargar = () => apiJson<Resumen>('/sistema/resumen').then(d => { if (vivo) { setRes(d); setAhora(Date.now()) } }).catch(() => { if (vivo) setRes(null) })
    cargar()
    const id = setInterval(cargar, 30000)
    return () => { vivo = false; clearInterval(id) }
  }, [])
  return (
    <div className="space-y-3 max-w-md md:max-w-none">
      <h1 className="text-xl font-semibold">Estado del sistema</h1>
      <div className="rounded-2xl bg-white dark:bg-card shadow-sm divide-y">
        {filasSistema(res, ahora).map(f => (
          <div key={f.titulo} className="flex items-center gap-3 p-3 text-sm">
            <span className={`h-3 w-3 shrink-0 rounded-full ${PUNTO[f.color]}`} />
            <span className="flex-1">{f.titulo}</span>
            <span className="text-right font-medium">{f.texto}</span>
          </div>
        ))}
      </div>
      <p className="text-sm">{textoCortes(res?.cortes7d)}</p>
      <button className="text-xs text-muted-foreground underline" onClick={() => setDet(d => !d)}>{det ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}</button>
      {det && <Detalle />}
    </div>
  )
}

import { useState } from 'react'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { fechaHora, horaPlc } from '../lib/camaras'

interface Fila { ts: number; hora_plc: string; texto: string; estado: string | number }

export default function Eventos() {
  const [r, setR] = useState<Rango>({ desde: hoy(-1), hasta: hoy(), camara: '' })
  const [q, setQ] = useState('')
  const { data, error, cargando } = useDatos<Fila>('eventos', r.desde, r.hasta, r.camara)
  const vista = (data ?? []).filter(f => f.texto.toLowerCase().includes(q.toLowerCase()))
  const filas = vista.map(f => ({ Fecha: fechaHora(f.ts), 'Hora PLC': horaPlc(f.hora_plc), Evento: f.texto, Estado: f.estado }))
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Alarmas y eventos</h1>
      <Filtros r={r} set={setR} exportar={{ nombre: `eventos_${r.desde}_${r.hasta}`, filas }} />
      <Input placeholder="Filtrar por texto (ej. ALARMA, G3)" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
      <Card className="p-2">
        {cargando && !data ? <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div> : <>
          <SinDatos error={error} vacio={!!data && vista.length === 0} />
          {vista.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                {['Fecha', 'Hora PLC', 'Evento', 'Estado'].map(h => <TableHead key={h}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {vista.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>{fechaHora(f.ts)}</TableCell><TableCell>{horaPlc(f.hora_plc)}</TableCell>
                    <TableCell>{f.texto}</TableCell><TableCell>{f.estado}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>}
      </Card>
    </div>
  )
}

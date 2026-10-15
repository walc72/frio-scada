import { useState, useMemo } from 'react'
import { Card } from '../components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { nombreCamara, fechaHora, fechaDia } from '../lib/camaras'

interface Fila { camara: string; horario: string; etapa: number; grupos: string; inicio: number; fin: number | null; duracionS: number | null; cortados: string; saltado: boolean; noEjecutada: boolean; interrumpida?: boolean }

const fecha = (ms: number | null) => (ms ? fechaHora(ms) : '')
// interrumpido = corte de comunicación largo a mitad de la etapa: sin fin ni duración (no se inventan)
const estadoFila = (f: Fila) => (f.noEjecutada ? 'No ejecutada' : f.interrumpida ? 'Interrumpido' : f.saltado ? 'Saltado' : f.fin ? 'Completo' : 'En curso')
const dur = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`)

export default function Descongelados() {
  const [r, setR] = useState<Rango>({ desde: hoy(-7), hasta: hoy(), camara: '' })
  const { data, error, cargando } = useDatos<Fila>('descongelados', r.desde, r.hasta, r.camara)
  const porDia = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of data ?? []) if (!f.noEjecutada) { const d = fechaDia(f.inicio); m[d] = (m[d] ?? 0) + 1 }
    return Object.entries(m)
  }, [data])
  const filas = (data ?? []).map(f => ({
    Cámara: nombreCamara(f.camara), Horario: f.horario, Etapa: f.etapa, Grupos: f.grupos, Inicio: fecha(f.inicio), Fin: fecha(f.fin),
    'Duración (s)': f.duracionS ?? '', Cortados: f.cortados, Saltado: f.saltado ? 'sí' : '', 'No ejecutada': f.noEjecutada ? 'sí' : '', Interrumpido: f.interrumpida ? 'sí' : '',
  }))
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Descongelados</h1>
      <Filtros r={r} set={setR} exportar={{ nombre: `descongelados_${r.desde}_${r.hasta}`, filas }} />
      {porDia.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {porDia.map(([d, n]) => <Card key={d} className="px-3 py-1.5"><span className="text-muted-foreground">{d}</span> <strong>{n}</strong></Card>)}
        </div>
      )}
      <Card className="p-2">
        {cargando && !data ? <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div> : <>
          <SinDatos error={error} vacio={!!data && data.length === 0} />
          {data && data.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                {['Cámara', 'Horario', 'Etapa', 'Grupos', 'Inicio', 'Duración', 'Cortados', 'Estado'].map(h => <TableHead key={h}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {data.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>{nombreCamara(f.camara)}</TableCell><TableCell>{f.horario}</TableCell><TableCell>{f.etapa}</TableCell>
                    <TableCell>{f.grupos}</TableCell><TableCell>{fecha(f.inicio)}</TableCell><TableCell>{dur(f.duracionS)}</TableCell>
                    <TableCell>{f.cortados}</TableCell>
                    <TableCell>{estadoFila(f)}</TableCell>
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

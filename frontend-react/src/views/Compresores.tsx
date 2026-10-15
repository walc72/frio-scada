import { useState } from 'react'
import { Card } from '../components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { useCamarasStore } from '../store/camaras'
import { CAMARAS, GRUPOS, nombreCamara, txt } from '../lib/camaras'

interface Fila { camara: string; dia: string; grupo: string; horas: number; arranques: number; maxArranquesHora: number }

export default function Compresores() {
  const [r, setR] = useState<Rango>({ desde: hoy(-7), hasta: hoy(), camara: '' })
  const { data, error, cargando } = useDatos<Fila>('compresores', r.desde, r.hasta, r.camara)
  const estado = useCamarasStore(s => s.estado)
  const filas = (data ?? []).map(f => ({ Cámara: nombreCamara(f.camara), Día: f.dia, Grupo: f.grupo, Horas: f.horas, Arranques: f.arranques, 'Máx. arranques por hora': f.maxArranquesHora }))
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Compresores</h1>
      <Filtros r={r} set={setR} exportar={{ nombre: `compresores_${r.desde}_${r.hasta}`, filas }} />
      <Card className="p-2">
        {cargando && !data ? <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div> : <>
          <SinDatos error={error} vacio={!!data && data.length === 0} />
          {data && data.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                {['Cámara', 'Día', 'Grupo', 'Horas', 'Arranques', 'Máx. arranques/hora'].map(h => <TableHead key={h}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {data.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>{nombreCamara(f.camara)}</TableCell><TableCell>{f.dia}</TableCell><TableCell>{f.grupo}</TableCell><TableCell>{f.horas}</TableCell>
                    <TableCell>{f.arranques}</TableCell><TableCell>{f.maxArranquesHora}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>}
      </Card>
      <Card className="p-2 space-y-1">
        <div className="px-2 pt-2 font-semibold text-sm">Acumulados del PLC (en vivo)</div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Grupo</TableHead>{CAMARAS.map(c => <TableHead key={c}>{nombreCamara(c)}: horas / arranques / horas sin descongelar</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {GRUPOS.map(g => (
              <TableRow key={g}>
                <TableCell>G{g}</TableCell>
                {CAMARAS.map(c => (
                  <TableCell key={c}>{txt(estado, `${c}.G${g}.horas_marcha`) || '—'} h / {txt(estado, `${c}.G${g}.arranques`) || '—'} / {txt(estado, `${c}.G${g}.horas_sin_desc`) || '—'} h</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-2 pb-2 text-xs text-muted-foreground">Horas desde el último mantenimiento: pendiente (el PLC no registra mantenimientos).</div>
      </Card>
    </div>
  )
}

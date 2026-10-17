import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { useCamarasStore } from '../store/camaras'
import { useNow } from '../lib/useNow'
import { estaVencido, colorEstadoGrupo } from '../lib/estadoGrupo'
import { nombreCamara, fechaHora, type FilaDescongelado } from '../lib/camaras'
import { badgeDescongelado, UMBRAL_ARRANQUES_HORA, type TipoAviso } from '../lib/frases'
import { agruparCompresores, equipoDe, horasTxt, prepararAvisos, filasAvisos, filasCompresores, filasDescongelados } from '../lib/historial'
import { downloadXlsx } from '../lib/xlsx'
import { cn } from '../lib/utils'
import { Icono } from '../components/Icono'

const PESTANAS = [
  { id: 'descongelados', label: 'Descongelados' },
  { id: 'avisos', label: 'Avisos' },
  { id: 'compresores', label: 'Compresores' },
]
const C = (k: string) => colorEstadoGrupo(k).fondo
const COLOR_BADGE: Record<string, string> = { completo: '#16a34a', 'cortado a mano': C('DESCONGELANDO'), saltado: C('DESCONGELANDO'), 'no se hizo': C('ALARMA RES'), 'sin datos': C('DETENIDO') }
const COLOR_AVISO: Record<TipoAviso, string> = { alarma: C('ALARMA RES'), atencion: '#F59E0B', resuelto: '#16a34a', cortado: C('DESCONGELANDO'), operario: C('FRIO'), info: C('DETENIDO') }

const Fila = ({ children }: { children: React.ReactNode }) => <li className="flex items-start gap-3 px-3 py-2.5 border-b last:border-0">{children}</li>
// fechaHora = "dd/mm/aaaa, HH:MM:SS"
const dia = (ms: number) => fechaHora(ms).split(', ')[0]
const hm = (ms: number) => (fechaHora(ms).split(', ')[1] ?? '').slice(0, 5)

export default function Historial() {
  const { pestana = 'descongelados' } = useParams()
  const [r, setR] = useState<Rango>({ desde: hoy(), hasta: hoy(), camara: '' })
  const estado = useCamarasStore(s => s.estado)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const fresco = !estaVencido(recibidoEn, useNow(5000))
  const ruta = pestana === 'avisos' ? 'eventos' : pestana
  const { data, error, cargando } = useDatos<any>(ruta, r.desde, r.hasta, r.camara)
  const comp = useMemo(() => (pestana === 'compresores' ? agruparCompresores(data ?? []) : []), [pestana, data])
  const avisos = useMemo(() => (pestana === 'avisos' ? prepararAvisos(data ?? [], estado, fresco) : []), [pestana, data, estado, fresco])
  if (!PESTANAS.some(p => p.id === pestana)) return <Navigate to="/historial/descongelados" replace />
  const lista: any[] = data ?? []
  const filas = pestana === 'descongelados' ? filasDescongelados(lista as FilaDescongelado[])
    : pestana === 'avisos' ? filasAvisos(avisos) : filasCompresores(comp)
  const maxH = Math.max(1, ...comp.map(c => c.horas))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Historial</h1>
      <div className="flex gap-2 overflow-x-auto">
        {PESTANAS.map(p => (
          <Link key={p.id} to={`/historial/${p.id}`}
            className={cn('px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border',
              p.id === pestana ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}>
            {p.label}
          </Link>
        ))}
      </div>
      <Filtros r={r} set={setR} />
      <div className="rounded-lg border bg-card">
        {cargando && !data ? <div className="text-center text-sm text-muted-foreground py-8">Cargando…</div> : <>
          <SinDatos error={error} vacio={!!data && lista.length === 0} />
          <ul>
            {pestana === 'descongelados' && (lista as FilaDescongelado[]).map((f, i) => {
              const b = badgeDescongelado(f)
              return <Fila key={i}>
                <div className="text-sm font-medium w-12 shrink-0">{f.inicio ? hm(f.inicio) : '—'}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{nombreCamara(f.camara)} · {f.grupos ? `equipos ${f.grupos.replace(/G/g, '')}` : 'sin equipos'}</div>
                  <div className="text-xs text-muted-foreground">{f.inicio ? `${dia(f.inicio)} · ` : ''}{b.motivo}</div>
                </div>
                <span className="text-xs text-white rounded-full px-2 py-0.5 whitespace-nowrap" style={{ background: COLOR_BADGE[b.etiqueta] }}>{b.etiqueta}</span>
              </Fila>
            })}
            {pestana === 'avisos' && avisos.map((f, i) => (
              <Fila key={i}>
                <div className="text-sm font-medium w-12 shrink-0">{hm(f.ts)}</div>
                {f.maniobra ? <span className="mt-0.5 shrink-0 text-muted-foreground" title="Maniobra desde el portal"><Icono nombre="manual" size={18} /></span>
                  : <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLOR_AVISO[f.tipo] }} />}
                <div className="min-w-0 flex-1 text-sm">{f.frase}
                  <div className="text-xs text-muted-foreground">{f.maniobra ? 'Maniobra desde el portal · ' : /^C\d/i.test(f.texto) ? `${nombreCamara(f.texto.slice(0, 2).toUpperCase())} · ` : ''}{dia(f.ts)}</div>
                </div>
                {f.sigue && <span className="text-xs font-semibold text-red-600 whitespace-nowrap">Sigue activo</span>}
              </Fila>
            ))}
            {pestana === 'compresores' && comp.map(c => (
              <Fila key={`${c.camara}${c.grupo}`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium">{nombreCamara(c.camara)} · {equipoDe(c.grupo)}</div>
                  <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(c.horas / maxH) * 100}%` }} /></div>
                  <div className="text-xs text-muted-foreground">{horasTxt(c.horas)} en marcha · {c.arranques} arranques</div>
                  {c.maxArranquesHora > UMBRAL_ARRANQUES_HORA && <div className="text-xs text-amber-600">⚠️ Arranca demasiado seguido (hasta {c.maxArranquesHora} veces por hora): conviene revisarlo</div>}
                  {c.horasSinDatos > 0 && <div className="text-xs text-muted-foreground">{Math.round(c.horasSinDatos * 10) / 10} h sin datos</div>}
                </div>
              </Fila>
            ))}
          </ul>
        </>}
      </div>
      <button className="h-9 px-4 rounded-md border text-sm disabled:opacity-50" disabled={!filas.length}
        onClick={() => downloadXlsx(`${pestana}_${r.desde}_${r.hasta}`, filas)}>⬇ Descargar en Excel</button>
    </div>
  )
}

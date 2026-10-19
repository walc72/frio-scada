import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Filtros, SinDatos, type Rango } from '../components/Filtros'
import { useDatos, hoy } from '../lib/useDatos'
import { useCamarasStore } from '../store/camaras'
import { useNow } from '../lib/useNow'
import { estaVencido, colorEstadoGrupo } from '../lib/estadoGrupo'
import { nombreCamara, fechaHora, type FilaDescongelado } from '../lib/camaras'
import { badgeDescongelado, esRem, UMBRAL_ARRANQUES_HORA, type TipoAviso } from '../lib/frases'
import { agruparActivas, agruparPeriodos, alarmasActivasVista, periodosAlarma, ultimoPorClave } from '../lib/alarmas'
import { equiposPorCamara, duracionTxt, equipoDe, horasTxt, prepararAvisos, filasEventos, type EquipoHist, filasAlarmas, filasCompresores, filasDescongelados } from '../lib/historial'
import { downloadXlsx } from '../lib/xlsx'
import { cn } from '../lib/utils'
import { Icono } from '../components/Icono'

const PESTANAS = [
  { id: 'descongelados', label: 'Descongelados' },
  { id: 'alarmas', label: 'Alarmas' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'compresores', label: 'Equipos' },
]
const C = (k: string) => colorEstadoGrupo(k).fondo
const COLOR_BADGE: Record<string, string> = { completo: '#16a34a', 'cortado a mano': C('DESCONGELANDO'), saltado: C('DESCONGELANDO'), 'no se hizo': C('ALARMA RES'), 'sin datos': C('DETENIDO') }
const COLOR_AVISO: Record<TipoAviso, string> = { alarma: C('ALARMA RES'), atencion: '#F59E0B', resuelto: '#16a34a', cortado: C('DESCONGELANDO'), operario: C('FRIO'), info: C('DETENIDO') }

const Fila = ({ children }: { children: React.ReactNode }) => <li className="flex items-start gap-3 px-3 py-2.5 border-b last:border-0">{children}</li>
// fechaHora = "dd/mm/aaaa, HH:MM:SS"
const dia = (ms: number) => fechaHora(ms).split(', ')[0]
const hm = (ms: number) => (fechaHora(ms).split(', ')[1] ?? '').slice(0, 5)

const pctTxt = (p: number | null) => p == null ? '' : ` (${Math.round(p * 100)} %)`
const colorPct = (p: number | null) => p == null ? 'hsl(var(--muted))' : `rgba(37, 99, 235, ${0.12 + 0.88 * p})`
const diaCorto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

// Un bloque por cámara: cada equipo con un cuadradito por día (color = % del tiempo en marcha) y sus totales.
function BloqueEquipos({ camara, equipos }: { camara: string; equipos: EquipoHist[] }) {
  const dias = equipos[0]?.dias ?? []
  return (
    <section className="border-b last:border-0 px-3 py-3 space-y-1.5">
      <h2 className="text-sm font-semibold">{nombreCamara(camara)}</h2>
      {dias.length > 1 && <div className="grid grid-cols-[4.5rem_1fr] sm:grid-cols-[4.5rem_1fr_19rem] gap-x-3 text-[10px] text-muted-foreground">
        <span /><div className="flex gap-0.5">{dias.map(d => <span key={d.dia} className="flex-1 text-center truncate">{diaCorto(d.dia)}</span>)}</div>
      </div>}
      {equipos.map(e => (
        <div key={e.grupo} className="grid grid-cols-[4.5rem_1fr] sm:grid-cols-[4.5rem_1fr_19rem] gap-x-3 gap-y-0.5 items-center">
          <span className="text-sm font-medium">{equipoDe(e.grupo)}</span>
          <div className="flex gap-0.5">
            {e.dias.map(d => <span key={d.dia} className="h-6 flex-1 rounded-sm" style={{ background: colorPct(d.pct) }}
              title={`${diaCorto(d.dia)}: ${horasTxt(d.horas)} en marcha${pctTxt(d.pct)} · ${d.arranques} arranques`} />)}
          </div>
          <span className="col-start-2 sm:col-start-auto text-xs text-muted-foreground">
            <b className="text-foreground">{horasTxt(e.horas)}</b>{pctTxt(e.pct)} · {e.arranques} arranques · {e.descongelados} descongelados
          </span>
          {e.maxArranquesHora > UMBRAL_ARRANQUES_HORA && <span className="col-start-2 sm:col-span-2 text-xs text-amber-600">⚠️ Arranca demasiado seguido (hasta {e.maxArranquesHora} veces por hora): conviene revisarlo</span>}
          {e.horasSinDatos > 0 && <span className="col-start-2 sm:col-span-2 text-xs text-muted-foreground">{horasTxt(e.horasSinDatos)} sin datos</span>}
        </div>
      ))}
    </section>
  )
}

export default function Historial() {
  const { pestana = 'descongelados' } = useParams()
  const [r, setR] = useState<Rango>({ desde: hoy(), hasta: hoy(), camara: '' })
  const estado = useCamarasStore(s => s.estado)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const fresco = !estaVencido(recibidoEn, useNow(5000)) && !incompatible
  const ruta = pestana === 'alarmas' ? 'eventos' : pestana
  const { data, error, cargando } = useDatos<any>(ruta, r.desde, r.hasta, r.camara)
  const desc = useDatos<FilaDescongelado>(pestana === 'compresores' ? 'descongelados' : '', r.desde, r.hasta, r.camara)
  const porCamara = useMemo(() => (pestana === 'compresores' ? equiposPorCamara(data ?? [], desc.data ?? []) : []), [pestana, data, desc.data])
  const comp = porCamara.flatMap(c => c.equipos)
  const avisos = useMemo(() => (pestana === 'eventos' ? prepararAvisos(data ?? [], estado, fresco) : []), [pestana, data, estado, fresco])
  const periodos = useMemo(() => (pestana === 'alarmas' ? periodosAlarma(data ?? []) : []), [pestana, data])
  const ultimos = useMemo(() => (pestana === 'alarmas' ? ultimoPorClave(data ?? []) : new Map()), [pestana, data])
  const cargado = !!data && !error && !cargando
  const finHoy = r.hasta === hoy() // "desde" y "sigue activa" solo valen si el rango llega a hoy
  const activas = pestana === 'alarmas' && fresco && estado ? alarmasActivasVista(estado, ultimos) : []
  const siguen = (clave: string) => finHoy && activas.some(a => a.clave === clave)
  const grupos = agruparActivas(activas)
  // las abiertas que siguen activas ya están en el recuadro rojo
  const otras = agruparPeriodos(periodos.filter(p => !(p.fin === null && siguen(p.clave))))
  if (!PESTANAS.some(p => p.id === pestana)) return <Navigate to="/historial/descongelados" replace />
  const lista: any[] = data ?? []
  const filas = pestana === 'descongelados' ? filasDescongelados(lista as FilaDescongelado[])
    : pestana === 'eventos' ? filasEventos(avisos) : pestana === 'alarmas' ? filasAlarmas(periodos, siguen) : filasCompresores(comp)

  return (
    <div className="space-y-3">
      <h1 className="text-[18px] font-semibold">Historial</h1>
      <div className="flex gap-2 overflow-x-auto">
        {PESTANAS.map(p => (
          <Link key={p.id} to={`/historial/${p.id}`}
            className={cn('toque inline-flex items-center px-4 rounded-full text-sm font-medium whitespace-nowrap border',
              p.id === pestana ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}>
            {p.label}
          </Link>
        ))}
      </div>
      <Filtros r={r} set={setR} />
      {pestana === 'alarmas' && (!fresco || !estado
        ? <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">Sin datos del PLC</div>
        : activas.length === 0
          ? <div className="rounded-lg border border-green-600 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">Sin alarmas activas</div>
          : <ul className="rounded-lg border-2 border-red-600 bg-red-50 px-3 py-2 space-y-1 dark:bg-red-950">
              {grupos.map(a => <li key={a.clave} className="text-sm text-red-900 dark:text-red-200">
                <span className="font-semibold">{a.titulo}</span>
                {a.accion && <span> · {a.accion}</span>}
                {cargado && finHoy && (!r.camara || a.camara === r.camara) && <span className="text-xs"> · {a.desde ? `desde ${dia(a.desde).slice(0, 5)} ${hm(a.desde)}` : 'desde antes de este período'}</span>}
              </li>)}
            </ul>)}
      {pestana === 'alarmas' && <h2 className="text-sm font-semibold">Alarmas del período</h2>}
      <div className="rounded-lg border bg-card">
        {cargando && !data ? <div className="text-center text-sm text-muted-foreground py-8">Cargando…</div> : <>
          <SinDatos error={error} vacio={!!data && lista.length === 0} />
          {pestana === 'alarmas' && cargado && lista.length > 0 && otras.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">No hubo otras alarmas en el período</div>}
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
            {pestana === 'alarmas' && otras.map((p, i) => (
              <Fila key={i}>
                <div className="min-w-0 flex-1 text-sm">{p.texto}
                  <div className="text-xs text-muted-foreground">{p.inicio === null ? 'antes del período' : `${dia(p.inicio).slice(0, 5)} ${hm(p.inicio)}`} → {p.fin === null ? '…' : p.inicio === null ? hm(p.fin) : `${dia(p.fin).slice(0, 5)} ${hm(p.fin)}`}</div>
                </div>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{p.duracionMin !== null ? duracionTxt(p.duracionMin) : p.fin !== null ? '' : 'sin cierre en el período'}</span>
              </Fila>
            ))}
            {pestana === 'eventos' && avisos.map((f, i) => (
              <Fila key={i}>
                <div className="text-sm font-medium w-12 shrink-0">{hm(f.ts)}</div>
                {f.maniobra || esRem(f.texto) ? <span className="mt-0.5 shrink-0 text-muted-foreground" title="Maniobra desde el portal"><Icono nombre="manual" size={18} /></span>
                  : <span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLOR_AVISO[f.tipo] }} />}
                <div className="min-w-0 flex-1 text-sm">{f.frase}
                  <div className="text-xs text-muted-foreground">{f.maniobra ? 'Maniobra desde el portal · ' : /^C\d/i.test(f.texto) ? `${nombreCamara(f.texto.slice(0, 2).toUpperCase())} · ` : ''}{dia(f.ts)}</div>
                </div>
                {f.sigue && <span className="text-xs font-semibold text-red-600 whitespace-nowrap">Sigue activo</span>}
              </Fila>
            ))}
          </ul>
          {pestana === 'compresores' && porCamara.map(({ camara, equipos }) => <BloqueEquipos key={camara} camara={camara} equipos={equipos} />)}
          {pestana === 'compresores' && porCamara.length > 0 && <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
            Cada cuadradito es un día: <span>menos</span>{[0.1, 0.4, 0.7, 1].map(p => <span key={p} className="h-3 w-3 rounded-sm" style={{ background: colorPct(p) }} />)}<span>más tiempo en marcha</span>
          </div>}
        </>}
      </div>
      <button className="toque px-4 rounded-md border text-sm disabled:opacity-50" disabled={!filas.length}
        onClick={() => downloadXlsx(`${pestana}_${r.desde}_${r.hasta}`, filas)}>⬇ Descargar en Excel</button>
    </div>
  )
}

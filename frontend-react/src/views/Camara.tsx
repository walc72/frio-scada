import { useParams, Link } from 'react-router-dom'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import BotonEquipo from '../components/BotonEquipo'
import LineaDescongelados from '../components/LineaDescongelados'
import BarrasEquipos from '../components/BarrasEquipos'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { fraseCamara, estadoEquipo, faltanMin, fraseEvento, badgeCamara } from '../lib/frases'
import { CAMARAS, GRUPOS, HORARIOS, PLANTA_OFFSET, nombreCamara, txt, num, hhmm, type FilaDescongelado } from '../lib/camaras'
import { useNow } from '../lib/useNow'
import { useDatos } from '../lib/useDatos'
import { useMemo } from 'react'
import { diaPlanta, aTramos, type TramoApi } from '../lib/paginaCamara'

const MODOS: Record<string, string> = { AUTOMATICO: 'Automático', MANUAL: 'Manual', STOP: 'Detenido' }
const CHIPS = [['comp', 'Compresor'], ['eva', 'Evaporador'], ['res', 'Resistencia']] as const

interface Evento { ts: number; texto: string }

export default function Camara() {
  const { c } = useParams()
  const cam = (c ?? '').toUpperCase()
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const ahora = useNow(1000)
  const dia = diaPlanta(ahora)
  const valida = (CAMARAS as readonly string[]).includes(cam)
  const tr = useDatos<TramoApi>('tramos', dia, dia, valida ? cam : '', 60000)
  const filas = useDatos<FilaDescongelado>('descongelados', dia, dia, valida ? cam : '', 60000)
  const tramos = useMemo(() => (tr.data ? aTramos(tr.data) : null), [tr.data])
  const ev = useDatos<Evento>('eventos', dia, dia, valida ? cam : '', 60000)
  if (!valida) return <div className="text-center text-muted-foreground py-16">Cámara inexistente. <Link className="underline" to="/">Volver</Link></div>

  const sinDatos = !estado || incompatible || estaVencido(recibidoEn, ahora)
  const f = estado && !sinDatos ? fraseCamara(estado, cam, ahora) : null
  const hayDatos = !!f && f.nivel !== 'sin-datos'
  const badge = hayDatos ? badgeCamara(estado!, cam, f!.nivel) : null
  const modo = hayDatos ? MODOS[txt(estado, `${cam}.modo`)] : undefined
  const falta = hayDatos ? faltanMin(estado!, cam) : null
  const dia0 = Date.parse(`${dia}T00:00:00${PLANTA_OFFSET}`)
  const avisos = (ev.data ?? []).slice(-5).reverse()
  const v = (k: string) => { const x = txt(estado, k); return x === '' ? '—' : x }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-center text-sm font-medium">
        {CAMARAS.map(k => <Link key={k} to={`/camara/${k}`} className={`rounded-md py-1.5 ${k === cam ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{nombreCamara(k)}</Link>)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{nombreCamara(cam)}</h1>
        {modo && <span className="text-sm text-muted-foreground">{modo}</span>}
        {badge && <Badge className="ml-auto border-transparent text-white" style={{ backgroundColor: badge.c }}>{badge.t}</Badge>}
        {!hayDatos && <span className="ml-auto text-sm text-amber-600 dark:text-amber-400">{incompatible ? 'El PLC tiene un programa viejo' : ts ? `Sin datos desde ${hhmm(ts)}` : 'Sin datos todavía'}</span>}
      </div>
      {hayDatos && <div><div className="font-bold">{f!.titulo}</div>{f!.detalle && <div className="text-sm text-muted-foreground">{f!.detalle}</div>}</div>}

      <Card className={`p-4 space-y-3 rounded-2xl ${sinDatos ? 'grayscale opacity-70' : ''}`}>
        <div className="font-semibold">Equipos</div>
        {GRUPOS.map(g => {
          const eq = hayDatos ? estadoEquipo(estado!, cam, g) : null
          const tiene = (k: string) => hayDatos && num(estado, `${cam}.G${g}.${k}`) === 1
          return (
            <div key={g} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <BotonEquipo c={cam} g={g} />
              <div className="min-w-0 flex-1 text-sm">
                Equipo {g} · {eq ? eq.texto : 'Sin datos'}
                {eq?.clave === 'DESCONGELANDO' && falta != null && ` · faltan ${falta} min`}
              </div>
              <div className="flex gap-1">
                {CHIPS.map(([k, n]) => <span key={k} className={`rounded-full px-2 py-0.5 text-xs ${tiene(k) ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>{n}</span>)}
              </div>
            </div>
          )
        })}
      </Card>

      <LineaDescongelados estado={estado} sinDatos={sinDatos} cam={cam} ahora={ahora} filas={filas.error ? null : filas.data} />
      <BarrasEquipos tramos={tramos} error={tr.error} dia0={dia0} ahora={ahora} />

      <Card className="p-4 space-y-2 rounded-2xl">
        <div className="font-semibold">Últimos avisos</div>
        {ev.error ? <div className="text-sm text-muted-foreground">No se pudieron cargar los avisos</div>
          : !ev.data ? <div className="text-sm text-muted-foreground">Cargando…</div>
          : avisos.length === 0 ? <div className="text-sm text-muted-foreground">Sin avisos hoy</div>
          : <ul className="text-sm space-y-1">{avisos.map((a, i) => <li key={i}><span className="text-muted-foreground">{hhmm(a.ts)}</span> {fraseEvento(a.texto)}</li>)}</ul>}
      </Card>

      <details className="rounded-2xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Ver detalles técnicos</summary>
        {sinDatos ? <div className="mt-3 text-muted-foreground">{ts ? `Sin datos desde ${hhmm(ts)}` : 'Sin datos todavía'}</div> : <div className="mt-3 overflow-x-auto space-y-4">
          <table className="w-full text-left">
            <thead><tr className="text-muted-foreground"><th className="pr-3">Equipo</th><th className="pr-3">Arranques</th><th className="pr-3">Horas de marcha</th><th className="pr-3">Horas sin descongelar</th></tr></thead>
            <tbody>{GRUPOS.map(g => <tr key={g}><td>{g}</td><td>{v(`${cam}.G${g}.arranques`)}</td><td>{v(`${cam}.G${g}.horas_marcha`)}</td><td>{v(`${cam}.G${g}.horas_sin_desc`)}</td></tr>)}</tbody>
          </table>
          <table className="w-full text-left">
            <thead><tr className="text-muted-foreground"><th className="pr-3">Horario</th><th className="pr-3">Hora</th><th className="pr-3">Etapa 1 (min)</th><th className="pr-3">Etapa 2 (min)</th></tr></thead>
            <tbody>{HORARIOS.map(h => (
              <tr key={h}><td>{h}</td><td>{v(`${cam}.H${h}.hora`)}</td>
                {[0, 1].map(i => <td key={i}>{num(estado, `${cam}.H${h}.etapa${i}_habilitada`) ? v(`${cam}.H${h}.etapa${i}_min`) : 'deshabilitada'}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>}
      </details>
    </div>
  )
}

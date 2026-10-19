import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Confirmar, usePermiso, refrescarLuego } from '../components/Confirmar'
import { useCamarasStore } from '../store/camaras'
import { CAMARAS, GRUPOS, HORARIOS, nombreCamara } from '../lib/camaras'
import { campos, cambios, enviarMando, fraseConfirmacion, textoResultado, type Valor, type Pedido } from '../lib/mando'

const ESPERA_MS = 2100   // la API rechaza (429) dos pedidos del mismo usuario con menos de 2 s
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const frase = (p: Pedido) => fraseConfirmacion(p.comando, p.camara ?? '', undefined, p.horario, p.valor).replace(/^¿|\?$/g, '')

export default function Programacion() {
  const estado = useCamarasStore(s => s.estado)
  const permiso = usePermiso(20)
  const [params] = useSearchParams()
  // ?camara=C5 (desde el botón Ajustes de la página de la cámara) abre esa cámara
  const [cam, setCam] = useState<string>(() => (CAMARAS as readonly string[]).includes(params.get('camara') ?? '') ? params.get('camara')! : CAMARAS[0])
  const [ed, setEd] = useState<Record<string, Valor>>({})
  const [abierto, setAbierto] = useState(false)
  const [corriendo, setCorriendo] = useState(false)
  const [hechos, setHechos] = useState<{ id: string; texto: string; res: string; ok: boolean }[]>([])
  const [total, setTotal] = useState(0)
  const vuelo = useRef(false)

  const cs = useMemo(() => campos(estado, CAMARAS, HORARIOS), [estado])
  const porId = useMemo(() => Object.fromEntries(cs.map(c => [c.id, c])), [cs])
  const lista = useMemo(() => cambios(cs, ed), [cs, ed])
  const malos = new Set(lista.filter(x => !x.ok).map(x => x.campo.id))
  const camMalas = CAMARAS.filter(k => lista.some(x => !x.ok && x.campo.camara === k))
  const ajusteMalo = lista.some(x => !x.ok && !x.campo.camara)
  const val = (id: string): Valor => (id in ed ? ed[id] : porId[id]?.actual ?? '')
  const set = (id: string, v: Valor) => setEd(x => ({ ...x, [id]: v }))
  const off = !permiso.ok || corriendo
  const listos = lista.filter(x => x.ok)

  async function guardar() {
    if (vuelo.current) return
    vuelo.current = true
    setCorriendo(true); setHechos([]); setTotal(listos.length)
    try {
      for (let i = 0; i < listos.length; i++) {
        if (i) await dormir(ESPERA_MS)
        const { campo, pedido } = listos[i]
        const r = await enviarMando(pedido!)
        setHechos(h => [...h, { id: campo.id, texto: frase(pedido!), res: textoResultado(r), ok: r.resultado === 1 }])
        if (r.resultado === 1) setEd(x => { const { [campo.id]: _, ...resto } = x; return resto })
        if (r.resultado === 0) {   // desconocido: no se sigue mandando; el resto queda sin enviar
          setHechos(h => [...h, ...listos.slice(i + 1).map(({ campo: c, pedido: p }) => ({ id: c.id, texto: frase(p!), res: 'no enviado', ok: false }))])
          break
        }
      }
    } finally {
      vuelo.current = false
      setCorriendo(false)
    }
    refrescarLuego()
  }
  const cerrar = () => { if (!corriendo) { setAbierto(false); setHechos([]) } }

  const num = (id: string, props: { step?: string; max?: number } = {}) => (
    <Input type="number" inputMode="decimal" step={props.step ?? '1'} min={0} max={props.max} value={String(val(id))} disabled={off}
      onChange={e => set(id, e.target.value)} aria-invalid={malos.has(id)} className={`min-w-0 text-base ${malos.has(id) ? 'border-red-500' : ''}`} />
  )
  const tiene = (id: string) => id in porId
  const sw = (id: string, n: string) => tiene(id) && (
    <label className="flex toque items-center justify-between gap-2 text-sm"><span>{n}</span>
      <Switch checked={!!val(id)} disabled={off} onCheckedChange={v => set(id, v)} aria-label={n} /></label>
  )

  const filaAjuste = (id: string) => tiene(id) && (
    <label key={id} className="block space-y-1 text-sm"><span>{porId[id].titulo[0].toUpperCase() + porId[id].titulo.slice(1)}</span>{num(id)}</label>
  )

  return (
    <div className="max-w-2xl space-y-3">
      <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex flex-wrap items-center gap-2 border-b bg-background px-3 pb-2 pt-5 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-8">
        <h1 className="text-[18px] font-semibold">Programación de descongelados</h1>
        {/* Guardar arriba y fijo al hacer scroll: no tapa los campos */}
        <Button className="ml-auto h-auto py-2" variant={listos.length ? 'default' : 'outline'} disabled={off || listos.length === 0 || malos.size > 0} onClick={() => { setHechos([]); setTotal(0); setAbierto(true) }}>
          {lista.length === 0 ? 'Guardar (sin cambios)' : malos.size ? `Revisá los valores en rojo (${[...camMalas.map(nombreCamara), ...(ajusteMalo ? ['ajustes'] : [])].join(' y ')})` : `Guardar ${listos.length} ${listos.length === 1 ? 'cambio' : 'cambios'}`}
        </Button>
      </div>
      {!permiso.ok && <div role="alert" className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{permiso.motivo}</div>}
      {!estado && <div className="text-sm text-muted-foreground">Sin datos todavía</div>}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-center text-sm font-medium">
        {CAMARAS.map(k => <button key={k} onClick={() => setCam(k)} className={`toque rounded-md ${k === cam ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{nombreCamara(k)}{camMalas.includes(k) && ' ⚠'}</button>)}
      </div>

      {HORARIOS.filter(h => tiene(`${cam}.H${h}.hora`)).map(h => {
        const p = `${cam}.H${h}.`
        return (
          <Card key={h} className="space-y-3 rounded-xl p-3">
            <div className="font-semibold">Horario {h}</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm"><span>Hora</span>
                <Input type="time" value={String(val(p + 'hora')).padStart(5, '0')} disabled={off} onChange={e => set(p + 'hora', e.target.value)} className={`min-w-0 text-base ${malos.has(p + 'hora') ? 'border-red-500' : ''}`} /></label>
              <div className="self-end">{sw(p + 'hab', 'Habilitado')}</div>
              <label className="space-y-1 text-sm"><span>Etapa 1 (min)</span>{tiene(p + 't1') && num(p + 't1', { step: '0.1' })}</label>
              <div className="self-end">{sw(p + 'e1', 'Etapa 1 activa')}</div>
              <label className="space-y-1 text-sm"><span>Etapa 2 (min)</span>{tiene(p + 't2') && num(p + 't2', { step: '0.1' })}</label>
              <div className="self-end">{sw(p + 'e2', 'Etapa 2 activa')}</div>
            </div>
            {tiene(p + 'etapas') && (
              <fieldset className="space-y-1">
                <legend className="text-sm">Equipos que descongelan en la etapa 2</legend>
                <div className="grid grid-cols-2 gap-x-3 min-[400px]:grid-cols-4">
                  {GRUPOS.map((g, i) => {
                    const s = String(val(p + 'etapas'))
                    return <label key={g} className="toque inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5" checked={s[i] === '2'} disabled={off}
                        onChange={e => set(p + 'etapas', s.slice(0, i) + (e.target.checked ? '2' : '1') + s.slice(i + 1))} />Equipo {g}</label>
                  })}
                </div>
                {malos.has(p + 'etapas') && <div className="text-xs text-red-600">Tiene que haber al menos un equipo en cada etapa</div>}
              </fieldset>
            )}
          </Card>
        )
      })}

      <Card className="space-y-3 rounded-xl p-3">
        <div className="font-semibold">Recuperación y ajustes</div>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {tiene(`${cam}.recuperacion`) && <label className="block space-y-1 text-sm"><span>Tiempo de recuperación de {nombreCamara(cam)} (min)</span>{num(`${cam}.recuperacion`, { max: 60 })}</label>}
          {['ajuste1', 'ajuste2', 'ajuste3'].map(filaAjuste)}
        </div>
        <div className="text-xs text-muted-foreground">Los ajustes valen para las dos cámaras. Horas: de 0 a 999. 0 en el tope de la resistencia = sin tope.</div>
      </Card>


      <Confirmar abierto={abierto} enviando={corriendo}
        frase={total === 0 ? `¿Guardar ${listos.length} ${listos.length === 1 ? 'cambio' : 'cambios'} en la programación?` : corriendo ? `Guardando… ${hechos.length} de ${total}` : `Listo: ${hechos.filter(h => h.ok).length} de ${total} guardados`}
        detalle={total === 0 && <ul className="max-h-[40vh] list-disc space-y-1 overflow-y-auto pl-5 text-sm">{listos.map(x => <li key={x.campo.id}>{frase(x.pedido!)}</li>)}</ul>}
        resultado={total === 0 ? null : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
            {hechos.map(h => <li key={h.id} className={h.ok ? '' : 'text-red-600'}><div>{h.texto}</div><b>{h.res}</b></li>)}
            {corriendo && <li className="text-muted-foreground">Mandando el pedido {hechos.length + 1} de {total}…</li>}
          </ul>
        )}
        onConfirmar={guardar} onCerrar={cerrar} />
    </div>
  )
}

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { useMando, usePermiso } from './Confirmar'
import { useCamarasStore } from '../store/camaras'
import { estadoEquipo } from '../lib/frases'
import { nombreCamara, txt, num } from '../lib/camaras'
import { topeRes } from '../lib/mando'

const MODOS = [['AUTO', 0, 'Automático'], ['MANUAL', 1, 'Manual'], ['FUERA DE SERVICIO', 2, 'Fuera de servicio']] as const

// Hoja de un equipo: modo, y en manual compresor / evaporador / resistencia; si descongela, cortar. Cada acción pide confirmación.
export default function HojaEquipo({ cam, g, onCerrar }: { cam: string; g: number; onCerrar: () => void }) {
  const estado = useCamarasStore(s => s.estado)
  const permiso = usePermiso(1)   // 1..6 tienen el mismo permiso (rol operar)
  const { pedir, enviando, dialogo } = useMando()
  const [minutos, setMinutos] = useState('30')
  const k = (x: string) => `${cam}.G${g}.${x}`
  const modo = txt(estado, k('modo'))
  const eq = estado ? estadoEquipo(estado, cam, g) : null
  const tope = topeRes(estado)
  const min = Number(minutos)
  const minOk = minutos.trim() !== '' && Number.isInteger(min) && min >= 1 && min <= (tope > 0 ? tope : 65535)
  const off = !permiso.ok || enviando
  const base = { camara: cam, grupo: g }

  return (<>
    <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nombreCamara(cam)} · Equipo {g}</DialogTitle>
          <div className="text-sm text-muted-foreground">Ahora: {eq?.texto ?? 'Sin datos'}</div>
        </DialogHeader>
        {!permiso.ok && <div role="alert" className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{permiso.motivo}</div>}

        <section className="space-y-2">
          <div className="font-semibold">Modo</div>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
            {MODOS.map(([clave, v, n]) => (
              <Button key={clave} variant={modo === clave ? 'default' : 'outline'} className={`h-auto py-2 whitespace-normal text-sm ${modo === clave ? 'disabled:opacity-100' : ''}`}
                disabled={off || modo === clave} onClick={() => pedir({ comando: 1, ...base, valor: v })}>{n}</Button>
            ))}
          </div>
        </section>

        {modo === 'MANUAL' && (
          <section className="space-y-3">
            {([[2, 'comp', 'Compresor'], [3, 'eva', 'Evaporador']] as const).map(([cmd, key, n]) => (
              <label key={cmd} className="flex toque items-center justify-between gap-3">
                <span className="font-medium">{n}</span>
                <Switch checked={num(estado, k(estado?.[k(key + '_pedido')] != null ? key + '_pedido' : key)) === 1} disabled={off} aria-label={n}
                  onCheckedChange={v => pedir({ comando: cmd, ...base, valor: v ? 1 : 0 })} />
              </label>
            ))}
            <div className="space-y-2">
              <div className="font-medium">Resistencia {num(estado, k('res')) === 1 ? '(prendida)' : '(apagada)'}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="number" inputMode="numeric" min={1} max={tope || undefined} value={minutos} onChange={e => setMinutos(e.target.value)}
                  className="h-10 w-24 text-base" aria-label="Minutos de resistencia" disabled={off} />
                <span className="text-sm">min</span>
                <Button className="h-auto py-2 flex-1 whitespace-normal" disabled={off || !minOk} onClick={() => pedir({ comando: 4, ...base, valor: min })}>Prender</Button>
                <Button variant="outline" className="h-auto py-2 flex-1 whitespace-normal" disabled={off} onClick={() => pedir({ comando: 4, ...base, valor: 0 })}>Apagar</Button>
              </div>
              {!minOk && <div className="text-xs text-red-600">{tope ? `Poné minutos enteros, de 1 a ${tope}` : 'Poné minutos enteros (1 o más)'}</div>}
            </div>
          </section>
        )}

        {eq?.clave === 'DESCONGELANDO' && (
          <Button variant="destructive" className="h-auto py-2 text-base" disabled={off} onClick={() => pedir({ comando: 6, ...base, valor: 0 })}>Cortar descongelado</Button>
        )}
      </DialogContent>
    </Dialog>
    {dialogo}
  </>)
}

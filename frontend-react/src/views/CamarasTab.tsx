import { useState } from 'react'
import { toast } from 'sonner'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useConfigStore } from '../store/config'
import { CAMARAS, nombreCamara, esIPv4 } from '../lib/camaras'

// Conexión con el PLC (config.plc: la lee el poller y reconecta sola al guardar)
// y rangos de temperatura por cámara (config.camaras.rangos)
export default function CamarasTab() {
  const { config, setConfig, save, loading } = useConfigStore()
  const [ip, setIp] = useState(config?.plc?.ip ?? '')
  const [port, setPort] = useState(String(config?.plc?.port ?? 502))
  const [unit, setUnit] = useState(String(config?.plc?.unitId ?? 255))
  const [rangos, setRangos] = useState<Record<string, { min: string; max: string }>>(
    Object.fromEntries(CAMARAS.map(k => [k, { min: String(config?.camaras?.rangos?.[k]?.min ?? ''), max: String(config?.camaras?.rangos?.[k]?.max ?? '') }]))
  )

  async function guardar() {
    if (!config) return
    const rg: Record<string, { min: number; max: number }> = {}
    for (const k of CAMARAS) {
      const { min, max } = rangos[k]
      if (min === '' && max === '') continue
      if (min === '' || max === '' || Number(min) >= Number(max)) return toast.error(`${nombreCamara(k)}: el mínimo debe ser menor que el máximo`)
      rg[k] = { min: Number(min), max: Number(max) }
    }
    if (!esIPv4(ip.trim())) return toast.error('Dirección IP inválida (ej. 192.168.3.71)')
    const p = Number(port), u = Number(unit)
    if (!(Number.isInteger(p) && p > 0 && p < 65536)) return toast.error('Puerto inválido')
    if (unit.trim() === '' || !(Number.isInteger(u) && u >= 0 && u <= 255)) return toast.error('Unidad Modbus inválida (0 a 255)')
    setConfig({ ...config, plc: { ip: ip.trim(), port: p, unitId: u }, camaras: { rangos: rg } })
    if (await save()) toast.success('Guardado')
    else toast.error('No se pudo guardar')
  }

  return (
    <Card className="p-3 space-y-3 max-w-xl">
      <div className="font-semibold">Conexión con el PLC (Modbus TCP)</div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-2 space-y-1"><Label>Dirección IP</Label><Input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.3.71" /></div>
        <div className="space-y-1"><Label>Puerto</Label><Input value={port} onChange={e => setPort(e.target.value)} inputMode="numeric" /></div>
        <div className="space-y-1"><Label>Unidad</Label><Input value={unit} onChange={e => setUnit(e.target.value)} inputMode="numeric" /></div>
      </div>
      <div className="font-semibold">Rangos de temperatura (°C) para alertas</div>
      {CAMARAS.map(k => (
        <div key={k} className="grid grid-cols-3 gap-2 items-end">
          <div className="text-sm pb-2">{nombreCamara(k)}</div>
          <div className="space-y-1"><Label>Mínimo</Label><Input value={rangos[k].min} inputMode="decimal" onChange={e => setRangos({ ...rangos, [k]: { ...rangos[k], min: e.target.value } })} /></div>
          <div className="space-y-1"><Label>Máximo</Label><Input value={rangos[k].max} inputMode="decimal" onChange={e => setRangos({ ...rangos, [k]: { ...rangos[k], max: e.target.value } })} /></div>
        </div>
      ))}
      <Button onClick={guardar} disabled={loading}>Guardar</Button>
    </Card>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { apiBlob, apiJson } from '../lib/api'
import { useDatos } from '../lib/useDatos'
import { resumenAyer } from '../lib/sistema'
import { fechaDia, ayerPlanta } from '../lib/camaras'
import { useAuthStore } from '../store/auth'

const n = (v: number | null, u = '') => (v == null ? 'sin datos' : `${v}${u}`)

type Canales = { correo: boolean; telegram: boolean }
type Info = { time: string; canales: Canales; telegramConfigurado: boolean; enabled: boolean }
type ResultadoEnvio = { correo: string; telegram: string; historyError?: boolean }

// Resultado de un canal en palabras ('ok' | 'error: …' | 'no configurado' | 'apagado')
const resultado = (r: string) => (r === 'ok' ? 'enviado ✓' : r === 'apagado' ? 'apagado' : r === 'no configurado' ? 'no está configurado' : `no se pudo (${r.replace(/^error: /, '')})`)

function Envio({ admin }: { admin: boolean }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [envio, setEnvio] = useState<ResultadoEnvio | null>(null)

  useEffect(() => { if (admin) apiJson<Info>('/settings/daily-report').then(setInfo).catch(e => setErr(e.message)) }, [admin])

  async function cambiar(canal: keyof Canales, valor: boolean) {
    setGuardando(true); setErr('')
    try { setInfo(await apiJson<Info>('/settings/daily-report', { method: 'POST', body: JSON.stringify({ canales: { [canal]: valor } }) })) }
    catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  async function mandar() {
    setEnviando(true); setErr(''); setEnvio(null)
    try { setEnvio(await apiJson<ResultadoEnvio>('/settings/daily-report/enviar', { method: 'POST', body: '{}' })) }
    catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo mandar') }
    finally { setEnviando(false) }
  }

  if (!admin) return <p className="text-sm text-muted-foreground">El reporte sale solo todos los días.</p>
  if (!info) return err ? <p className="text-sm text-destructive">{err}</p> : null
  return (
    <div className="rounded-xl bg-white dark:bg-card shadow-sm p-3 space-y-2 text-sm">
      <div className="font-semibold">Envío automático</div>
      <p className="text-muted-foreground">
        {info.enabled ? `Sale todos los días a las ${info.time} con el PDF del día anterior.` : 'El envío automático está apagado en el servidor.'}{' '}
        La hora se cambia en <Link to="/config" className="underline">Configuración avanzada</Link>.
      </p>
      <label className="toque flex items-center justify-between gap-3">
        <span>Mandar por correo</span>
        <Switch checked={info.canales.correo} disabled={guardando} onCheckedChange={(v) => cambiar('correo', v)} />
      </label>
      <label className="toque flex items-center justify-between gap-3">
        <span>
          Mandar por Telegram
          {!info.telegramConfigurado && <span className="block text-xs text-muted-foreground">Configurá Telegram en <Link to="/config?tab=telegram" className="underline">Configuración avanzada</Link></span>}
        </span>
        <Switch checked={info.telegramConfigurado && info.canales.telegram} disabled={guardando || !info.telegramConfigurado} onCheckedChange={(v) => cambiar('telegram', v)} />
      </label>
      <Button variant="outline" className="w-full" onClick={mandar} disabled={enviando}>{enviando ? 'Mandando…' : 'Mandar el reporte de ayer ahora'}</Button>
      {envio && (
        <div>
          {envio.historyError && <div className="text-destructive">No se pudo leer el historial: salió solo el aviso, sin PDF.</div>}
          <div>Correo: {resultado(envio.correo)}</div>
          <div>Telegram: {resultado(envio.telegram)}</div>
        </div>
      )}
      {err && <p className="text-destructive">{err}</p>}
    </div>
  )
}

export default function Reportes() {
  const dia = ayerPlanta()
  const admin = useAuthStore(s => s.isAdmin())
  const [fecha, setFecha] = useState(dia)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const desc = useDatos<any>('descongelados', dia, dia)
  const ev = useDatos<any>('eventos', dia, dia)
  const comp = useDatos<any>('compresores', dia, dia)
  const r = useMemo(() => resumenAyer(desc.data, ev.data, comp.data), [desc.data, ev.data, comp.data])

  async function descargar() {
    setBusy(true); setErr('')
    try {
      const blob = await apiBlob(`/reportes/diario.pdf?fecha=${encodeURIComponent(fecha)}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `reporte-camaras_${fecha}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al descargar')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 max-w-md">
      <h1 className="text-xl font-semibold">Reporte diario</h1>
      <div className="rounded-xl bg-white dark:bg-card shadow-sm p-3 space-y-1 text-sm">
        <div className="font-semibold">Ayer, {fechaDia(Date.parse(`${dia}T12:00:00-03:00`))}</div>
        <div>Descongelados: {n(r.descongelados)}{r.saltados ? ` (${r.saltados} se saltaron)` : ''}</div>
        <div>Alarmas: {n(r.avisos)} (sin contar acciones de operarios)</div>
        <div>Horas de compresores: {n(r.horas, ' h')}</div>
      </div>
      <div className="flex items-center gap-2">
        <input type="date" aria-label="Día del reporte" value={fecha} max={dia} min="2000-01-01" onChange={(e) => setFecha(e.target.value)}
          className="toque rounded-md border bg-background px-2 text-sm" />
        <Button className="flex-1" onClick={descargar} disabled={busy || !fecha}>{busy ? 'Generando…' : '⬇ Descargar PDF'}</Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Envio admin={admin} />
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/config'
import { authFetch, useAuthStore, ROLE_LABEL, type Role } from '../store/auth'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import CamarasTab from './CamarasTab'
import { Plus, Trash2, Pencil, Save, X, ChevronRight, RotateCcw, ScanSearch, Loader2, Mail, Lock, Search } from 'lucide-react'
import { toast } from 'sonner'
import BrandingTab from './BrandingTab'
import ConexionTab from './ConexionTab'
import ReplicasTab from './ReplicasTab'
import { useServerStore } from '../store/server'
import { ZONA } from '../lib/camaras'
import { errorToken, errorChat, TG_TIPO, type TgChat } from '../lib/telegram'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export default function Config() {
  const store = useConfigStore()
  const replica = useServerStore(s => s.replica)
  // Marca, Conexión y Réplicas: solo el superadmin
  const superadmin = useAuthStore(s => s.role === 'superadmin')

  useEffect(() => { if (!store.config) store.load() }, [])

  // Sin gate de contraseña propio: la ruta /config ya es solo-admin (por rol).

  if (store.error) {
    return <div className="text-center text-destructive py-16">Error al cargar configuración: {store.error}</div>
  }

  if (!store.config) {
    return <div className="text-center text-muted-foreground py-16">Cargando configuración...</div>
  }

  return (
    <div className="space-y-3">
    <a href="/grafana/" target="_blank" rel="noreferrer" className="text-sm underline text-primary">Gráficos de largo plazo</a>
    <Tabs defaultValue={new URLSearchParams(window.location.search).get('tab') === 'telegram' ? 'telegram' : 'smtp'} className="space-y-3">
      <TabsList>
        <TabsTrigger value="smtp">Correo</TabsTrigger>
        <TabsTrigger value="telegram">Telegram</TabsTrigger>
        <TabsTrigger value="camaras">Cámaras</TabsTrigger>
        {superadmin && <TabsTrigger value="brand">Marca</TabsTrigger>}
        {superadmin && <TabsTrigger value="conexion">Conexión</TabsTrigger>}
        {superadmin && !replica && <TabsTrigger value="replicas">Réplicas</TabsTrigger>}
      </TabsList>

      {replica && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
          Servidor réplica: la configuración se sincroniza desde planta y es solo lectura.
          Correo y marca son de este servidor.
        </div>
      )}
      {/* fieldset disabled deshabilita inputs/botones (incl. Switch/Select de Radix, que son <button>) */}
      <TabsContent value="smtp"><SmtpTab /></TabsContent>
      <TabsContent value="telegram"><TelegramTab /></TabsContent>
      <TabsContent value="camaras"><CamarasTab key={JSON.stringify(store.config?.camaras ?? null)} /></TabsContent>
      {superadmin && <TabsContent value="brand"><BrandingTab /></TabsContent>}
      {superadmin && <TabsContent value="conexion"><ConexionTab /></TabsContent>}
      {superadmin && !replica && <TabsContent value="replicas"><ReplicasTab /></TabsContent>}
    </Tabs>
    </div>
  )
}

// ─── SMTP / Correo ────────────────────────────────────────────────────
type SmtpCfg = { host: string; port: number; user: string; from: string; to: string; secure: boolean; hasPassword: boolean; pass: string }

function SmtpTab() {
  const [cfg, setCfg] = useState<SmtpCfg | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      if (MODE === 'mock') {
        setCfg({ host: 'smtp.gmail.com', port: 587, user: 'planta@ejemplo.com', from: 'planta@ejemplo.com', to: 'mantenimiento@ejemplo.com', secure: false, hasPassword: true, pass: '' })
      } else {
        const r = await authFetch(`${API_BASE}/settings/smtp`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json()
        setCfg({ ...d, pass: '' })
      }
    } catch (e: any) { toast.error(`No se pudo cargar el SMTP: ${e.message}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function patch(p: Partial<SmtpCfg>) { setCfg(c => c ? { ...c, ...p } : c) }

  async function save() {
    if (!cfg) return
    if (MODE === 'mock') { toast.success('Guardado (demo)'); patch({ pass: '', hasPassword: cfg.hasPassword || !!cfg.pass }); return }
    setSaving(true)
    try {
      const body: any = { host: cfg.host, port: cfg.port, user: cfg.user, from: cfg.from, to: cfg.to, secure: cfg.secure }
      if (cfg.pass) body.pass = cfg.pass
      const r = await authFetch(`${API_BASE}/settings/smtp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      toast.success('SMTP guardado')
      patch({ pass: '', hasPassword: cfg.hasPassword || !!cfg.pass })
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  async function test() {
    if (MODE === 'mock') { toast.success('Correo de prueba enviado (demo)'); return }
    setTesting(true)
    try {
      const r = await authFetch(`${API_BASE}/settings/smtp/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      toast.success(`Correo de prueba enviado a ${d.to}`)
    } catch (e: any) { toast.error(`Falló el envío de prueba: ${e.message}`) }
    finally { setTesting(false) }
  }

  if (loading || !cfg) return <div className="text-muted-foreground text-sm py-8 text-center">Cargando configuración…</div>

  return (
    <div className="max-w-2xl">
      <Card className="p-3 space-y-3">
        <p className="text-sm text-muted-foreground">Servidor de correo saliente usado para alertas y el reporte diario.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2"><Label>Servidor (host)</Label><Input value={cfg.host} onChange={e => patch({ host: e.target.value })} placeholder="smtp.gmail.com" /></div>
          <div><Label>Puerto</Label><Input type="number" value={cfg.port} onChange={e => patch({ port: +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Usuario</Label><Input value={cfg.user} onChange={e => patch({ user: e.target.value })} autoComplete="off" placeholder="usuario@dominio.com" /></div>
          <div><Label>Contraseña</Label><Input type="password" value={cfg.pass} onChange={e => patch({ pass: e.target.value })} placeholder={cfg.hasPassword ? '•••••• (sin cambios)' : 'contraseña'} autoComplete="new-password" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Remitente (From)</Label><Input value={cfg.from} onChange={e => patch({ from: e.target.value })} placeholder="planta@dominio.com" /></div>
          <div><Label>Destinatario(s)</Label><Input value={cfg.to} onChange={e => patch({ to: e.target.value })} placeholder="uno@dominio.com, otro@..." /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={cfg.secure} onCheckedChange={v => patch({ secure: v })} />
          Conexión segura (SSL/TLS directo, puerto 465). Para 587 dejar apagado (STARTTLS).
        </label>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={testing} onClick={test}>
            {testing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
            Enviar prueba
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
      <DailyReportCard />
    </div>
  )
}

// ─── Telegram ─────────────────────────────────────────────────────────
// Repetición de los avisos de alarma por Telegram y correo, mientras nadie toque "Visto"
function RepeticionCard() {
  const [minutos, setMinutos] = useState('15')
  const [veces, setVeces] = useState('4')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    authFetch(`${API_BASE}/settings/repeticion`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setMinutos(String(d.minutos)); setVeces(String(d.veces)) } }).catch(() => {})
  }, [])
  async function guardar() {
    setGuardando(true)
    try {
      const r = await authFetch(`${API_BASE}/settings/repeticion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutos: Number(minutos), veces: Number(veces) }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setMinutos(String(d.minutos)); setVeces(String(d.veces))
      toast.success('Repetición guardada')
    } catch (e: any) { toast.error(e.message) } finally { setGuardando(false) }
  }
  return (
    <Card className="p-3 space-y-3 mt-3">
      <div>
        <div className="font-semibold">Repetir el aviso de alarma</div>
        <p className="text-sm text-muted-foreground">Mientras la alarma siga activa y nadie toque "Visto" (en el portal o en Telegram), el aviso se manda de nuevo. 0 veces = no repetir.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label htmlFor="rep-min">Cada (minutos)</Label><Input id="rep-min" type="number" min={5} max={240} className="w-28" value={minutos} onChange={e => setMinutos(e.target.value)} /></div>
        <div><Label htmlFor="rep-veces">Hasta (veces)</Label><Input id="rep-veces" type="number" min={0} max={20} className="w-28" value={veces} onChange={e => setVeces(e.target.value)} /></div>
        <Button size="sm" disabled={guardando} onClick={guardar}>{guardando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}Guardar</Button>
      </div>
    </Card>
  )
}

function TelegramTab() {
  const [chatId, setChatId] = useState('')
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [chats, setChats] = useState<TgChat[] | null>(null)
  const [chatsErr, setChatsErr] = useState('')

  useEffect(() => {
    (async () => {
      try {
        if (MODE === 'mock') { setChatId('-1001234567'); setHasToken(true) }
        else {
          const r = await authFetch(`${API_BASE}/settings/telegram`)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d = await r.json()
          setChatId(d.chatId || ''); setHasToken(!!d.hasToken)
        }
      } catch (e: any) { toast.error(`No se pudo cargar Telegram: ${e.message}`) }
      finally { setLoading(false) }
    })()
  }, [])

  const err = errorToken(token) || (chatId.trim() ? errorChat(chatId) : null)

  async function save(): Promise<boolean> {
    if (err) { toast.error(err); return false }
    if (MODE === 'mock') { toast.success('Guardado (demo)'); setHasToken(h => h || !!token); setToken(''); return true }
    setSaving(true)
    try {
      const body: any = { chatId: chatId.trim() }
      if (token.trim()) body.token = token.trim()
      const r = await authFetch(`${API_BASE}/settings/telegram`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setHasToken(!!d.telegram?.hasToken); setToken('')
      toast.success('Telegram guardado')
      return true
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`); return false }
    finally { setSaving(false) }
  }

  // Lista los chats que vio el bot. Manda el token solo si el usuario escribió uno.
  async function buscar() {
    setBuscando(true); setChatsErr('')
    try {
      if (MODE === 'mock') { setChats([{ id: -1001234567, tipo: 'grupo', nombre: 'Planta (demo)' }]); return }
      const r = await authFetch(`${API_BASE}/settings/telegram/chats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(token.trim() ? { token: token.trim() } : {}) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setChats(d.chats || [])
    } catch (e: any) { setChats(null); setChatsErr(e.message) }
    finally { setBuscando(false) }
  }

  // Prueba con lo guardado: si hay cambios sin guardar, los guarda antes.
  async function probar() {
    if (!(await save())) return
    if (MODE === 'mock') { toast.success('Aviso de prueba enviado (demo)'); return }
    setTesting(true)
    try {
      const r = await authFetch(`${API_BASE}/avisos/prueba`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canal: 'telegram' }) })
      const d = await r.json().catch(() => null)
      if (r.status === 429) toast.error('Esperá un minuto antes de volver a probar')
      else if (r.ok && d?.ok) toast.success('Aviso enviado. Fijate en Telegram.')
      else toast.error(`No se pudo: ${d?.error || `HTTP ${r.status}`}`)
    } catch { toast.error('No se pudo: no hay conexión con el servidor') }
    finally { setTesting(false) }
  }

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Cargando configuración…</div>

  return (
    <div className="max-w-2xl">
      <Card className="p-3 space-y-3">
        <p className="text-sm text-muted-foreground">Bot de Telegram que manda las alarmas y los avisos.</p>
        <div>
          <Label>Token del bot</Label>
          <Input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="new-password"
            placeholder={hasToken ? '•••••• (sin cambios)' : '123456:ABC…'} />
          {hasToken && <p className="text-xs text-muted-foreground mt-1">token guardado ✓</p>}
        </div>
        <div>
          <Label>Chat ID</Label>
          <Input value={chatId} onChange={e => setChatId(e.target.value)} autoComplete="off" placeholder="-1001234567 o @micanal" />
        </div>
        <p className="text-sm text-muted-foreground">Agregá el bot al grupo y escribí /start@NombreDelBot en el grupo (o mandale /start al bot si es para vos). Después tocá Buscar.</p>
        <Button size="sm" variant="outline" disabled={buscando} onClick={buscar}>
          {buscando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          Buscar chats del bot
        </Button>
        {chatsErr && <p className="text-xs text-destructive">{chatsErr}</p>}
        {chats && chats.length === 0 && <p className="text-sm text-muted-foreground">El bot todavía no vio ningún chat. Escribí /start@NombreDelBot en el grupo y volvé a buscar.</p>}
        {chats && chats.length > 0 && (
          <ul className="divide-y rounded border">
            {chats.map(c => (
              <li key={c.id} className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate min-w-0">{c.nombre}</span>
                    <Badge variant="secondary" className="shrink-0">{TG_TIPO[c.tipo]}</Badge>
                  </div>
                  <code className="text-xs text-muted-foreground break-all">{c.id}</code>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setChatId(String(c.id))}>Usar este</Button>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
          <li>Creá el bot con @BotFather (<code>/newbot</code>) y copiá el token.</li>
          <li>Agregá el bot al grupo, o escribile un mensaje.</li>
          <li>Sacá el chat ID: abrí <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> y buscá <code>"chat":{'{"id":…}'}</code>.</li>
        </ol>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={testing || saving} onClick={probar}>
            {testing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
            Mandar un aviso de prueba
          </Button>
          <Button size="sm" disabled={saving || !!err} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
      <RepeticionCard />
    </div>
  )
}

// ─── Reporte diario: hora de envío ────────────────────────────────────
type DailyReportCfg = { time: string; fromEnv: boolean; enabled: boolean; nextRunAt: string | null }

function DailyReportCard() {
  const [info, setInfo] = useState<DailyReportCfg | null>(null)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (MODE === 'mock') { const d = { time: '06:00', fromEnv: true, enabled: true, nextRunAt: null }; setInfo(d); setTime(d.time); return }
    authFetch(`${API_BASE}/settings/daily-report`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: DailyReportCfg) => { setInfo(d); setTime(d.time) })
      .catch((e: any) => toast.error(`No se pudo leer la hora del reporte: ${e.message}`))
  }, [])

  async function save() {
    if (!/^\d{2}:\d{2}$/.test(time)) { toast.error('Hora inválida'); return }
    if (MODE === 'mock') { toast.success('Guardado (demo)'); setInfo(i => i && { ...i, time, fromEnv: false }); return }
    setSaving(true)
    try {
      const r = await authFetch(`${API_BASE}/settings/daily-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setInfo(d); setTime(d.time)
      toast.success(`El reporte diario sale a las ${d.time}`)
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  if (!info) return null
  const next = info.nextRunAt ? new Date(info.nextRunAt) : null

  return (
    <Card className="p-3 space-y-3 mt-4">
      <div>
        <div className="font-semibold text-sm">Reporte diario automático</div>
        <p className="text-sm text-muted-foreground">
          A esta hora se genera el PDF del día anterior y se manda por correo (a los destinatarios de arriba) y/o Telegram, según lo elegido en Más → Reporte diario.
          También es el cierre del día para cargar lluvia y altura del río.
        </p>
      </div>
      {!info.enabled ? (
        <p className="text-sm text-yellow-600 dark:text-yellow-400">El envío automático está deshabilitado en el servidor (DAILY_REPORT_ENABLED=false).</p>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label>Hora de envío</Label>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-32" />
          </div>
          <Button size="sm" disabled={saving || time === info.time} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
          {next && (
            <span className="text-xs text-muted-foreground pb-2">
              Próximo envío: {next.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: ZONA })}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}



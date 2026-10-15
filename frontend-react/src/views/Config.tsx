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
import { Plus, Trash2, Pencil, Save, X, ChevronRight, RotateCcw, ScanSearch, Loader2, Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'
import BrandingTab from './BrandingTab'
import ConexionTab from './ConexionTab'
import ReplicasTab from './ReplicasTab'
import { useServerStore } from '../store/server'
import { ZONA } from '../lib/camaras'

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
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList>
        <TabsTrigger value="users">Usuarios</TabsTrigger>
        <TabsTrigger value="smtp">Correo</TabsTrigger>
        <TabsTrigger value="camaras">Cámaras</TabsTrigger>
        {superadmin && <TabsTrigger value="brand">Marca</TabsTrigger>}
        {superadmin && <TabsTrigger value="conexion">Conexión</TabsTrigger>}
        {superadmin && !replica && <TabsTrigger value="replicas">Réplicas</TabsTrigger>}
      </TabsList>

      {replica && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
          Servidor réplica: la configuración se sincroniza desde planta y es solo lectura.
          Usuarios, correo y marca son de este servidor.
        </div>
      )}
      {/* fieldset disabled deshabilita inputs/botones (incl. Switch/Select de Radix, que son <button>) */}
      <TabsContent value="users"><UsersTab /></TabsContent>
      <TabsContent value="smtp"><SmtpTab /></TabsContent>
      <TabsContent value="camaras"><CamarasTab key={JSON.stringify(store.config?.camaras ?? null)} /></TabsContent>
      {superadmin && <TabsContent value="brand"><BrandingTab /></TabsContent>}
      {superadmin && <TabsContent value="conexion"><ConexionTab /></TabsContent>}
      {superadmin && !replica && <TabsContent value="replicas"><ReplicasTab /></TabsContent>}
    </Tabs>
  )
}

// ─── Usuarios ─────────────────────────────────────────────────────────
type UserInfo = { user: string; role: Role; hasPassword: boolean }
type UserForm = { original: string | null; user: string; role: Role; pw: string; pw2: string }

const ROLE_HELP: Record<string, string> = {
  superadmin: 'Todo, más Marca, Conexión y Réplicas',
  admin: 'Todo, incluida Configuración y usuarios',
  operador: 'Solo lectura: dashboards, tendencias y reportes',
}

function UsersTab() {
  const me = useAuthStore(s => s.user)
  const myRole = useAuthStore(s => s.role)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<UserForm | null>(null)
  const [saving, setSaving] = useState(false)
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

  async function call(method: string, path: string, body?: unknown) {
    const r = await authFetch(`${API_BASE}/settings/users${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
    return data
  }

  async function load() {
    setLoading(true)
    try {
      if (MODE === 'mock') {
        setUsers([
          { user: 'superadmin', role: 'superadmin', hasPassword: true },
          { user: 'admin', role: 'admin', hasPassword: true },
          { user: 'operador', role: 'operador', hasPassword: true },
        ])
      } else {
        setUsers((await call('GET', '')).users || [])
      }
    } catch (e: any) { toast.error(`No se pudieron cargar los usuarios: ${e.message}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const canEdit = (u: UserInfo) => u.role !== 'superadmin' || myRole === 'superadmin'
  const canDelete = (u: UserInfo) => u.role !== 'superadmin' && !same(u.user, me)

  async function save() {
    if (!form) return
    const creating = form.original === null
    if (!form.user.trim()) { toast.error('Falta el nombre de usuario'); return }
    if (creating && !form.pw) { toast.error('Falta la contraseña'); return }
    if (form.pw !== form.pw2) { toast.error('Las contraseñas no coinciden'); return }
    if (MODE === 'mock') {
      setUsers(us => creating ? [...us, { user: form.user.trim(), role: form.role, hasPassword: true }]
        : us.map(u => u.user === form.original ? { ...u, user: form.user.trim(), role: form.role } : u))
      toast.success('Guardado (demo)'); setForm(null); return
    }
    setSaving(true)
    try {
      const body: any = { user: form.user.trim(), role: form.role }
      if (form.pw) body.password = form.pw
      const data = creating ? await call('POST', '', body)
        : await call('PUT', `/${encodeURIComponent(form.original!)}`, body)
      setUsers(data.users || [])
      // Si me renombré, la sesión sigue con el nombre nuevo
      if (!creating && same(form.original!, me) && data.me) useAuthStore.getState().setIdentity(data.me, myRole)
      toast.success(creating ? `Usuario ${body.user} creado` : `Usuario ${body.user} actualizado`)
      setForm(null)
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  async function remove(u: UserInfo) {
    if (!confirm(`¿Eliminar el usuario ${u.user}? Se cierran sus sesiones abiertas.`)) return
    if (MODE === 'mock') { setUsers(us => us.filter(x => x.user !== u.user)); return }
    try {
      setUsers((await call('DELETE', `/${encodeURIComponent(u.user)}`)).users || [])
      toast.success(`Usuario ${u.user} eliminado`)
    } catch (e: any) { toast.error(`No se pudo eliminar: ${e.message}`) }
  }

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Cargando usuarios…</div>

  const editingSelf = !!form && form.original !== null && same(form.original, me)
  const editingSuper = !!form && form.role === 'superadmin'

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="text-sm text-muted-foreground flex-1 space-y-0.5">
          {(['superadmin', 'admin', 'operador'] as const).map(r => (
            <div key={r}><strong className="text-foreground">{ROLE_LABEL[r]}</strong>: {ROLE_HELP[r]}.</div>
          ))}
        </div>
        <Button size="sm" onClick={() => setForm({ original: null, user: '', role: 'operador', pw: '', pw2: '' })}>
          <Plus className="h-4 w-4" />Nuevo usuario
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Usuario</TableHead><TableHead>Rol</TableHead><TableHead>Contraseña</TableHead><TableHead className="w-24" /></TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.user}>
                <TableCell className="font-medium">
                  {u.user}{same(u.user, me) && <span className="ml-1.5 text-xs text-muted-foreground">(vos)</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={u.role === 'operador' ? 'secondary' : 'default'} className="uppercase">{ROLE_LABEL[u.role]}</Badge>
                    {u.role === 'superadmin' && <span title="No se puede eliminar; solo lo modifica el superadmin"><Lock className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                  </div>
                </TableCell>
                <TableCell>
                  {u.hasPassword ? <span className="text-xs text-muted-foreground">configurada</span>
                    : <span className="text-xs text-yellow-600 dark:text-yellow-400">sin contraseña</span>}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {canEdit(u) && (
                    <Button variant="ghost" size="icon" title="Editar"
                      onClick={() => setForm({ original: u.user, user: u.user, role: u.role, pw: '', pw2: '' })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete(u) && (
                    <Button variant="ghost" size="icon" title="Eliminar" onClick={() => remove(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {users.some(u => u.role === 'superadmin' && !u.hasPassword) && (
        <p className="text-xs text-muted-foreground">
          El superadmin se configura desde la consola del servidor: <code>docker exec -it frio-api node src/cli/superadmin.js</code>
        </p>
      )}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.original === null ? 'Nuevo usuario' : `Editar ${form?.original}`}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Usuario</Label>
                <Input value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} autoComplete="off" placeholder="p.ej. jperez" />
              </div>
              <div>
                <Label>Rol</Label>
                {editingSuper || editingSelf ? (
                  <div className="text-sm py-2">{ROLE_LABEL[form.role]} <span className="text-xs text-muted-foreground">
                    ({editingSuper ? 'el superadmin no cambia de rol' : 'no podés cambiar tu propio rol'})</span></div>
                ) : (
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operador">Operador — solo lectura</SelectItem>
                      <SelectItem value="admin">Admin — incluye Configuración</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>{form.original === null ? 'Contraseña' : 'Nueva contraseña'}</Label>
                  <Input type="password" value={form.pw} onChange={e => setForm({ ...form, pw: e.target.value })}
                    placeholder={form.original === null ? 'mínimo 4 caracteres' : '(sin cambios)'} autoComplete="new-password" />
                </div>
                <div><Label>Repetir contraseña</Label>
                  <Input type="password" value={form.pw2} onChange={e => setForm({ ...form, pw2: e.target.value })} autoComplete="new-password" />
                </div>
              </div>
              {form.original !== null && !editingSelf && (
                <p className="text-xs text-muted-foreground">Si cambiás el nombre, el rol o la contraseña, se cierran las sesiones abiertas de ese usuario.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              {form?.original === null ? 'Crear' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      <Card className="p-4 space-y-3">
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
    <Card className="p-4 space-y-3 mt-4">
      <div>
        <div className="font-semibold text-sm">Reporte diario automático</div>
        <p className="text-sm text-muted-foreground">
          A esta hora se genera el PDF del día anterior y se envía a los destinatarios de arriba.
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



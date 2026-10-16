import { useState } from 'react'
import { Button } from '../components/ui/button'
import { apiJson } from '../lib/api'
import { useAuthStore } from '../store/auth'

function Canal({ canal, titulo, boton, admin }: { canal: 'telegram' | 'mail'; titulo: string; boton: string; admin: boolean }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function probar() {
    setBusy(true); setMsg('')
    try {
      const r = await apiJson<{ ok: boolean; error?: string }>('/avisos/prueba', { method: 'POST', body: JSON.stringify({ canal }) })
      setMsg(r.ok ? `✅ Aviso enviado. Fijate en ${titulo}.` : `No se pudo: ${r.error ?? 'error desconocido'}`)
    } catch (e) {
      setMsg(`No se pudo: ${e instanceof Error ? e.message : 'error'}`)
    } finally { setBusy(false) }
  }
  return (
    <div className="rounded-2xl bg-white dark:bg-card shadow-sm p-4 space-y-2">
      <div className="font-semibold">{titulo}</div>
      {admin && <Button onClick={probar} disabled={busy}>{busy ? 'Enviando…' : boton}</Button>}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}

export default function Avisos() {
  const admin = useAuthStore(s => s.isAdmin())
  return (
    <div className="space-y-3 max-w-md">
      <h1 className="text-xl font-semibold">Avisos</h1>
      <Canal canal="telegram" titulo="Telegram" boton="Mandar un aviso de prueba" admin={admin} />
      <Canal canal="mail" titulo="Mail" boton="Mandar un mail de prueba" admin={admin} />
      <div className="rounded-2xl bg-white dark:bg-card shadow-sm p-4 space-y-1">
        <div className="font-semibold">¿Qué avisa?</div>
        <p className="text-sm text-muted-foreground">Alarmas del PLC · PLC sin comunicación más de 2 min · reloj del PLC desviado. Repite cada 1 hora si sigue, y avisa cuando se resuelve.</p>
      </div>
    </div>
  )
}

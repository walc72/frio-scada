import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { useBrandingStore } from '../store/branding'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function Login() {
  const login = useAuthStore(s => s.login)
  const logoUrl = useBrandingStore(s => s.logoUrl)
  const brandFooter = useBrandingStore(s => s.footer)
  const brandName = useBrandingStore(s => s.name)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const userRef = useRef<HTMLInputElement>(null)

  useEffect(() => { userRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const res = await login(user, pass)
    setLoading(false)
    if (!res.ok) {
      setError(res.error || 'No se pudo iniciar sesión')
      setShake(true)
      setPass('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 gap-6 bg-background">
      <div className={`w-full max-w-[420px] ${shake ? 'animate-shake' : ''}`}>
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <img src={logoUrl} alt={brandName} className="h-16 w-auto max-w-[280px] object-contain" />
          <h1 className="text-3xl font-semibold tracking-tight">Cámaras de frío</h1>
          <p className="text-base text-muted-foreground">Unifrisa</p>
        </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm">Usuario</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="username"
                  ref={userRef}
                  value={user}
                  onChange={e => { setUser(e.target.value); setError('') }}
                  autoComplete="username"
                  className={`h-10 text-base pl-10 ${error ? 'border-destructive' : ''}`}
                  placeholder="usuario"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError('') }}
                  autoComplete="current-password"
                  className={`h-10 text-base pl-10 pr-10 ${error ? 'border-destructive' : ''}`}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showPass ? 'Ocultar' : 'Mostrar'}>
                  {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}

            <Button type="submit" className="w-full h-auto py-2.5 text-base" disabled={!user || !pass || loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando…</> : 'Entrar'}
            </Button>
          </form>
        </div>

        {brandFooter && <p className="text-xs text-muted-foreground">
          Powered by <strong>{brandFooter}</strong>
        </p>}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.45s ease; }
      `}</style>
    </div>
  )
}

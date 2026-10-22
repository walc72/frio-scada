import { lazy, Suspense, useEffect, Component, type ReactNode, type ErrorInfo } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Sun, Moon, LogOut, ShieldCheck, Eye, Lock, Wifi, WifiOff } from 'lucide-react'
import { useTheme } from './lib/theme'
import { Button } from './components/ui/button'
import { RUTAS_VIEJAS } from './lib/rutas'
import Navegacion from './components/Navegacion'
import { useLiveStore } from './store/live'
import { useConfigStore } from './store/config'
import { useAuthStore, isAdminRole, ROLE_LABEL } from './store/auth'
import { useBrandingStore } from './store/branding'
import { useServerStore } from './store/server'
import ReplicaBadge from './components/ReplicaBadge'
import General from './views/General'
import Camara from './views/Camara'
import Historial from './views/Historial'
import Mas from './views/Mas'
import Avisos from './views/Avisos'
import Reportes from './views/Reportes'
import Sistema from './views/Sistema'
import Login from './views/Login'

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('[RouteErrorBoundary]', e, info) }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive py-16">
          <div className="text-lg font-bold">Error al cargar la vista</div>
          <pre className="text-xs bg-muted p-3 rounded max-w-xl overflow-auto">{msg}</pre>
          <button className="text-xs underline" onClick={() => this.setState({ error: null })}>Reintentar</button>
        </div>
      )
    }
    return this.props.children
  }
}

const Config        = lazy(() => import('./views/Config'))
const Usuarios      = lazy(() => import('./views/Usuarios'))
const Programacion  = lazy(() => import('./views/Programacion'))

// Vista para operador que intenta entrar a una ruta solo-admin
function NoAutorizado() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
      <Lock className="h-10 w-10 opacity-40" />
      <div className="text-lg font-semibold">Acceso restringido</div>
      <p className="text-sm">Esta sección solo está disponible para el rol administrador.</p>
    </div>
  )
}

export default function App() {
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()  // el error de una vista no queda pegado al navegar a otra
  const connect = useLiveStore(s => s.connect)
  const disconnect = useLiveStore(s => s.disconnect)
  const connected = useLiveStore(s => s.connected)
  const loadConfig = useConfigStore(s => s.load)
  const configLoaded = useConfigStore(s => s.config)
  const authed = useAuthStore(s => s.authed)
  const logout = useAuthStore(s => s.logout)
  const role = useAuthStore(s => s.role)
  const user = useAuthStore(s => s.user)
  const isAdmin = isAdminRole(role)
  const logoUrl = useBrandingStore(s => s.logoUrl)
  const brandName = useBrandingStore(s => s.name)
  const brandFooter = useBrandingStore(s => s.footer)

  // Marca pública: se carga una vez, antes del login
  useEffect(() => { useBrandingStore.getState().load() }, [])

  const replica = useServerStore(s => s.replica)
  useEffect(() => { if (authed) useServerStore.getState().load() }, [authed])

  // Conectar MQTT y cargar config solo con sesion activa (issues #3/#4 de la
  // revision): antes corria una vez pre-login (config daba 401 y nunca se
  // recargaba) y el websocket quedaba abierto incluso deslogueado.
  useEffect(() => {
    if (!authed) return
    connect()
    if (!configLoaded) loadConfig()
    return () => disconnect()
  }, [authed])

  if (!authed) return <Login />

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Fixed header */}
      <header className="h-[64px] border-b px-4 flex items-center gap-3 bg-card shrink-0 z-20">
        <img src={logoUrl} alt={brandName} className="h-[48px] w-auto max-w-[220px] object-contain" />
        <div className="text-lg font-bold border-l border-border pl-3 leading-none">
          Cámaras de frío
        </div>
        <div className="ml-auto flex items-center gap-2">
          {replica && <ReplicaBadge />}
          {/* Conexión */}
          {connected ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /><Wifi className="h-3 w-3" />Conectado
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium animate-pulse">
              <WifiOff className="h-3 w-3" />Reconectando
            </div>
          )}
          {/* Usuario + rol */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border text-xs font-medium" title={`Sesión: ${user} (${role})`}>
            {isAdmin ? <ShieldCheck className="h-3.5 w-3.5 text-primary" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-foreground">{user}</span>
            <span className="text-muted-foreground">· {ROLE_LABEL[role] || 'Operador'}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={logout} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <Navegacion />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-3 sm:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 overflow-auto">
            <div className="w-full">
            <RouteErrorBoundary key={pathname}>
            <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Cargando...</div>}>
              <Routes>
                <Route path="/" element={<General />} />
                <Route path="/camara/:c" element={<Camara />} />
                {Object.entries(RUTAS_VIEJAS).map(([de, a]) => <Route key={de} path={de} element={<Navigate to={a} replace />} />)}
                <Route path="/historial/:pestana?" element={<Historial />} />
                <Route path="/alarmas" element={<Historial fija="alarmas" />} />
                <Route path="/eventos" element={<Historial fija="eventos" />} />
                <Route path="/mas" element={<Mas />} />
                <Route path="/avisos" element={<Avisos />} />
                <Route path="/reportes" element={<Reportes />} />
                <Route path="/sistema" element={<Sistema />} />
                <Route path="/usuarios" element={isAdmin ? <Usuarios /> : <NoAutorizado />} />
                <Route path="/programacion" element={isAdmin ? <Programacion /> : <NoAutorizado />} />
                <Route path="/config" element={isAdmin ? <Config /> : <NoAutorizado />} />
              </Routes>
            </Suspense>
            </RouteErrorBoundary>
            </div>
          </main>
          {brandFooter && <footer className="hidden md:flex h-8 border-t px-6 flex items-center justify-center text-xs text-muted-foreground bg-card shrink-0">
            Powered By <strong className="ml-1">{brandFooter}</strong>
          </footer>}
        </div>
      </div>
    </div>
  )
}

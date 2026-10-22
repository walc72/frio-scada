import { NavLink, useLocation } from 'react-router-dom'
import { IconoNav } from './Icono'
import { cn } from '../lib/utils'

const ITEMS = [
  { to: '/', label: 'Inicio', icono: 'inicio', activo: (p: string) => p === '/' },
  { to: '/camara/C4', label: 'Cámaras', icono: 'camaras', activo: (p: string) => p.startsWith('/camara') },
  { to: '/alarmas', label: 'Alarmas', icono: 'alarmas', activo: (p: string) => p.startsWith('/alarmas') },
  { to: '/eventos', label: 'Eventos', icono: 'eventos', activo: (p: string) => p.startsWith('/eventos') },
  { to: '/historial', label: 'Historial', icono: 'historial', activo: (p: string) => p.startsWith('/historial') },
  { to: '/mas', label: 'Más', icono: 'mas', activo: (p: string) => ['/mas', '/reportes', '/avisos', '/sistema', '/usuarios', '/config'].some(r => p.startsWith(r)) },
] as const

// Barra fija abajo en el celular; menú a la izquierda desde 768 px. compacto (botón ☰): solo íconos.
export default function Navegacion({ compacto = false }: { compacto?: boolean }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label="Principal"
      className={`fixed bottom-0 inset-x-0 z-30 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] flex border-t bg-card md:static md:pb-3 md:inset-auto md:h-auto ${compacto ? 'md:w-[68px]' : 'md:w-[220px]'} md:shrink-0 md:transition-[width] md:flex-col md:border-t-0 md:border-r md:p-3 md:gap-1`}>
      {ITEMS.map(i => {
        const on = i.activo(pathname)
        return (
          <NavLink key={i.to} to={i.to} data-tour={`nav-${i.icono}`} title={compacto ? i.label : undefined} aria-current={on ? 'page' : undefined}
            className={cn(
              'flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 toque md:px-3 md:py-2 md:rounded-md text-xs md:text-base font-medium transition-colors',
              on ? 'text-primary md:bg-primary md:text-primary-foreground' : 'text-muted-foreground hover:text-foreground md:hover:bg-accent'
            )}>
            <IconoNav nombre={i.icono} />
            <span className={compacto ? 'md:sr-only' : ''}>{i.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

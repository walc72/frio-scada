import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { ChevronRight } from 'lucide-react'

const ITEMS = [
  { to: '/reportes', label: 'Reporte diario', admin: false },
  { to: '/avisos', label: 'Avisos por Telegram y mail', admin: false },
  { to: '/programacion', label: 'Programación de descongelados', admin: true },
  { to: '/usuarios', label: 'Usuarios', admin: true },
  { to: '/sistema', label: 'Estado del sistema', admin: false },
  { to: '/config', label: 'Configuración avanzada', admin: true },
]

export default function Mas() {
  const isAdmin = useAuthStore(s => s.isAdmin())
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-xl font-semibold">Más</h1>
      <ul className="rounded-lg border bg-card divide-y">
        {ITEMS.filter(i => !i.admin || isAdmin).map(i => (
          <li key={i.to}>
            <Link to={i.to} className="toque flex items-center justify-between px-3 py-3 text-base">
              {i.label}<ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

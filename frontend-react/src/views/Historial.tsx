import { Link, Navigate, useParams } from 'react-router-dom'
import Descongelados from './Descongelados'
import Eventos from './Eventos'
import Compresores from './Compresores'
import { cn } from '../lib/utils'

const PESTANAS = [
  { id: 'descongelados', label: 'Descongelados', Vista: Descongelados },
  { id: 'avisos', label: 'Avisos', Vista: Eventos },
  { id: 'compresores', label: 'Compresores', Vista: Compresores },
]

export default function Historial() {
  const { pestana = 'descongelados' } = useParams()
  const actual = PESTANAS.find(p => p.id === pestana)
  if (!actual) return <Navigate to="/historial/descongelados" replace />
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {PESTANAS.map(p => (
          <Link key={p.id} to={`/historial/${p.id}`}
            className={cn('px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border',
              p.id === actual.id ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}>
            {p.label}
          </Link>
        ))}
      </div>
      <actual.Vista />
    </div>
  )
}

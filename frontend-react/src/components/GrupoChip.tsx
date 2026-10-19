import { colorEstadoGrupo } from '../lib/estadoGrupo'

export default function GrupoChip({ n, estado, vencido }: { n: number; estado: string; vencido?: boolean }) {
  const c = colorEstadoGrupo(estado)
  return (
    <div title={`G${n}: ${estado || 'sin dato'}`} className="rounded px-2 py-1.5 text-center leading-tight"
      style={vencido ? { background: '#9A9A9A55' } : { background: c.fondo, color: c.texto }}>
      <div className="text-xs font-bold">G{n}</div>
      <div className="text-xs truncate">{estado || '—'}</div>
    </div>
  )
}

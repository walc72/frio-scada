interface Props {
  uid: string
  panelId: number
  vars?: Record<string, string>
  desde?: string   // 'now-24h' o epoch ms
  hasta?: string
  title?: string
  className?: string
}

// Panel de Grafana embebido. Same-origin /grafana/ (nginx exige sesión vía cookie frio_token).
export default function PanelGrafana({ uid, panelId, vars = {}, desde = 'now-24h', hasta = 'now', title = 'Gráfico', className = 'w-full h-80 rounded border' }: Props) {
  const q = new URLSearchParams({ orgId: '1', panelId: String(panelId), from: desde, to: hasta, theme: 'light', kiosk: '' })
  for (const [k, v] of Object.entries(vars)) q.set(`var-${k}`, v)
  return <iframe title={title} className={className} src={`/grafana/d-solo/${encodeURIComponent(uid)}/_?${q.toString()}`} />
}

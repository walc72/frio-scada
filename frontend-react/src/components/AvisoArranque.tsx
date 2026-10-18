import { useEffect } from 'react'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { useMando, usePermiso } from './Confirmar'
import { useCamarasStore } from '../store/camaras'
import { useAuthStore } from '../store/auth'

// El PLC arrancó con equipos en manual y espera una respuesta (ventana del arranque). Comando 7.
export default function AvisoArranque() {
  const pendiente = useCamarasStore(s => Number(s.estado?.arranque_con_manual_pendiente) === 1)
  const rol = useAuthStore(s => s.role)
  const permiso = usePermiso(7)
  const { pedir, enviando, dialogo, olvidarPregunta } = useMando()
  // La ventana se cerró: no dejar una pregunta vieja para el próximo arranque (el diálogo sigue montado para mostrar el resultado)
  useEffect(() => { if (!pendiente) olvidarPregunta() })
  if (!pendiente) return <>{dialogo}</>
  const mira = rol === 'operador' || rol === ''
  return (
    <Card className="space-y-3 rounded-xl border-amber-500 bg-amber-500/10 p-3" role="alert">
      <div className="font-semibold">El PLC arrancó con equipos en manual</div>
      <div className="text-sm">Está esperando que elijas qué hacer con ellos.</div>
      {mira ? <div className="text-sm text-muted-foreground">Tu usuario solo puede mirar: la respuesta se da en el panel o con un usuario que pueda operar.</div> : <>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <Button className="h-auto py-2 whitespace-normal" disabled={!permiso.ok || enviando} onClick={() => pedir({ comando: 7, valor: 1 })}>Mantener en manual</Button>
          <Button variant="outline" className="h-auto py-2 whitespace-normal" disabled={!permiso.ok || enviando} onClick={() => pedir({ comando: 7, valor: 2 })}>Pasar a automático</Button>
        </div>
        {!permiso.ok && <div className="text-sm text-amber-700 dark:text-amber-400">{permiso.motivo}</div>}
      </>}
      {dialogo}
    </Card>
  )
}

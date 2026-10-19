import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import EditorProgramacion, { type EstadoEditor } from './EditorProgramacion'
import { nombreCamara } from '../lib/camaras'

// Popup con el editor de la programación de una sola cámara.
export default function AjustesCamara({ cam, onCerrar }: { cam: string; onCerrar: () => void }) {
  const [e, setE] = useState<EstadoEditor>({ sucio: false, corriendo: false })
  const est = useRef(e)
  est.current = e
  const pedirCerrar = () => {
    if (est.current.corriendo) return   // guardando: no se puede cerrar
    if (est.current.sucio && !confirm('¿Descartar los cambios sin guardar?')) return
    onCerrar()
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) pedirCerrar() }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 p-0"
        onInteractOutside={e => { if (est.current.corriendo) e.preventDefault() }}
        onEscapeKeyDown={e => { if (est.current.corriendo) e.preventDefault() }}>
        <DialogHeader className="p-4 pr-12"><DialogTitle>Ajustes de {nombreCamara(cam)}</DialogTitle></DialogHeader>
        <EditorProgramacion camaraFija={cam} enDialogo onEstado={setE} />
      </DialogContent>
    </Dialog>
  )
}

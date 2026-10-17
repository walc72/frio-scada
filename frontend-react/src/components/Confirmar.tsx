import { useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { apiJson } from '../lib/api'
import { enviarMando, textoResultado, fraseConfirmacion, puedeMandar, type Pedido } from '../lib/mando'
import { useCamarasStore } from '../store/camaras'
import { useAuthStore } from '../store/auth'
import { estaVencido } from '../lib/estadoGrupo'
import { useNow } from '../lib/useNow'

// Vuelve a leer el estado vivo (sin cambios optimistas); el MQTT sigue llegando aparte.
export async function refrescarEstado() {
  try {
    const m = await apiJson('/camaras/estado')
    if (m && Object.keys(m).length) useCamarasStore.getState().setEstado(m, true)   // retenido=true: si es viejo no cuenta como fresco
  } catch { /* el MQTT lo trae igual */ }
}
export const refrescarLuego = () => { refrescarEstado(); setTimeout(refrescarEstado, 2500) }

// Diálogo de confirmación: pregunta, "Enviando…" mientras espera (hasta ~15 s) y deja el resultado a la vista.
export function Confirmar({ abierto, frase, enviando, resultado, detalle, onConfirmar, onCerrar }: {
  abierto: boolean; frase: string; enviando: boolean; resultado: ReactNode | null; detalle?: ReactNode; onConfirmar: () => void; onCerrar: () => void
}) {
  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !enviando) onCerrar() }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader><DialogTitle className="text-lg leading-snug">{frase}</DialogTitle></DialogHeader>
        {detalle}
        {resultado != null && <div role="status" className="text-base">{resultado}</div>}
        <DialogFooter className="gap-2">
          {resultado == null
            ? <>
                <Button variant="outline" className="toque h-auto py-2 text-base" disabled={enviando} onClick={onCerrar}>Cancelar</Button>
                <Button className="toque h-auto py-2 text-base" disabled={enviando} onClick={onConfirmar}>{enviando ? 'Enviando…' : 'Sí, hacerlo'}</Button>
              </>
            : <Button className="toque h-auto py-2 text-base" disabled={enviando} onClick={onCerrar}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Un pedido por vez: pedir(...) abre la confirmación; el diálogo (para renderizar) cubre pregunta, envío y resultado.
export function useMando() {
  const [p, setP] = useState<Pedido | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [res, setRes] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)   // aviso corto de "hecho": no hace falta otro diálogo
  const vuelo = useRef(false)
  const cerrar = () => { setP(null); setRes(null) }
  const confirmar = async () => {
    if (!p || vuelo.current) return
    vuelo.current = true
    setEnviando(true)
    try {
      const r = await enviarMando(p)
      if (r.resultado === 1) {
        setListo(`Listo: ${fraseConfirmacion(p.comando, p.camara ?? '', p.grupo, p.horario, p.valor).replace(/^¿|\?$/g, '')}`)
        setTimeout(() => setListo(null), 4000)
        setP(null)
      } else setRes(textoResultado(r))   // si no se hizo (o no se sabe) el diálogo queda abierto con el motivo
    } finally {
      vuelo.current = false
      setEnviando(false)
    }
    refrescarLuego()
  }
  const dialogo = (
    <>
      <Confirmar abierto={!!p} frase={p ? fraseConfirmacion(p.comando, p.camara ?? '', p.grupo, p.horario, p.valor) : ''}
        enviando={enviando} resultado={res} onConfirmar={confirmar} onCerrar={cerrar} />
      {listo && <div role="status" className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md rounded-xl bg-green-600 px-4 py-3 text-center text-base font-medium text-white shadow-lg">✓ {listo}</div>}
    </>
  )
  // Descarta una pregunta vieja sin tocar un pedido en vuelo ni un resultado que el usuario todavía no leyó
  const olvidarPregunta = () => { if (!vuelo.current && res === null) setP(null) }
  return { pedir: (x: Pedido) => { if (!vuelo.current) { setRes(null); setP(x) } }, enviando, dialogo, olvidarPregunta }
}

// ¿Puede este usuario mandar este comando ahora? (dato fresco, llave del panel, rol)
export function usePermiso(comando: number) {
  const estado = useCamarasStore(s => s.estado)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const rol = useAuthStore(s => s.role)
  const ahora = useNow(1000)
  return puedeMandar(estado, !incompatible && !estaVencido(recibidoEn, ahora), rol, comando)
}

import Semaforo from '../components/Semaforo'
import TarjetaCamara from '../components/TarjetaCamara'
import AvisoArranque from '../components/AvisoArranque'
import ResumenHoy from '../components/ResumenHoy'
import { useEffect } from 'react'
import { CAMARAS } from '../lib/camaras'
import { useAuthStore } from '../store/auth'
import { iniciarTutorial, tutorialVisto } from '../lib/tutorial'

export default function General() {
  const user = useAuthStore(s => s.user)
  const admin = useAuthStore(s => s.isAdmin())
  useEffect(() => { if (!tutorialVisto('inicio', user)) iniciarTutorial('inicio', user, admin) }, [user, admin])
  return (
    <div className="space-y-3">
      <AvisoArranque />
      <div data-tour="resumen"><ResumenHoy /></div>
      <div data-tour="semaforo"><Semaforo /></div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {CAMARAS.map((c, i) => <div key={c} data-tour={i === 0 ? 'camara' : undefined}><TarjetaCamara cam={c} /></div>)}
      </div>
    </div>
  )
}

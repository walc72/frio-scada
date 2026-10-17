import Semaforo from '../components/Semaforo'
import TarjetaCamara from '../components/TarjetaCamara'
import AvisoArranque from '../components/AvisoArranque'
import ResumenHoy from '../components/ResumenHoy'
import { CAMARAS } from '../lib/camaras'

export default function General() {
  return (
    <div className="space-y-4">
      <AvisoArranque />
      <Semaforo />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {CAMARAS.map(c => <TarjetaCamara key={c} cam={c} />)}
      </div>
      <ResumenHoy />
    </div>
  )
}

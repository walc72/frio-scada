import TarjetaCamara from '../components/TarjetaCamara'
import { CAMARAS } from '../lib/camaras'

export default function General() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {CAMARAS.map(c => <TarjetaCamara key={c} cam={c} />)}
    </div>
  )
}

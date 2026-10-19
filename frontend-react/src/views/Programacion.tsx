import { useSearchParams } from 'react-router-dom'
import EditorProgramacion from '../components/EditorProgramacion'

// ?camara=C5 abre esa cámara
export default function Programacion() {
  const [params] = useSearchParams()
  return <EditorProgramacion inicial={params.get('camara') ?? undefined} />
}

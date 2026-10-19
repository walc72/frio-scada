import { useEffect, useState } from 'react'
import { useBrandingStore, DEFAULT_BRANDING } from '../store/branding'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Loader2, Save, RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'

const MAX_LOGO_BYTES = 1024 * 1024
const MAX_FAVICON_BYTES = 256 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

export default function BrandingTab() {
  const b = useBrandingStore()
  const [name, setName] = useState(b.name)
  const [subtitle, setSubtitle] = useState(b.subtitle)
  const [footer, setFooter] = useState(b.footer)
  const [logo, setLogo] = useState<string | null>(null) // data URL pendiente de guardar
  const [favicon, setFavicon] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setName(b.name); setSubtitle(b.subtitle); setFooter(b.footer) }, [b.name, b.subtitle, b.footer])

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) { toast.error('Solo PNG o JPG'); return }
    if (f.size > MAX_LOGO_BYTES) { toast.error('El logo supera 1 MB'); return }
    setLogo(await readAsDataUrl(f))
  }

  async function pickFavicon(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) { toast.error('Solo PNG o JPG'); return }
    if (f.size > MAX_FAVICON_BYTES) { toast.error('El favicon supera 256 KB'); return }
    setFavicon(await readAsDataUrl(f))
  }

  async function save() {
    if (!name.trim()) { toast.error('El nombre no puede quedar vacío'); return }
    setSaving(true)
    const r = await b.save({ name: name.trim(), subtitle: subtitle.trim(), footer: footer.trim(), ...(logo ? { logo } : {}), ...(favicon ? { favicon } : {}) })
    setSaving(false)
    if (r.ok) { setLogo(null); setFavicon(null); toast.success('Marca guardada') }
    else toast.error(`No se pudo guardar: ${r.error}`)
  }

  async function restore() {
    if (!confirm('¿Restaurar nombre, subtítulo, logo y favicon por defecto?')) return
    setSaving(true)
    const r = await b.reset()
    setSaving(false)
    if (r.ok) { setLogo(null); setFavicon(null); toast.success('Marca restaurada') }
    else toast.error(`No se pudo restaurar: ${r.error}`)
  }

  return (
    <div className="max-w-2xl">
      <Card className="p-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          Logo, ícono de la pestaña (favicon) y textos del login, del encabezado, del pie de página y de los reportes PDF. Solo afecta a este servidor.
        </p>
        <div>
          <Label>Nombre</Label>
          <Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={DEFAULT_BRANDING.name} />
        </div>
        <div>
          <Label>Subtítulo del login</Label>
          <Input value={subtitle} maxLength={200} onChange={e => setSubtitle(e.target.value)} placeholder="(vacío = sin subtítulo)" />
        </div>
        <div>
          <Label>Pie de página ("Powered by …")</Label>
          <Input value={footer} maxLength={80} onChange={e => setFooter(e.target.value)} placeholder="(vacío = sin pie de página)" />
        </div>
        <div className="space-y-2">
          <Label>Logo (PNG o JPG, máx. 1 MB)</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-white rounded-xl px-4 py-3 border">
              <img src={logo || b.logoUrl} alt="Logo" className="h-10 w-auto max-w-[240px] object-contain block" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer border border-input rounded-md px-3 h-9 hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />Elegir archivo
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={pick} />
            </label>
            {logo && <span className="text-xs text-muted-foreground">sin guardar</span>}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Ícono de la pestaña (favicon) (PNG o JPG, máx. 256 KB)</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <img src={favicon || b.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain rounded border bg-white" />
            <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer border border-input rounded-md px-3 h-9 hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />Elegir archivo
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={pickFavicon} />
            </label>
            {favicon && <span className="text-xs text-muted-foreground">sin guardar</span>}
          </div>
          <p className="text-xs text-muted-foreground">Cuadrado, idealmente 192×192 o 512×512 px</p>
        </div>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={saving} onClick={restore}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar por defecto
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  )
}

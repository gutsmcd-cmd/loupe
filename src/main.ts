import './style.css'
import { askPersist, load, save } from './db'
import { dict, type Dict, type Lang } from './i18n'

const DB = 'loupe'
const CSS_MAX = 6 // digital zoom when the camera has no zoom of its own
const FROZEN_EXTRA = 4 // how much further you can zoom into a frozen frame
const CONTRAST = [1, 1.9, 1.9] as const

type Range = { min: number; max: number; step: number }
type Caps = MediaTrackCapabilities & {
  zoom?: Range
  torch?: boolean
  focusMode?: string[]
}

let lang: Lang = 'ja'
let t: Dict = dict.ja
let view = 0 // 0 normal, 1 high contrast, 2 inverted

let stream: MediaStream | null = null
let track: MediaStreamTrack | null = null
let hw: Range | null = null // hardware zoom range, if any
let hasTorch = false
let torchOn = false
let started = false
let errorText = ''

let liveZoom = 1 // total zoom (hardware × css) while live
let frozen = false
let frozenBase = 1 // hardware zoom baked into the frozen frame
let frozenZoom = 1 // css zoom on the frozen frame
let tx = 0
let ty = 0

// ---------- DOM ----------
const app = document.querySelector<HTMLDivElement>('#app')!

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text) n.textContent = text
  return n
}

const stage = el('div', 'stage view-0')
const video = el('video', 'live')
video.muted = true
video.playsInline = true
video.setAttribute('playsinline', '')
video.autoplay = true
const still = el('canvas', 'still')
still.hidden = true
stage.append(video, still)

const top = el('header', 'top')
const title = el('h1', 'title')
const langBtn = el('button', 'pill lang')
langBtn.type = 'button'
top.append(title, langBtn)

const panel = el('div', 'panel')
panel.hidden = true
const zoomRow = el('label', 'zoomrow')
const zoomName = el('span', 'zname')
const zoomVal = el('span', 'zval')
const slider = el('input', 'slider')
slider.type = 'range'
zoomRow.append(zoomName, slider, zoomVal)
const hint = el('p', 'hint')
hint.hidden = true
const buttons = el('div', 'buttons')
const freezeBtn = el('button', 'big primary')
const viewBtn = el('button', 'big')
const torchBtn = el('button', 'big')
const saveBtn = el('button', 'big')
for (const b of [freezeBtn, viewBtn, torchBtn, saveBtn]) b.type = 'button'
torchBtn.hidden = true
saveBtn.hidden = true
buttons.append(freezeBtn, viewBtn, torchBtn, saveBtn)
panel.append(zoomRow, hint, buttons)

const cover = el('section', 'cover')
const coverTitle = el('h2', 'cover-title')
const coverLead = el('p', 'cover-lead')
const coverMsg = el('p', 'cover-msg')
const startBtn = el('button', 'big primary start')
startBtn.type = 'button'
const coverNote = el('p', 'cover-note')
cover.append(coverTitle, coverLead, coverMsg, startBtn, coverNote)

app.append(stage, top, panel, cover)

// ---------- text ----------
function renderText(): void {
  document.documentElement.lang = lang
  document.title = t.app
  title.textContent = t.app
  langBtn.textContent = t.toggle
  langBtn.lang = lang === 'ja' ? 'en' : 'ja'
  zoomName.textContent = t.zoom
  slider.setAttribute('aria-label', t.zoom)
  freezeBtn.textContent = frozen ? t.resume : t.freeze
  freezeBtn.setAttribute('aria-pressed', String(frozen))
  viewBtn.textContent = t.contrast[view]
  viewBtn.setAttribute('aria-label', `${t.contrastLabel}: ${t.contrast[view]}`)
  torchBtn.textContent = t.light
  torchBtn.setAttribute('aria-pressed', String(torchOn))
  saveBtn.textContent = t.save
  hint.textContent = t.frozenHint
  coverTitle.textContent = errorText ? t.deniedTitle : t.app
  coverLead.textContent = t.lead
  coverLead.hidden = !!errorText
  coverMsg.textContent = errorText ? (t[errorText as keyof Dict] as string) : ''
  coverMsg.hidden = !errorText
  startBtn.textContent = errorText ? t.retry : t.start
  coverNote.textContent = t.privacy
}

function renderState(): void {
  cover.hidden = started
  top.classList.toggle('light', !started)
  title.hidden = !started
  panel.hidden = !started
  still.hidden = !frozen
  video.hidden = frozen
  hint.hidden = !frozen || frozenZoom <= 1.01
  saveBtn.hidden = !frozen
  torchBtn.hidden = !hasTorch
  torchBtn.classList.toggle('on', torchOn)
  stage.className = `stage view-${view}`
  renderText()
}

// ---------- camera ----------
async function startCamera(): Promise<void> {
  errorText = ''
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    errorText = window.isSecureContext ? 'unknown' : 'insecure'
    renderState()
    return
  }
  try {
    stopCamera()
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
    track = stream.getVideoTracks()[0] ?? null
    video.srcObject = stream
    await video.play().catch(() => undefined)
    readCaps()
    started = true
    if (!frozen) setupSlider()
    void applyLiveZoom()
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') errorText = 'denied'
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') errorText = 'noCamera'
    else if (name === 'NotReadableError' || name === 'AbortError') errorText = 'busy'
    else errorText = 'unknown'
    started = false
  }
  renderState()
}

function stopCamera(): void {
  stream?.getTracks().forEach((tr) => tr.stop())
  stream = null
  track = null
  torchOn = false
}

function readCaps(): void {
  hw = null
  hasTorch = false
  if (!track || typeof track.getCapabilities !== 'function') return
  const caps = track.getCapabilities() as Caps
  if (caps.zoom && caps.zoom.max > 1) {
    hw = {
      min: Math.max(1, caps.zoom.min),
      max: Math.min(caps.zoom.max, 10),
      step: caps.zoom.step || 0.1,
    }
  }
  hasTorch = caps.torch === true
  if (caps.focusMode?.includes('continuous')) {
    void track
      .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
      .catch(() => undefined)
  }
}

function liveMax(): number {
  return hw ? Math.max(CSS_MAX, hw.max) : CSS_MAX
}

function setupSlider(): void {
  if (frozen) {
    slider.min = String(frozenBase)
    slider.max = String(Math.max(liveMax(), frozenBase * FROZEN_EXTRA))
    slider.step = '0.1'
    slider.value = String(frozenBase * frozenZoom)
  } else {
    slider.min = '1'
    slider.max = String(liveMax())
    slider.step = '0.1'
    liveZoom = Math.min(Math.max(liveZoom, 1), liveMax())
    slider.value = String(liveZoom)
  }
  showZoom()
}

function showZoom(): void {
  zoomVal.textContent = `${Number(slider.value).toFixed(1)}×`
}

let applying = false
let pending = false
async function applyLiveZoom(): Promise<void> {
  const hwPart = hw ? Math.min(liveZoom, hw.max) : 1
  const cssPart = liveZoom / hwPart
  video.style.transform = cssPart > 1.001 ? `scale(${cssPart})` : ''
  if (!hw || !track) return
  if (applying) {
    pending = true
    return
  }
  applying = true
  try {
    const set: Record<string, unknown> = { zoom: hwPart }
    if (hasTorch) set.torch = torchOn
    await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] })
  } catch {
    /* zoom is best-effort */
  }
  applying = false
  if (pending) {
    pending = false
    void applyLiveZoom()
  }
}

async function setTorch(on: boolean): Promise<void> {
  if (!track || !hasTorch) return
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
    torchOn = on
  } catch {
    torchOn = false
  }
  renderState()
}

// ---------- freeze ----------
function freeze(): void {
  if (!video.videoWidth) return
  still.width = video.videoWidth
  still.height = video.videoHeight
  still.getContext('2d')!.drawImage(video, 0, 0)
  frozenBase = hw ? Math.min(liveZoom, hw.max) : 1
  frozenZoom = liveZoom / frozenBase
  tx = 0
  ty = 0
  frozen = true
  applyFrozen()
  setupSlider()
  renderState()
}

function resume(): void {
  frozen = false
  setupSlider()
  void applyLiveZoom()
  renderState()
}

function clampPan(): void {
  const mx = ((frozenZoom - 1) * window.innerWidth) / 2
  const my = ((frozenZoom - 1) * window.innerHeight) / 2
  tx = Math.max(-mx, Math.min(mx, tx))
  ty = Math.max(-my, Math.min(my, ty))
}

function applyFrozen(): void {
  clampPan()
  still.style.transform = `translate(${tx}px, ${ty}px) scale(${frozenZoom})`
}

// drag to move around a zoomed frozen frame
let drag: { id: number; x: number; y: number } | null = null
still.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
  still.setPointerCapture(e.pointerId)
})
still.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return
  tx += e.clientX - drag.x
  ty += e.clientY - drag.y
  drag.x = e.clientX
  drag.y = e.clientY
  applyFrozen()
})
const endDrag = (): void => {
  drag = null
}
still.addEventListener('pointerup', endDrag)
still.addEventListener('pointercancel', endDrag)

// ---------- save the visible part of the frozen frame ----------
function saveImage(): void {
  const w = still.width
  const h = still.height
  const W = window.innerWidth
  const H = window.innerHeight
  const s0 = Math.max(W / w, H / h) // object-fit: cover
  const ox = (W - w * s0) / 2
  const oy = (H - h * s0) / 2
  const toFrame = (px: number, py: number): [number, number] => {
    const lx = W / 2 + (px - W / 2 - tx) / frozenZoom
    const ly = H / 2 + (py - H / 2 - ty) / frozenZoom
    return [(lx - ox) / s0, (ly - oy) / s0]
  }
  let [x0, y0] = toFrame(0, 0)
  let [x1, y1] = toFrame(W, H)
  x0 = Math.max(0, x0)
  y0 = Math.max(0, y0)
  x1 = Math.min(w, x1)
  y1 = Math.min(h, y1)
  const sw = x1 - x0
  const sh = y1 - y0
  if (sw < 2 || sh < 2) return
  const up = Math.max(1, 1600 / Math.max(sw, sh))
  const out = document.createElement('canvas')
  out.width = Math.round(sw * up)
  out.height = Math.round(sh * up)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(still, x0, y0, sw, sh, 0, 0, out.width, out.height)
  if (view > 0) {
    const img = ctx.getImageData(0, 0, out.width, out.height)
    const d = img.data
    const c = CONTRAST[view]
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      g = (g - 128) * c + 128
      if (view === 2) g = 255 - g
      g = g < 0 ? 0 : g > 255 ? 255 : g
      d[i] = d[i + 1] = d[i + 2] = g
    }
    ctx.putImageData(img, 0, 0)
  }
  out.toBlob(
    (blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const n = new Date()
      const p = (v: number): string => String(v).padStart(2, '0')
      a.href = url
      a.download = `loupe-${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}.jpg`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    },
    'image/jpeg',
    0.92,
  )
}

// ---------- events ----------
startBtn.addEventListener('click', () => void startCamera())
langBtn.addEventListener('click', () => {
  lang = lang === 'ja' ? 'en' : 'ja'
  t = dict[lang]
  renderText()
  void save(DB, 'lang', lang)
})
slider.addEventListener('input', () => {
  const v = Number(slider.value)
  if (frozen) {
    frozenZoom = Math.max(1, v / frozenBase)
    applyFrozen()
    hint.hidden = frozenZoom <= 1.01
  } else {
    liveZoom = v
    void applyLiveZoom()
  }
  showZoom()
})
freezeBtn.addEventListener('click', () => (frozen ? resume() : freeze()))
viewBtn.addEventListener('click', () => {
  view = (view + 1) % 3
  renderState()
  void save(DB, 'view', view)
})
torchBtn.addEventListener('click', () => void setTorch(!torchOn))
saveBtn.addEventListener('click', saveImage)
window.addEventListener('resize', () => frozen && applyFrozen())

document.addEventListener('visibilitychange', () => {
  if (!started) return
  if (document.hidden) stopCamera()
  else void startCamera()
})

// ---------- boot ----------
async function boot(): Promise<void> {
  const savedLang = await load<Lang>(DB, 'lang')
  if (savedLang === 'en' || savedLang === 'ja') lang = savedLang
  t = dict[lang]
  const savedView = await load<number>(DB, 'view')
  if (savedView === 0 || savedView === 1 || savedView === 2) view = savedView
  renderState()
  void askPersist()
  // If the camera was already allowed, open it straight away.
  try {
    const st = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    if (st?.state === 'granted') void startCamera()
  } catch {
    /* some browsers cannot query camera permission */
  }
}

renderState()
void boot()

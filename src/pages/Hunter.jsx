import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { openPdfWindow } from '../utils/pdfExport'

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const MOODS = ['Minimalista','Bold & Disruptivo','Sofisticado / Luxury','Orgánico / Natural',
               'Tech / Futurista','Playful / Colorido','Editorial / Artístico','Retro / Vintage','Corporativo / Serio']
const AUDIENCES = ['B2B Corporativo','B2C Masivo','Millennials (28-42)','Gen Z (18-27)',
                   'Adultos 40-60','Profesionales','Padres / Familias','Niche / Especializado']
const INDUSTRIES = ['Tecnología / SaaS','Salud & Wellness','Moda & Lifestyle','Gastronomía & Food',
                    'Finanzas & Fintech','Educación','Real Estate','Entretenimiento & Media',
                    'Retail & E-commerce','Servicios Profesionales','Startup / Scale-up',
                    'Arte & Cultura','Belleza & Cosmética','Deporte & Fitness','Turismo & Hospitalidad']
const PLATFORMS   = ['Instagram','TikTok','LinkedIn','Pinterest','YouTube','X / Twitter']
const RRSS_STYLES = ['Fotográfico editorial','Ilustración / Ilustrativo','Tipográfico / Text-based',
                     'Minimalista limpio','Colorido & vibrante','Dark / Oscuro','Texturas & Collage','3D / CGI']

const STEPS = [{n:'01',label:'Marca'},{n:'02',label:'Audiencia'},{n:'03',label:'Contexto'}]

const INIT_FORM = {
  name:'', websiteUrl:'', industry:'', description:'', values:'', usp:'',
  audiences:[], moods:[], platforms:[], rrssStyle:[],
  competitors:'', likes:'', dislikes:'', notes:'',
}

/* ══════════════════════════════════════════════════════════
   PROMPT BUILDER — asks for visual URLs per reference
══════════════════════════════════════════════════════════ */
function buildPrompt(f, attachmentsSummary) {
  return `Eres un director creativo senior especializado en branding y diseño de identidad visual.
Analiza el siguiente brief y genera un informe COMPLETO de referencias visuales.

BRIEF DEL CLIENTE:
- Marca/Cliente: ${f.name || 'Sin nombre'}
- Web/Redes del cliente: ${f.websiteUrl || 'No especificado'}
- Industria: ${f.industry || 'No especificado'}
- Descripción: ${f.description || 'No especificado'}
- Valores: ${f.values || 'No especificado'}
- USP / Diferencial: ${f.usp || 'No especificado'}
- Público objetivo: ${f.audiences?.join(', ') || 'No especificado'}
- Competidores: ${f.competitors || 'No especificado'}
- Marcas que le gustan: ${f.likes || 'No especificado'}
- Qué no quieren: ${f.dislikes || 'No especificado'}
- Mood / Estilo: ${f.moods?.join(', ') || 'No especificado'}
- Plataformas RRSS: ${f.platforms?.join(', ') || 'No especificado'}
- Estilo visual RRSS: ${f.rrssStyle?.join(', ') || 'No especificado'}
- Notas adicionales: ${f.notes || 'Ninguna'}
${attachmentsSummary ? `- Archivos adjuntos: ${attachmentsSummary}` : ''}

INSTRUCCIÓN IMPORTANTE SOBRE LINKS:
Para CADA referencia incluí al final de la línea uno o más links directos entre []: 
- Logotipos/Marcas: perfil Instagram, sitio web, Behance del estudio o página de marca
- Tipografías: link a Google Fonts o sitio de la tipografía
- Cuentas RRSS: link directo al perfil
- Referencias de paleta/mood: tablero de Pinterest o imagen de referencia
Formato del link: [https://instagram.com/...] o [https://pinterest.com/...] o [https://behance.net/...]
Si no conocés el link exacto, construí la URL de búsqueda más probable en ese platform.

Genera el informe con EXACTAMENTE estas secciones en ##:

## ARQUETIPO DE MARCA
Identifica el arquetipo Jung dominante, posicionamiento, tono de voz y diferencial visual (4-5 oraciones).

## REFERENCIAS DE LOGOTIPO
Lista 5 marcas/estudios reales con logotipos que sirvan como referencia.
Formato estricto: Nombre – Tipo de construcción y por qué aplica [link1] [link2]

## MARCAS DE REFERENCIA ESTÉTICA
Lista 6 marcas con identidad visual inspiradora (cualquier industria).
Formato: Nombre – Razón concreta de referencia [link1] [link2]

## DIRECCIÓN DE PALETA
Propón 5 colores con hex (#XXXXXX). Nombre creativo de la paleta. Lógica emocional.
Incluí al final links a tableros de Pinterest o referencias visuales de esa dirección de color:
[https://pinterest.com/search/pins/?q=...palette]

## TIPOGRAFÍAS SUGERIDAS
3 tipografías de Google Fonts con rol y carácter.
Formato: Nombre – Rol – Carácter [https://fonts.google.com/specimen/...]

## IDENTIDAD VISUAL EN REDES SOCIALES
Dirección para feed, stories y plataformas. Grilla Instagram si aplica.
Incluí links a 2-3 feeds de referencia visual: [https://instagram.com/...]

## CUENTAS DE REFERENCIA PARA RRSS
7 cuentas reales de Instagram, Behance o Pinterest.
Formato: @handle – Por qué referenciar – plataforma [https://instagram.com/handle]

## KEYWORDS VISUALES
8 palabras clave visuales. Luego 2 oraciones del "mundo visual" de la marca.
Al final, un tablero de Pinterest que resuma el mood: [https://pinterest.com/search/pins/?q=...]

Sé específico. Todas las referencias deben ser REALES y tener links verificables.`.trim()
}

/* ══════════════════════════════════════════════════════════
   PARSERS
══════════════════════════════════════════════════════════ */
function parseSection(text, ...keys) {
  if (!text) return ''
  const lines = text.split('\n')
  let on = false, buf = []
  for (const line of lines) {
    const up = line.toUpperCase()
    const isHead = line.match(/^#{1,3}\s/) || (line.match(/^\*\*[^*]+\*\*/) && line.length < 80)
    if (isHead && keys.some(k => up.includes(k))) { on = true; buf = []; continue }
    if (on && isHead && !keys.some(k => up.includes(k))) break
    if (on) buf.push(line)
  }
  return buf.join('\n').trim()
}

function toItems(text, max = 7) {
  if (!text) return []
  return text.split('\n')
    .map(l => l.replace(/^[-•*\d.)]\s*/, '').trim())
    .filter(l => l.length > 4)
    .slice(0, max)
}

function extractHex(text) {
  return [...new Set((text || '').match(/#[A-Fa-f0-9]{6}/g) || [])].slice(0, 7)
}

// Extract links from [url] format
function extractLinks(str) {
  const matches = str.match(/\[https?:\/\/[^\]]+\]/g) || []
  return matches.map(m => m.slice(1, -1))
}

// Clean text removing [link] portions
function cleanText(str) {
  return str.replace(/\[https?:\/\/[^\]]+\]/g, '').trim()
}

function splitND(str) {
  const clean = cleanText(str)
  const links = extractLinks(str)
  const m = clean.match(/[-–—:]/)
  if (!m) return [clean, '', links]
  const i = clean.indexOf(m[0])
  return [clean.slice(0, i).trim(), clean.slice(i + 1).trim(), links]
}

/* ══════════════════════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════════════════════ */
const T = {
  purple:'#7d03ff', orange:'#ff7939', green:'#00ff00',
  purpleDim:'rgba(125,3,255,.14)', orangeDim:'rgba(255,121,57,.12)', greenDim:'rgba(0,255,0,.08)',
  purpleBorder:'rgba(125,3,255,.3)', orangeBorder:'rgba(255,121,57,.3)', greenBorder:'rgba(0,255,0,.2)',
  card:'#141414', card2:'#1a1a1a', dark:'#0b0b0b',
  border:'rgba(255,255,255,.07)', muted:'rgba(255,255,255,.45)',
}

/* ══════════════════════════════════════════════════════════
   LINK CHIP
══════════════════════════════════════════════════════════ */
function LinkChip({ url }) {
  let label = '🔗 Ver referencia'
  let icon = '🔗'
  if (url.includes('instagram.com')) { label = 'Instagram'; icon = '📸' }
  else if (url.includes('pinterest.com')) { label = 'Pinterest'; icon = '📌' }
  else if (url.includes('behance.net')) { label = 'Behance'; icon = '🎨' }
  else if (url.includes('fonts.google.com')) { label = 'Google Fonts'; icon = 'Aa' }
  else if (url.includes('dribbble.com')) { label = 'Dribbble'; icon = '🏀' }
  else { try { label = new URL(url).hostname.replace('www.','') } catch {} }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:500,
      background:'rgba(125,3,255,.1)', border:'1px solid rgba(125,3,255,.25)',
      color:'#b06bff', textDecoration:'none', transition:'all .2s',
      whiteSpace:'nowrap',
    }}
    onMouseEnter={e => { e.currentTarget.style.background='rgba(125,3,255,.2)'; e.currentTarget.style.borderColor=T.purple }}
    onMouseLeave={e => { e.currentTarget.style.background='rgba(125,3,255,.1)'; e.currentTarget.style.borderColor='rgba(125,3,255,.25)' }}
    >
      <span>{icon}</span> {label} ↗
    </a>
  )
}

/* ══════════════════════════════════════════════════════════
   CARD + REF LIST COMPONENTS
══════════════════════════════════════════════════════════ */
function Card({ accent='purple', icon, title, sub, children, style={} }) {
  const C = { purple:T.purple, orange:T.orange, green:T.green, white:'rgba(255,255,255,.25)' }
  const B = { purple:T.purpleDim, orange:T.orangeDim, green:T.greenDim, white:'rgba(255,255,255,.07)' }
  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:28, marginBottom:20,
      position:'relative', overflow:'hidden', animation:'fadeUp .5s ease', ...style }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:C[accent]||accent }} />
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <div style={{ width:38, height:38, borderRadius:9, background:B[accent]||T.purpleDim, color:C[accent]||T.purple,
          display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Unbounded,sans-serif', fontSize:13, fontWeight:900, flexShrink:0 }}>{icon}</div>
        <div>
          <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:12, fontWeight:700 }}>{title}</div>
          {sub && <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function RefList({ text, color=T.purple, max=6 }) {
  const items = toItems(text, max)
  if (!items.length) return <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{text}</p>
  return (
    <div>
      {items.map((item, i) => {
        const [name, desc, links] = splitND(item)
        return (
          <div key={i} style={{ padding:'13px 0', borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:'flex', gap:14 }}>
              <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:10, fontWeight:700, color, width:22, flexShrink:0, paddingTop:2 }}>
                {String(i+1).padStart(2,'0')}
              </span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{name}</div>
                {desc && <div style={{ fontSize:12, color:T.muted, lineHeight:1.55, marginBottom:8 }}>{desc}</div>}
                {links.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {links.map((url, j) => <LinkChip key={j} url={url} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Chips({ options, selected, onToggle }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
      {options.map(o => (
        <button key={o} onClick={() => onToggle(o)} style={{
          padding:'8px 16px', borderRadius:99, fontSize:12, cursor:'pointer', transition:'all .2s',
          border: selected.includes(o) ? `1px solid ${T.purple}` : `1px solid ${T.border}`,
          background: selected.includes(o) ? T.purple : 'transparent',
          color: selected.includes(o) ? '#fff' : T.muted,
          fontWeight: selected.includes(o) ? 500 : 400,
        }}>{o}</button>
      ))}
    </div>
  )
}

const KW_STYLES = [
  { bg:T.purpleDim, border:T.purpleBorder, color:'#b06bff' },
  { bg:T.orangeDim, border:T.orangeBorder, color:T.orange },
  { bg:T.greenDim,  border:T.greenBorder,  color:T.green },
  { bg:'rgba(255,255,255,.07)', border:T.border, color:'rgba(255,255,255,.7)' },
]

/* ══════════════════════════════════════════════════════════
   FILE UPLOAD COMPONENT
══════════════════════════════════════════════════════════ */
function FileUpload({ files, onAdd, onRemove }) {
  const inputRef = useRef()

  const handleFiles = (e) => {
    const newFiles = Array.from(e.target.files)
    newFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        onAdd({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: ev.target.result,
        })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)}KB`
    return `${(bytes/1024/1024).toFixed(1)}MB`
  }

  const getIcon = (type) => {
    if (type.includes('pdf')) return '📄'
    if (type.includes('image')) return '🖼️'
    if (type.includes('word') || type.includes('document')) return '📝'
    return '📎'
  }

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic"
        onChange={handleFiles} style={{ display:'none' }} />

      <button onClick={() => inputRef.current.click()} style={{
        display:'flex', alignItems:'center', gap:10, width:'100%',
        padding:'14px 18px', background:'#181818',
        border:`2px dashed rgba(125,3,255,.3)`, borderRadius:10,
        color:T.muted, fontSize:13, cursor:'pointer', transition:'all .2s',
        justifyContent:'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor=T.purple; e.currentTarget.style.color='#fff' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(125,3,255,.3)'; e.currentTarget.style.color=T.muted }}
      >
        <span style={{ fontSize:20 }}>📎</span>
        <span>Adjuntar archivos del brief</span>
        <span style={{ fontSize:11, opacity:.6 }}>PDF, Word, Imágenes</span>
      </button>

      {files.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:10 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10,
              background:'rgba(125,3,255,.07)', border:`1px solid rgba(125,3,255,.2)`,
              borderRadius:8, padding:'10px 14px',
            }}>
              <span style={{ fontSize:18 }}>{getIcon(f.type)}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                <div style={{ fontSize:10, color:T.muted }}>{formatSize(f.size)}</div>
              </div>
              <button onClick={() => onRemove(i)} style={{
                background:'none', border:'none', color:'rgba(255,255,255,.3)',
                fontSize:16, cursor:'pointer', padding:'2px 6px', transition:'color .2s', flexShrink:0,
              }}
              onMouseEnter={e => e.currentTarget.style.color='#ff5555'}
              onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,.3)'}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   HISTORY PANEL
══════════════════════════════════════════════════════════ */
function HistoryPanel({ history=[], onRestore }) {
  const [open, setOpen] = useState(false)
  if (!history.length) return null

  function timeAgo(ts) {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date())
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60)    return 'ahora mismo'
    if (diff < 3600)  return `hace ${Math.floor(diff/60)} min`
    if (diff < 86400) return `hace ${Math.floor(diff/3600)} hs`
    return `hace ${Math.floor(diff/86400)} días`
  }

  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding:'9px 16px', background:T.card2, border:`1px solid ${T.border}`,
        borderRadius:9, color:T.muted, fontSize:12, display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'all .2s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor=T.purpleBorder}
      onMouseLeave={e => e.currentTarget.style.borderColor=T.border}
      >
        🕐 Historial
        <span style={{ background:T.purple, color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:10, fontFamily:'Unbounded,sans-serif', fontWeight:700 }}>{history.length}</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', right:0, width:300,
          background:'#1a1a1a', border:`1px solid ${T.border}`, borderRadius:14,
          padding:14, zIndex:200, boxShadow:'0 20px 60px rgba(0,0,0,.7)',
          animation:'fadeUp .25s ease',
        }}>
          <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.muted, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>Versiones anteriores</div>
          <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:260, overflowY:'auto' }}>
            {[...history].reverse().map((h, i) => (
              <div key={i} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:9, padding:'11px 13px', cursor:'pointer', transition:'all .2s' }}
                onClick={() => { onRestore(h); setOpen(false) }}
                onMouseEnter={e => e.currentTarget.style.borderColor=T.purpleBorder}
                onMouseLeave={e => e.currentTarget.style.borderColor=T.border}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple }}>Versión {history.length - i}</span>
                  <span style={{ fontSize:10, color:T.muted }}>{timeAgo(h.savedAt)}</span>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', lineHeight:1.5, overflow:'hidden', maxHeight:36 }}>
                  {h.result?.substring(0, 90)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   RESULTS VIEW — DUAL MODE (Designer / Client)
══════════════════════════════════════════════════════════ */
function ResultsView({ raw, brief, mode }) {
  const isClient = mode === 'client'

  const s = {
    archetype: parseSection(raw, 'ARQUETIPO'),
    logos:     parseSection(raw, 'LOGOTIPO','LOGO'),
    brands:    parseSection(raw, 'ESTÉTICA','MARCAS DE REFERENCIA'),
    colors:    parseSection(raw, 'PALETA','DIRECCIÓN DE PALETA'),
    typo:      parseSection(raw, 'TIPOGRAF'),
    rrss:      parseSection(raw, 'IDENTIDAD VISUAL EN REDES','IDENTIDAD VISUAL'),
    accounts:  parseSection(raw, 'CUENTAS DE REFERENCIA','CUENTAS PARA'),
    keywords:  parseSection(raw, 'KEYWORDS','PALABRAS CLAVE'),
  }

  const hexes    = extractHex(s.colors)
  const kwords   = toItems(s.keywords, 8)
  const accounts = toItems(s.accounts, 7)
  const colorLinks = extractLinks(s.colors)

  /* ── CLIENT VIEW ── */
  if (isClient) return (
    <div>
      <div style={{ textAlign:'center', padding:'36px 0 28px', borderBottom:`1px solid ${T.border}`, marginBottom:32 }}>
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.muted, letterSpacing:4, marginBottom:10 }}>Avalon World Agency — Propuesta Visual</div>
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:'clamp(22px,4vw,38px)', fontWeight:900, lineHeight:1.05, marginBottom:10 }}>
          Universo Visual<br/>
          <span style={{ background:`linear-gradient(120deg,${T.purple},${T.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            {brief.name}
          </span>
        </div>
        <p style={{ fontSize:14, color:T.muted, maxWidth:440, margin:'0 auto', lineHeight:1.7 }}>
          Seleccionamos referencias que capturan la esencia y dirección visual de tu marca.
        </p>
        {brief.websiteUrl && (
          <a href={brief.websiteUrl.startsWith('http') ? brief.websiteUrl : `https://${brief.websiteUrl}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-block', marginTop:12, fontSize:12, color:T.purple, textDecoration:'none', borderBottom:'1px solid rgba(125,3,255,.3)', paddingBottom:2 }}>
            {brief.websiteUrl} ↗
          </a>
        )}
      </div>

      {s.archetype && (
        <Card accent="purple" icon="◉" title="Posicionamiento de Marca" sub="Arquetipo y esencia">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{cleanText(s.archetype)}</p>
        </Card>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {s.brands && <Card accent="orange" icon="★" title="Marcas que Inspiran" sub="Referencias estéticas">
          <RefList text={s.brands} color={T.orange} max={6} />
        </Card>}
        {s.logos && <Card accent="white" icon="✦" title="Estilos de Logotipo" sub="Construcciones a explorar">
          <RefList text={s.logos} color="rgba(255,255,255,.4)" max={5} />
        </Card>}
      </div>
      {s.colors && (
        <Card accent="purple" icon="◈" title="Universo de Color" sub="Dirección cromática propuesta">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{cleanText(s.colors)}</p>
          {hexes.length > 0 && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:14 }}>
              {hexes.map((h,i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                  <div style={{ width:50, height:50, borderRadius:10, background:h, border:`1px solid ${T.border}` }}/>
                  <span style={{ fontSize:10, color:T.muted, fontFamily:'monospace' }}>{h}</span>
                </div>
              ))}
            </div>
          )}
          {colorLinks.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:12 }}>
              {colorLinks.map((url,j) => <LinkChip key={j} url={url} />)}
            </div>
          )}
        </Card>
      )}
      {s.rrss && <Card accent="green" icon="◎" title="Identidad en Redes Sociales" sub="Feed · Stories · Ecosistema digital">
        <p style={{ fontSize:13, color:'rgba(255,255,255,.72)', lineHeight:1.85 }}>{cleanText(s.rrss)}</p>
        {extractLinks(s.rrss).length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:12 }}>
            {extractLinks(s.rrss).map((url,j) => <LinkChip key={j} url={url} />)}
          </div>
        )}
      </Card>}
      {kwords.length > 0 && (
        <Card accent="white" icon="◐" title="Universo Visual" sub="Las palabras que definen tu marca">
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:14 }}>
            {kwords.map((k,i) => {
              const st = KW_STYLES[i%4]
              return <span key={i} style={{ padding:'7px 16px', borderRadius:99, fontSize:12, fontWeight:500, background:st.bg, border:`1px solid ${st.border}`, color:st.color }}>{cleanText(k)}</span>
            })}
          </div>
          {extractLinks(s.keywords).length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:14 }}>
              {extractLinks(s.keywords).map((url,j) => <LinkChip key={j} url={url} />)}
            </div>
          )}
        </Card>
      )}
    </div>
  )

  /* ── DESIGNER VIEW ── */
  return (
    <div>
      {s.archetype && (
        <Card accent="purple" icon="◉" title="Arquetipo de Marca" sub="Posicionamiento · Tono de voz · Diferencial visual">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{cleanText(s.archetype)}</p>
        </Card>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {s.logos && <Card accent="orange" icon="✦" title="Referencias de Logotipo" sub="Estilos y construcción técnica">
          <RefList text={s.logos} color={T.orange} max={5} />
        </Card>}
        {s.brands && <Card accent="white" icon="★" title="Marcas de Referencia" sub="Inspiración cross-industry">
          <RefList text={s.brands} color="rgba(255,255,255,.4)" max={6} />
        </Card>}
      </div>
      {s.colors && (
        <Card accent="purple" icon="◈" title="Dirección de Paleta" sub="Propuesta cromática con lógica emocional">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{cleanText(s.colors)}</p>
          {hexes.length > 0 && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:14 }}>
              {hexes.map((h,i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                  <div style={{ width:50, height:50, borderRadius:10, background:h, border:`1px solid ${T.border}` }}/>
                  <span style={{ fontSize:10, color:T.muted, fontFamily:'monospace' }}>{h}</span>
                </div>
              ))}
            </div>
          )}
          {colorLinks.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:12 }}>
              {colorLinks.map((url,j) => <LinkChip key={j} url={url} />)}
            </div>
          )}
        </Card>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {s.typo && <Card accent="orange" icon="Aa" title="Tipografías Sugeridas" sub="Display · Cuerpo · UI">
          <RefList text={s.typo} color={T.orange} max={4} />
        </Card>}
        {s.rrss && <Card accent="green" icon="◎" title="Identidad Visual en RRSS" sub="Feed · Stories · Grilla · Recursos">
          <p style={{ fontSize:13, color:'rgba(255,255,255,.72)', lineHeight:1.85 }}>{cleanText(s.rrss)}</p>
          {extractLinks(s.rrss).length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:10 }}>
              {extractLinks(s.rrss).map((url,j) => <LinkChip key={j} url={url} />)}
            </div>
          )}
        </Card>}
      </div>
      {accounts.length > 0 && (
        <Card accent="green" icon="@" title="Cuentas de Referencia para RRSS" sub="Estudios, agencias y marcas a seguir">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
            {accounts.map((a,i) => {
              const [handle, why, links] = splitND(a)
              return (
                <div key={i} style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:12, padding:16 }}>
                  <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:11, fontWeight:700, color:T.green, marginBottom:5 }}>
                    {handle.startsWith('@') ? handle : `@${cleanText(handle)}`}
                  </div>
                  {why && <div style={{ fontSize:12, color:T.muted, lineHeight:1.5, marginBottom:8 }}>{why}</div>}
                  {links.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {links.map((url,j) => <LinkChip key={j} url={url} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {kwords.length > 0 && (
        <Card accent="white" icon="◐" title="Keywords Visuales" sub="Palabras que guían cada decisión creativa">
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:14 }}>
            {kwords.map((k,i) => {
              const st = KW_STYLES[i%4]
              return <span key={i} style={{ padding:'7px 16px', borderRadius:99, fontSize:12, fontWeight:500, background:st.bg, border:`1px solid ${st.border}`, color:st.color }}>{cleanText(k)}</span>
            })}
          </div>
          {extractLinks(s.keywords).length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:14 }}>
              {extractLinks(s.keywords).map((url,j) => <LinkChip key={j} url={url} />)}
            </div>
          )}
        </Card>
      )}
      {Object.values(s).every(v => !v) && (
        <Card accent="purple" icon="★" title="Referencias Generadas">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', whiteSpace:'pre-wrap', lineHeight:1.88 }}>{raw}</p>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN HUNTER PAGE
══════════════════════════════════════════════════════════ */
export default function Hunter({ project, onBack }) {
  const { user }  = useAuth()
  const [form, setForm]             = useState(INIT_FORM)
  const [attachments, setAttachments] = useState([])
  const [step, setStep]             = useState(1)
  const [phase, setPhase]           = useState('form')
  const [result, setResult]         = useState('')
  const [mode, setMode]             = useState('designer')
  const [error, setError]           = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [history, setHistory]       = useState([])
  const projectIdRef = useRef(project?.id || null)
  const saveTimerRef = useRef(null)

  /* Load existing project */
  useEffect(() => {
    if (project) {
      setForm(project.brief || INIT_FORM)
      setHistory(project.history || [])
      setAttachments(project.attachments || [])
      if (project.result) { setResult(project.result); setPhase('done') }
    }
  }, [project])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tog = (k, v) => setForm(p => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v]
  }))

  const addFile    = (f) => setAttachments(a => [...a, f])
  const removeFile = (i) => setAttachments(a => a.filter((_, idx) => idx !== i))

  /* Autosave */
  const saveToFirestore = useCallback(async (brief, resultData, status, addToHistory=false) => {
    if (!user) return
    setSaveStatus('saving')
    try {
      const payload = {
        userId: user.uid,
        clientName: brief.name || 'Sin nombre',
        brief,
        status,
        updatedAt: serverTimestamp(),
        attachments: attachments.map(a => ({ name: a.name, type: a.type, size: a.size })),
      }
      if (resultData) payload.result = resultData

      if (projectIdRef.current) {
        const up = { ...payload }
        if (addToHistory && resultData) {
          up.history = arrayUnion({ result: resultData, savedAt: new Date().toISOString() })
        }
        await updateDoc(doc(db, 'projects', projectIdRef.current), up)
      } else {
        const r = await addDoc(collection(db, 'projects'), {
          ...payload, createdAt: serverTimestamp(), history: [],
        })
        projectIdRef.current = r.id
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2500)
    } catch (e) {
      console.error('Save error:', e)
      setSaveStatus('')
    }
  }, [user, attachments])

  useEffect(() => {
    if (phase !== 'form' || !form.name) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveToFirestore(form, null, 'draft'), 3000)
    return () => clearTimeout(saveTimerRef.current)
  }, [form, phase, saveToFirestore])

  /* Validation — only name required */
  const validate = () => {
    if (!form.name.trim()) { setError('Ingresá al menos el nombre del cliente para continuar.'); return false }
    setError(''); return true
  }

  const next = () => { if (!validate()) return; setStep(s => Math.min(s+1, 3)) }
  const back = () => { setError(''); setStep(s => Math.max(s-1, 1)) }

  /* Generate */
  const generate = async () => {
    if (!validate()) return
    setPhase('loading')
    const attachSummary = attachments.length > 0
      ? attachments.map(a => a.name).join(', ')
      : null
    try {
      const res = await fetch('https://tiny-union-cf64anthropic-proxy.eli-587.workers.dev/', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:2500,
          messages:[{ role:'user', content:buildPrompt(form, attachSummary) }],
        }),
      })
      const data = await res.json()
      const txt  = (data.content || []).map(b => b.text || '').join('')
      if (!txt) throw new Error('Sin respuesta')
      setResult(txt)
      setHistory(h => [...h, { result:txt, savedAt:new Date().toISOString() }])
      setPhase('done')
      await saveToFirestore(form, txt, 'completed', true)
    } catch {
      setError('Error al generar. Verificá la conexión e intentá nuevamente.')
      setPhase('form')
    }
  }

  const resetToNew = () => {
    setForm(INIT_FORM); setStep(1); setPhase('form')
    setResult(''); setError(''); setAttachments([])
    projectIdRef.current = null
  }

  const handlePdf = () => openPdfWindow(result, form, mode)

  /* Shared styles */
  const inp = { background:'#181818', border:`1px solid rgba(255,255,255,.1)`, borderRadius:10, padding:'13px 16px', color:'#fff', fontSize:14, outline:'none', width:'100%' }
  const secLabel = { fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:600, color:'rgba(255,255,255,.25)', letterSpacing:3, textTransform:'uppercase', marginBottom:18 }
  const fLabel = { fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase', display:'block', marginBottom:8 }

  /* ── HEADER ── */
  const Header = () => (
    <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 32px', borderBottom:`1px solid ${T.border}`, background:'rgba(11,11,11,.97)', backdropFilter:'blur(14px)', position:'sticky', top:0, zIndex:100 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.muted, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5, transition:'color .2s' }}
          onMouseEnter={e => e.currentTarget.style.color='#fff'}
          onMouseLeave={e => e.currentTarget.style.color=T.muted}
        >← Proyectos</button>
        <span style={{ color:'rgba(255,255,255,.15)' }}>|</span>
        <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:10, color:'rgba(255,255,255,.35)', letterSpacing:2 }}>
          {form.name || 'Nuevo proyecto'}
        </span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {saveStatus==='saving' && <span style={{ fontSize:11, color:T.muted, fontFamily:'Unbounded,sans-serif', letterSpacing:1 }}>Guardando...</span>}
        {saveStatus==='saved'  && <span style={{ fontSize:11, color:T.green, fontFamily:'Unbounded,sans-serif', letterSpacing:1 }}>✓ Guardado</span>}
        <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:8, fontWeight:700, background:T.green, color:'#000', padding:'5px 12px', borderRadius:99, letterSpacing:1.5 }}>AVALON · 2026</span>
      </div>
    </header>
  )

  /* ── PROGRESS BAR ── */
  const ProgBar = () => (
    <div style={{ height:2, background:T.border }}>
      <div style={{ height:2, background:`linear-gradient(90deg,${T.purple},${T.orange})`, width:phase==='done' ? '100%' : `${((step-1)/3)*100}%`, transition:'width .5s' }} />
    </div>
  )

  /* ══ FORM PHASE ══ */
  if (phase === 'form') return (
    <div style={{ minHeight:'100vh', background:T.dark }}>
      <Header />
      <ProgBar />

      {/* Hero */}
      <div style={{ padding:'52px 32px 36px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-80, left:'50%', transform:'translateX(-50%)', width:700, height:380, background:'radial-gradient(ellipse at 50% 0%,rgba(125,3,255,.18) 0%,transparent 65%)', pointerEvents:'none' }} />
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.orange, letterSpacing:4, textTransform:'uppercase', marginBottom:14 }}>★ Diseño · Branding · IA</div>
        <h1 style={{ fontFamily:'Unbounded,sans-serif', fontWeight:900, fontSize:'clamp(26px,5vw,48px)', lineHeight:1.0, marginBottom:16 }}>
          Visual{' '}<span style={{ background:`linear-gradient(120deg,${T.purple},${T.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Reference Hunter</span>
        </h1>
        <p style={{ fontSize:14, color:T.muted, maxWidth:500, margin:'0 auto', lineHeight:1.75 }}>
          Completá el brief del cliente — solo el nombre es obligatorio. La IA generará referencias visuales con links directos a Instagram, Pinterest, Behance y más.
        </p>
      </div>

      {/* Steps */}
      <div style={{ display:'flex', justifyContent:'center', alignItems:'flex-start', marginBottom:36 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Unbounded,sans-serif', fontSize:10, fontWeight:700, transition:'all .3s',
                border: step===i+1 ? `2px solid ${T.purple}` : step>i+1 ? `2px solid ${T.purple}` : `2px solid ${T.border}`,
                background: step===i+1 ? T.purple : step>i+1 ? T.purpleDim : T.card,
                color: step===i+1 ? '#fff' : step>i+1 ? T.purple : T.muted,
              }}>
                {step>i+1 ? '✓' : s.n}
              </div>
              <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:step===i+1 ? '#fff' : T.muted, letterSpacing:1 }}>{s.label}</div>
            </div>
            {i < STEPS.length-1 && <div style={{ width:48, height:2, background:step>i+1 ? T.purple : T.border, margin:'0 6px', marginTop:-16, transition:'background .3s' }} />}
          </div>
        ))}
      </div>

      {/* Form */}
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 32px 80px' }}>

        {/* STEP 1 — Marca */}
        {step === 1 && (
          <div style={{ animation:'fadeUp .35s ease' }}>
            <div style={secLabel}>Datos de la marca</div>

            {/* Website URL — prominent first field */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18,
              padding:'16px 18px', background:'rgba(125,3,255,.07)', border:`1px solid ${T.purpleBorder}`, borderRadius:12 }}>
              <label style={fLabel}>🌐 Web / Instagram / Redes del cliente <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(para pre-analizar automáticamente)</span></label>
              <input style={{ ...inp, background:'#111' }} type="url" placeholder="https://cliente.com o @instagramhandle"
                value={form.websiteUrl} onChange={e => set('websiteUrl', e.target.value)} />
              <div style={{ fontSize:11, color:'rgba(125,3,255,.7)' }}>💡 Pegá la URL del cliente y la IA la tendrá en cuenta al generar las referencias</div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={fLabel}>Nombre / Marca *</label>
                <input style={inp} placeholder="Ej: Frakxel" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={fLabel}>Industria <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
                <select style={inp} value={form.industry} onChange={e => set('industry', e.target.value)}>
                  <option value="">Seleccioná...</option>
                  {INDUSTRIES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, gridColumn:'1/-1' }}>
                <label style={fLabel}>Descripción del negocio <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional si tenés la URL)</span></label>
                <textarea style={{ ...inp, resize:'vertical', minHeight:80, lineHeight:1.65 }} placeholder="¿Qué hace la marca? ¿Cuál es su propuesta de valor?" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={fLabel}>Valores <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
                <input style={inp} placeholder="Innovación, cercanía..." value={form.values} onChange={e => set('values', e.target.value)} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={fLabel}>USP / Diferencial <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
                <input style={inp} placeholder="Qué los hace únicos" value={form.usp} onChange={e => set('usp', e.target.value)} />
              </div>
            </div>

            {/* File upload */}
            <div style={{ marginTop:8 }}>
              <label style={{ ...fLabel, marginBottom:10 }}>Archivos adjuntos del brief <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
              <FileUpload files={attachments} onAdd={addFile} onRemove={removeFile} />
            </div>
          </div>
        )}

        {/* STEP 2 — Audiencia */}
        {step === 2 && (
          <div style={{ animation:'fadeUp .35s ease' }}>
            <div style={secLabel}>Audiencia y estilo <span style={{ fontWeight:400, fontSize:8, color:T.muted, letterSpacing:1 }}>— todo opcional</span></div>
            <div style={{ marginBottom:20 }}>
              <label style={fLabel}>Público objetivo</label>
              <Chips options={AUDIENCES} selected={form.audiences} onToggle={v => tog('audiences', v)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={fLabel}>Mood / Estilo buscado</label>
              <Chips options={MOODS} selected={form.moods} onToggle={v => tog('moods', v)} />
            </div>
            <hr style={{ border:'none', borderTop:`1px solid ${T.border}`, margin:'22px 0' }} />
            <div style={secLabel}>Redes sociales</div>
            <div style={{ marginBottom:16 }}>
              <label style={fLabel}>Plataformas prioritarias</label>
              <Chips options={PLATFORMS} selected={form.platforms} onToggle={v => tog('platforms', v)} />
            </div>
            <div>
              <label style={fLabel}>Estilo visual en RRSS</label>
              <Chips options={RRSS_STYLES} selected={form.rrssStyle} onToggle={v => tog('rrssStyle', v)} />
            </div>
          </div>
        )}

        {/* STEP 3 — Contexto */}
        {step === 3 && (
          <div style={{ animation:'fadeUp .35s ease' }}>
            <div style={secLabel}>Contexto competitivo <span style={{ fontWeight:400, fontSize:8, color:T.muted, letterSpacing:1 }}>— todo opcional</span></div>
            {[
              { label:'Competidores o marcas mencionadas', key:'competitors', ph:'Ej: Patagonia, Nike, Class Express...' },
              { label:'Marcas / estilos que le gustan', key:'likes', ph:'Ej: les gusta el estilo de Paruolo, Apple...' },
              { label:'Qué definitivamente NO quieren', key:'dislikes', ph:'Colores, estilos, tipografías a evitar...' },
            ].map(({ label, key, ph }) => (
              <div key={key} style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                <label style={fLabel}>{label} <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
                <input style={inp} placeholder={ph} value={form[key]} onChange={e => set(key, e.target.value)} />
              </div>
            ))}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <label style={fLabel}>Notas adicionales del brief <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
              <textarea style={{ ...inp, resize:'vertical', minHeight:80, lineHeight:1.65 }}
                placeholder="Cualquier otro detalle que el cliente mencionó durante el brief..."
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background:'rgba(255,60,60,.08)', border:'1px solid rgba(255,60,60,.3)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#ff8888', marginTop:14, marginBottom:4 }}>
            {error}
          </div>
        )}

        {/* Nav */}
        <div style={{ display:'flex', gap:12, marginTop:20 }}>
          {step > 1 && (
            <button onClick={back} style={{ flex:'0 0 auto', padding:'14px 22px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:10, color:T.muted, fontSize:13, cursor:'pointer', transition:'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.3)'; e.currentTarget.style.color='#fff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.muted }}
            >← Atrás</button>
          )}
          {step < 3 && (
            <button onClick={next} style={{ flex:1, padding:15, background:T.purple, border:'none', borderRadius:10, color:'#fff', fontFamily:'Unbounded,sans-serif', fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', cursor:'pointer', transition:'all .25s' }}
              onMouseEnter={e => { e.currentTarget.style.background='#6600e0'; e.currentTarget.style.transform='translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background=T.purple; e.currentTarget.style.transform='translateY(0)' }}
            >Siguiente →</button>
          )}
          {step === 3 && (
            <button onClick={generate} style={{ flex:1, padding:18, background:`linear-gradient(135deg,${T.purple},#9b35ff)`, border:'none', borderRadius:12, color:'#fff', fontFamily:'Unbounded,sans-serif', fontSize:12, fontWeight:700, letterSpacing:2, textTransform:'uppercase', cursor:'pointer', transition:'all .25s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 10px 36px rgba(125,3,255,.5)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)' }}
            >Generar Referencias Visuales ✦</button>
          )}
        </div>
        
        {/* Quick generate shortcut */}
        {step < 3 && form.name && (
          <div style={{ textAlign:'center', marginTop:16 }}>
            <button onClick={generate} style={{ background:'none', border:'none', color:'rgba(125,3,255,.6)', fontSize:12, cursor:'pointer', textDecoration:'underline', textDecorationStyle:'dotted' }}>
              Saltar al paso 3 y generar ahora →
            </button>
          </div>
        )}
      </div>
    </div>
  )

  /* ══ LOADING PHASE ══ */
  if (phase === 'loading') return (
    <div style={{ minHeight:'100vh', background:T.dark }}>
      <Header /><ProgBar />
      <div style={{ textAlign:'center', padding:'100px 32px' }}>
        <div style={{ width:52, height:52, border:`3px solid ${T.purpleDim}`, borderTopColor:T.purple, borderRadius:'50%', animation:'spin .85s linear infinite', margin:'0 auto 28px' }} />
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:20, fontWeight:700, marginBottom:10 }}>Buscando referencias...</div>
        <p style={{ fontSize:13, color:T.muted, marginBottom:28 }}>Generando referencias visuales con links a Instagram, Pinterest, Behance y más</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:440, margin:'0 auto' }}>
          {['Arquetipo de marca','Referencias de logo','Paleta cromática','Cuentas RRSS','Links visuales'].map((t,i) => (
            <span key={i} style={{ padding:'5px 14px', borderRadius:99, border:`1px solid ${T.purpleBorder}`, fontSize:11, color:T.purple, animation:`pulse 2s ease-in-out ${i*.25}s infinite` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )

  /* ══ RESULTS PHASE ══ */
  return (
    <div style={{ minHeight:'100vh', background:T.dark }}>
      <Header /><ProgBar />

      <div style={{ maxWidth:960, margin:'0 auto', padding:'36px 32px 100px' }}>

        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>

          {/* Client info */}
          <div>
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.orange, letterSpacing:3, textTransform:'uppercase', marginBottom:5 }}>★ Referencias · {brief?.industry || ''}</div>
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:20, fontWeight:900 }}>{form.name}</div>
            {form.websiteUrl && (
              <a href={form.websiteUrl.startsWith('http') ? form.websiteUrl : `https://${form.websiteUrl}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize:12, color:T.muted, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4, marginTop:4 }}>
                🌐 {form.websiteUrl} ↗
              </a>
            )}
          </div>

          {/* Controls */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

            {/* Mode toggle */}
            <div style={{ display:'flex', gap:3, padding:4, background:T.card2, borderRadius:10 }}>
              {[{key:'designer',label:'Diseñadores',icon:'◉'},{key:'client',label:'Cliente',icon:'★'}].map(m => (
                <button key={m.key} onClick={() => setMode(m.key)} style={{
                  padding:'9px 16px', borderRadius:7, border:'none', cursor:'pointer',
                  fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, letterSpacing:1.5,
                  textTransform:'uppercase', transition:'all .25s',
                  background: mode===m.key ? T.purple : 'transparent',
                  color: mode===m.key ? '#fff' : T.muted,
                }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            <HistoryPanel history={history} onRestore={h => setResult(h.result)} />

            {/* PDF Export — two buttons */}
            <div style={{ display:'flex', gap:0, background:T.card2, border:`1px solid ${T.orangeBorder}`, borderRadius:9, overflow:'hidden' }}>
              <button onClick={handlePdf} style={{ padding:'9px 16px', background:'transparent', border:'none', color:T.orange, fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', cursor:'pointer', display:'flex', alignItems:'center', gap:7, transition:'all .2s' }}
                onMouseEnter={e => e.currentTarget.style.background=T.orangeDim}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
              >↓ PDF {mode==='client' ? 'Cliente' : 'Diseñadores'}</button>
              <div style={{ width:1, background:T.orangeBorder }} />
              <button onClick={() => { const prev = mode; setMode(mode==='client' ? 'designer' : 'client'); setTimeout(() => { openPdfWindow(result, form, mode==='client' ? 'designer' : 'client'); setMode(prev) }, 100) }}
                style={{ padding:'9px 14px', background:'transparent', border:'none', color:T.orange, fontSize:11, cursor:'pointer', transition:'all .2s' }}
                title="Exportar la otra vista"
                onMouseEnter={e => e.currentTarget.style.background=T.orangeDim}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
              >⇄</button>
            </div>

            <button onClick={() => { setPhase('form'); setStep(1) }} style={{ padding:'9px 14px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:9, color:T.muted, fontSize:12, cursor:'pointer', transition:'all .2s' }}>← Editar</button>
            <button onClick={generate} style={{ padding:'9px 14px', background:T.purpleDim, border:`1px solid ${T.purpleBorder}`, borderRadius:9, color:'#b06bff', fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, letterSpacing:1, textTransform:'uppercase', cursor:'pointer', transition:'all .2s' }}>↺ Regenerar</button>
            <button onClick={resetToNew} style={{ padding:'9px 14px', background:T.card2, border:`1px solid ${T.border}`, borderRadius:9, color:T.muted, fontSize:12, cursor:'pointer', transition:'all .2s' }}>+ Nuevo</button>
          </div>
        </div>

        {/* Mode strip */}
        <div style={{
          padding:'10px 16px', borderRadius:10, marginBottom:24,
          background: mode==='client' ? 'rgba(0,255,0,.05)' : T.purpleDim,
          border: `1px solid ${mode==='client' ? T.greenBorder : T.purpleBorder}`,
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>{mode==='client' ? '★' : '◉'}</span>
            <div>
              <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:mode==='client' ? T.green : T.purple, letterSpacing:1.5, textTransform:'uppercase' }}>
                {mode==='client' ? 'Vista Presentación Cliente' : 'Vista Interna Diseñadores'}
              </div>
              <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                {mode==='client' ? 'Versión limpia para mostrar al cliente, sin terminología técnica.' : 'Versión completa con referencias técnicas, links y notas de diseño.'}
              </div>
            </div>
          </div>
          <button onClick={handlePdf} style={{ padding:'7px 16px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:7, color:T.muted, fontSize:11, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            ↓ Descargar esta vista como PDF
          </button>
        </div>

        {/* Attachments indicator */}
        {attachments.length > 0 && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20, padding:'10px 14px', background:'rgba(125,3,255,.06)', border:`1px solid ${T.purpleBorder}`, borderRadius:10 }}>
            <span style={{ fontSize:11, color:T.muted }}>📎 Archivos del brief:</span>
            {attachments.map((a,i) => (
              <span key={i} style={{ fontSize:11, color:'#b06bff', background:T.purpleDim, padding:'2px 10px', borderRadius:99, border:`1px solid ${T.purpleBorder}` }}>{a.name}</span>
            ))}
          </div>
        )}

        <ResultsView raw={result} brief={form} mode={mode} />
      </div>

      <div style={{ textAlign:'center', padding:24, borderTop:`1px solid ${T.border}`, fontFamily:'Unbounded,sans-serif', fontSize:8, color:'rgba(255,255,255,.18)', letterSpacing:3 }}>
        <span style={{ color:T.purple, marginRight:8 }}>★ ★ ★</span>AVALON WORLD AGENCY · AI CHALLENGE 2026 · ÁREA DISEÑO
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion,
} from 'firebase/firestore'
import { db } from '../firebase'
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
  name:'', industry:'', description:'', values:'', usp:'',
  audiences:[], moods:[], platforms:[], rrssStyle:[],
  competitors:'', likes:'', dislikes:'', notes:'',
}

/* ══════════════════════════════════════════════════════════
   PROMPT BUILDER
══════════════════════════════════════════════════════════ */
function buildPrompt(f) {
  return `Eres un director creativo senior especializado en branding y diseño de identidad visual.
Analiza el siguiente brief de cliente y genera un informe estructurado de referencias visuales.

BRIEF:
- Marca/Cliente: ${f.name}
- Industria: ${f.industry}
- Descripción: ${f.description}
- Valores: ${f.values || 'No especificado'}
- USP: ${f.usp || 'No especificado'}
- Público objetivo: ${f.audiences.join(', ') || 'No especificado'}
- Competidores: ${f.competitors || 'No especificado'}
- Le gusta: ${f.likes || 'No especificado'}
- No quiere: ${f.dislikes || 'No especificado'}
- Mood: ${f.moods.join(', ') || 'No especificado'}
- Plataformas RRSS: ${f.platforms.join(', ') || 'No especificado'}
- Estilo RRSS: ${f.rrssStyle.join(', ') || 'No especificado'}
- Notas: ${f.notes || 'Ninguna'}

Genera el informe con EXACTAMENTE estas secciones con ##:

## ARQUETIPO DE MARCA
Identifica el arquetipo Jung dominante, posicionamiento, tono de voz y diferencial visual (4-5 oraciones).

## REFERENCIAS DE LOGOTIPO
Lista 5 marcas reales. Formato: Nombre – Tipo de construcción y por qué aplica específicamente.

## MARCAS DE REFERENCIA ESTÉTICA
Lista 6 marcas con identidad visual inspiradora. Formato: Nombre – Razón concreta.

## DIRECCIÓN DE PALETA
5 colores con hex (#XXXXXX). Nombre creativo para la paleta. Lógica emocional.

## TIPOGRAFÍAS SUGERIDAS
3 tipografías de Google Fonts. Formato: Nombre – Rol – Carácter para esta marca.

## IDENTIDAD VISUAL EN REDES SOCIALES
Dirección para feed, stories y plataformas. Grilla Instagram si aplica.

## CUENTAS DE REFERENCIA PARA RRSS
7 cuentas reales. Formato: @handle – Por qué referenciar.

## KEYWORDS VISUALES
8 palabras clave visuales. Luego 2 oraciones del "mundo visual" de la marca.

Sé específico, usa referencias reales y actuales.`.trim()
}

/* ══════════════════════════════════════════════════════════
   PARSERS
══════════════════════════════════════════════════════════ */
function parseSection(text, ...keys) {
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
    .filter(l => l.length > 4).slice(0, max)
}

function extractHex(text) {
  return [...new Set((text || '').match(/#[A-Fa-f0-9]{6}/g) || [])].slice(0, 7)
}

function splitND(str) {
  const m = str.match(/[-–—:]/)
  if (!m) return [str, '']
  const i = str.indexOf(m[0])
  return [str.slice(0, i).trim(), str.slice(i + 1).trim()]
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
   SMALL COMPONENTS
══════════════════════════════════════════════════════════ */
function Card({ accent = 'purple', icon, title, sub, children, style = {} }) {
  const C = { purple:T.purple, orange:T.orange, green:T.green, white:'rgba(255,255,255,.25)' }
  const B = { purple:T.purpleDim, orange:T.orangeDim, green:T.greenDim, white:'rgba(255,255,255,.07)' }
  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:28, marginBottom:20, position:'relative', overflow:'hidden', animation:'fadeUp .5s ease', ...style }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:C[accent] || accent }} />
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <div style={{ width:38, height:38, borderRadius:9, background:B[accent] || T.purpleDim, color:C[accent] || T.purple, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Unbounded,sans-serif', fontSize:13, fontWeight:900, flexShrink:0 }}>{icon}</div>
        <div>
          <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:12, fontWeight:700 }}>{title}</div>
          {sub && <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function RefList({ text, color = T.purple, max = 6 }) {
  const items = toItems(text, max)
  if (!items.length) return <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{text}</p>
  return (
    <div>
      {items.map((item, i) => {
        const [name, desc] = splitND(item)
        return (
          <div key={i} style={{ display:'flex', gap:14, padding:'12px 0', borderBottom:`1px solid ${T.border}` }}>
            <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:10, fontWeight:700, color, width:22, flexShrink:0, paddingTop:2 }}>
              {String(i+1).padStart(2,'0')}
            </span>
            <div>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{name}</div>
              {desc && <div style={{ fontSize:12, color:T.muted, lineHeight:1.55 }}>{desc}</div>}
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
          border: selected.includes(o) ? '1px solid #7d03ff' : `1px solid ${T.border}`,
          background: selected.includes(o) ? '#7d03ff' : 'transparent',
          color: selected.includes(o) ? '#fff' : T.muted,
          fontWeight: selected.includes(o) ? 500 : 400,
        }}>{o}</button>
      ))}
    </div>
  )
}

const KW_STYLES = [
  { bg:T.purpleDim, border:T.purpleBorder, color:'#b06bff' },
  { bg:T.orangeDim, border:T.orangeBorder, color:T.orange   },
  { bg:T.greenDim,  border:T.greenBorder,  color:T.green    },
  { bg:'rgba(255,255,255,.07)', border:T.border, color:'rgba(255,255,255,.7)' },
]

/* ══════════════════════════════════════════════════════════
   HISTORY PANEL
══════════════════════════════════════════════════════════ */
function HistoryPanel({ history = [], onRestore }) {
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
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding:'9px 18px', background:T.card2, border:`1px solid ${T.border}`, borderRadius:9,
          color:T.muted, fontFamily:'Poppins,sans-serif', fontSize:12, fontWeight:500, transition:'all .2s',
          display:'flex', alignItems:'center', gap:8,
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = T.purpleBorder}
        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
      >
        🕐 Historial <span style={{ background:T.purple, color:'#fff', borderRadius:99, padding:'1px 8px', fontSize:10, fontFamily:'Unbounded,sans-serif', fontWeight:700 }}>{history.length}</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', right:0, width:320,
          background:'#1a1a1a', border:`1px solid ${T.border}`, borderRadius:14,
          padding:16, zIndex:50, boxShadow:'0 20px 60px rgba(0,0,0,.6)',
          animation:'fadeUp .25s ease',
        }}>
          <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.muted, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
            Versiones anteriores
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:280, overflowY:'auto' }}>
            {[...history].reverse().map((h, i) => (
              <div key={i} style={{
                background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px',
                cursor:'pointer', transition:'all .2s',
              }}
              onClick={() => { onRestore(h); setOpen(false) }}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.purpleBorder}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple }}>
                    Versión {history.length - i}
                  </span>
                  <span style={{ fontSize:10, color:T.muted }}>{timeAgo(h.savedAt)}</span>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', lineHeight:1.5 }}>
                  {h.result?.substring(0, 80)}...
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
   RESULTS VIEW — DUAL MODE
══════════════════════════════════════════════════════════ */
function ResultsView({ raw, brief, mode }) {
  const isClient = mode === 'client'

  const s = {
    archetype: parseSection(raw, 'ARQUETIPO'),
    logos:     parseSection(raw, 'LOGOTIPO', 'LOGO'),
    brands:    parseSection(raw, 'ESTÉTICA', 'MARCAS DE REFERENCIA'),
    colors:    parseSection(raw, 'PALETA', 'DIRECCIÓN DE PALETA'),
    typo:      parseSection(raw, 'TIPOGRAF'),
    rrss:      parseSection(raw, 'IDENTIDAD VISUAL EN REDES', 'IDENTIDAD VISUAL'),
    accounts:  parseSection(raw, 'CUENTAS DE REFERENCIA', 'CUENTAS PARA'),
    keywords:  parseSection(raw, 'KEYWORDS', 'PALABRAS CLAVE'),
  }

  const hexes    = extractHex(s.colors)
  const kwords   = toItems(s.keywords, 8)
  const accounts = toItems(s.accounts, 7)

  /* ── CLIENT VIEW ── */
  if (isClient) return (
    <div>
      {/* Client hero */}
      <div style={{ textAlign:'center', padding:'40px 0 32px', borderBottom:`1px solid ${T.border}`, marginBottom:36 }}>
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.muted, letterSpacing:4, marginBottom:12 }}>
          Avalon World Agency — Propuesta Visual
        </div>
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:'clamp(22px,4vw,40px)', fontWeight:900, lineHeight:1.05, marginBottom:12 }}>
          Universo Visual<br/>
          <span style={{ background:`linear-gradient(120deg,${T.purple},${T.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            {brief.name}
          </span>
        </div>
        <p style={{ fontSize:14, color:T.muted, maxWidth:460, margin:'0 auto', lineHeight:1.7 }}>
          Seleccionamos referencias que capturan la esencia y dirección visual de tu marca.
        </p>
      </div>

      {s.archetype && (
        <Card accent="purple" icon="◉" title="Posicionamiento de Marca" sub="Arquetipo y esencia">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{s.archetype}</p>
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {s.brands && (
          <Card accent="orange" icon="★" title="Marcas que Inspiran" sub="Referencias estéticas">
            <RefList text={s.brands} color={T.orange} max={6} />
          </Card>
        )}
        {s.logos && (
          <Card accent="white" icon="✦" title="Estilos de Logotipo" sub="Construcciones a explorar">
            <RefList text={s.logos} color="rgba(255,255,255,.4)" max={5} />
          </Card>
        )}
      </div>

      {s.colors && (
        <Card accent="purple" icon="◈" title="Universo de Color" sub="Dirección cromática propuesta">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{s.colors}</p>
          {hexes.length > 0 && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
              {hexes.map((h,i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                  <div style={{ width:50, height:50, borderRadius:10, background:h, border:`1px solid ${T.border}` }}/>
                  <span style={{ fontSize:10, color:T.muted, fontFamily:'monospace' }}>{h}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {s.rrss && (
        <Card accent="green" icon="◎" title="Identidad en Redes Sociales" sub="Feed · Stories · Ecosistema digital">
          <p style={{ fontSize:13, color:'rgba(255,255,255,.72)', lineHeight:1.85 }}>{s.rrss}</p>
        </Card>
      )}

      {kwords.length > 0 && (
        <Card accent="white" icon="◐" title="Universo Visual" sub="Las palabras que definen tu marca">
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:14 }}>
            {kwords.map((k,i) => {
              const st = KW_STYLES[i % 4]
              return <span key={i} style={{ padding:'7px 16px', borderRadius:99, fontSize:12, fontWeight:500, background:st.bg, border:`1px solid ${st.border}`, color:st.color }}>{k}</span>
            })}
          </div>
        </Card>
      )}
    </div>
  )

  /* ── DESIGNER VIEW (default) ── */
  return (
    <div>
      {s.archetype && (
        <Card accent="purple" icon="◉" title="Arquetipo de Marca" sub="Posicionamiento · Tono de voz · Diferencial visual">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{s.archetype}</p>
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {s.logos && (
          <Card accent="orange" icon="✦" title="Referencias de Logotipo" sub="Estilos y construcción técnica">
            <RefList text={s.logos} color={T.orange} max={5} />
          </Card>
        )}
        {s.brands && (
          <Card accent="white" icon="★" title="Marcas de Referencia" sub="Inspiración cross-industry">
            <RefList text={s.brands} color="rgba(255,255,255,.4)" max={6} />
          </Card>
        )}
      </div>

      {s.colors && (
        <Card accent="purple" icon="◈" title="Dirección de Paleta" sub="Propuesta cromática con lógica emocional">
          <p style={{ fontSize:14, color:'rgba(255,255,255,.72)', lineHeight:1.88 }}>{s.colors}</p>
          {hexes.length > 0 && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
              {hexes.map((h,i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                  <div style={{ width:50, height:50, borderRadius:10, background:h, border:`1px solid ${T.border}` }}/>
                  <span style={{ fontSize:10, color:T.muted, fontFamily:'monospace' }}>{h}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {s.typo && (
          <Card accent="orange" icon="Aa" title="Tipografías Sugeridas" sub="Display · Cuerpo · UI">
            <RefList text={s.typo} color={T.orange} max={4} />
          </Card>
        )}
        {s.rrss && (
          <Card accent="green" icon="◎" title="Identidad Visual en RRSS" sub="Feed · Stories · Grilla · Recursos">
            <p style={{ fontSize:13, color:'rgba(255,255,255,.72)', lineHeight:1.85 }}>{s.rrss}</p>
          </Card>
        )}
      </div>

      {accounts.length > 0 && (
        <Card accent="green" icon="@" title="Cuentas de Referencia para RRSS" sub="Estudios, agencias y marcas a seguir">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
            {accounts.map((a,i) => {
              const [handle, why] = splitND(a)
              return (
                <div key={i} style={{ background:T.card2, border:`1px solid ${T.border}`, borderRadius:12, padding:16 }}>
                  <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:11, fontWeight:700, color:T.green, marginBottom:5 }}>
                    {handle.startsWith('@') ? handle : `@${handle}`}
                  </div>
                  <div style={{ fontSize:12, color:T.muted, lineHeight:1.5 }}>{why}</div>
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
              const st = KW_STYLES[i % 4]
              return <span key={i} style={{ padding:'7px 16px', borderRadius:99, fontSize:12, fontWeight:500, background:st.bg, border:`1px solid ${st.border}`, color:st.color }}>{k}</span>
            })}
          </div>
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
  const [form, setForm]           = useState(INIT_FORM)
  const [step, setStep]           = useState(1)
  const [phase, setPhase]         = useState('form')   // 'form' | 'loading' | 'done'
  const [result, setResult]       = useState('')
  const [mode, setMode]           = useState('designer') // 'designer' | 'client'
  const [error, setError]         = useState('')
  const [saveStatus, setSaveStatus] = useState('')       // '' | 'saving' | 'saved'
  const [history, setHistory]     = useState([])
  const projectIdRef = useRef(project?.id || null)
  const saveTimerRef = useRef(null)

  /* ── Load existing project ── */
  useEffect(() => {
    if (project) {
      setForm(project.brief || INIT_FORM)
      setHistory(project.history || [])
      if (project.result) {
        setResult(project.result)
        setPhase('done')
      }
    }
  }, [project])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tog = (k, v) => setForm(p => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v]
  }))

  /* ── Autosave ── */
  const saveToFirestore = useCallback(async (brief, resultData, status, addToHistory = false) => {
    if (!user) return
    setSaveStatus('saving')
    try {
      const payload = {
        userId: user.uid,
        clientName: brief.name || 'Sin nombre',
        brief,
        status,
        updatedAt: serverTimestamp(),
      }
      if (resultData) payload.result = resultData

      if (projectIdRef.current) {
        const updatePayload = { ...payload }
        if (addToHistory && resultData) {
          updatePayload.history = arrayUnion({
            result: resultData,
            savedAt: new Date().toISOString(),
          })
        }
        await updateDoc(doc(db, 'projects', projectIdRef.current), updatePayload)
      } else {
        const ref = await addDoc(collection(db, 'projects'), {
          ...payload, createdAt: serverTimestamp(), history: [],
        })
        projectIdRef.current = ref.id
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2500)
    } catch (e) {
      console.error('Save error:', e)
      setSaveStatus('')
    }
  }, [user])

  /* Debounced autosave on form change */
  useEffect(() => {
    if (phase !== 'form' || !form.name) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveToFirestore(form, null, 'draft'), 3000)
    return () => clearTimeout(saveTimerRef.current)
  }, [form, phase, saveToFirestore])

  /* ── Validation ── */
  const validate = () => {
    if (step === 1 && (!form.name || !form.industry || !form.description)) {
      setError('Completá nombre, industria y descripción para continuar.')
      return false
    }
    setError(''); return true
  }

  const next = () => { if (!validate()) return; setStep(s => Math.min(s+1, 3)) }
  const back = () => { setError(''); setStep(s => Math.max(s-1, 1)) }

  /* ── Generate ── */
  const generate = async () => {
    if (!validate()) return
    setPhase('loading')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2200,
          messages: [{ role:'user', content:buildPrompt(form) }],
        }),
      })
      const data = await res.json()
      const txt  = (data.content || []).map(b => b.text || '').join('')
      if (!txt) throw new Error('Sin respuesta')
      setResult(txt)
      setHistory(h => [...h, { result: txt, savedAt: new Date().toISOString() }])
      setPhase('done')
      await saveToFirestore(form, txt, 'completed', true)
    } catch {
      setError('Error al generar. Verificá la conexión e intentá nuevamente.')
      setPhase('form')
    }
  }

  const resetToNew = () => {
    setForm(INIT_FORM); setStep(1); setPhase('form')
    setResult(''); setError(''); projectIdRef.current = null
  }

  /* ── PDF Export ── */
  const handlePdfExport = () => openPdfWindow(result, form, mode)

  /* ── Input style ── */
  const inp = { background:'#181818', border:`1px solid rgba(255,255,255,.1)`, borderRadius:10, padding:'13px 16px', color:'#fff', fontSize:14, outline:'none', width:'100%' }

  /* ══════════════════════════════════════════════════════
     HEADER (shared)
  ══════════════════════════════════════════════════════ */
  const Header = () => (
    <header style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'16px 36px', borderBottom:`1px solid ${T.border}`,
      background:'rgba(11,11,11,.96)', backdropFilter:'blur(14px)',
      position:'sticky', top:0, zIndex:100,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.muted, fontSize:13, fontFamily:'Poppins,sans-serif', display:'flex', alignItems:'center', gap:6, transition:'color .2s', cursor:'pointer' }}
          onMouseEnter={e => e.currentTarget.style.color='#fff'}
          onMouseLeave={e => e.currentTarget.style.color=T.muted}
        >← Proyectos</button>
        <span style={{ color:'rgba(255,255,255,.2)' }}>|</span>
        <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:10, color:'rgba(255,255,255,.4)', letterSpacing:2 }}>
          {form.name || 'Nuevo proyecto'}
        </span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        {saveStatus === 'saving' && <span style={{ fontSize:11, color:T.muted, fontFamily:'Unbounded,sans-serif', letterSpacing:1 }}>Guardando...</span>}
        {saveStatus === 'saved'  && <span style={{ fontSize:11, color:T.green, fontFamily:'Unbounded,sans-serif', letterSpacing:1 }}>✓ Guardado</span>}
        <span style={{ fontFamily:'Unbounded,sans-serif', fontSize:8, fontWeight:700, background:T.green, color:'#000', padding:'5px 14px', borderRadius:99, letterSpacing:1.5 }}>AI CHALLENGE 2026</span>
      </div>
    </header>
  )

  /* ══ PROGRESS BAR ══ */
  const ProgressBar = () => (
    <div style={{ height:2, background:T.border }}>
      <div style={{ height:2, background:`linear-gradient(90deg,${T.purple},${T.orange})`, width: phase==='done' ? '100%' : `${((step-1)/3)*100}%`, transition:'width .5s' }} />
    </div>
  )

  /* ══════════════════════════════════════════════════════
     RENDER — FORM PHASE
  ══════════════════════════════════════════════════════ */
  if (phase === 'form') return (
    <div style={{ minHeight:'100vh', background:T.dark }}>
      <Header />
      <ProgressBar />

      {/* Hero */}
      <div style={{ padding:'56px 36px 40px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-80, left:'50%', transform:'translateX(-50%)', width:700, height:380, background:'radial-gradient(ellipse at 50% 0%,rgba(125,3,255,.18) 0%,transparent 65%)', pointerEvents:'none' }} />
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.orange, letterSpacing:4, textTransform:'uppercase', marginBottom:16 }}>★ Diseño · Branding · IA</div>
        <h1 style={{ fontFamily:'Unbounded,sans-serif', fontWeight:900, fontSize:'clamp(28px,5vw,50px)', lineHeight:1.0, marginBottom:18 }}>
          Visual{' '}
          <span style={{ background:`linear-gradient(120deg,${T.purple},${T.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            Reference Hunter
          </span>
        </h1>
        <p style={{ fontSize:15, color:T.muted, maxWidth:480, margin:'0 auto', lineHeight:1.75 }}>
          Completá el brief del cliente y la IA genera referencias de branding, logotipo, paleta, tipografías e identidad en redes.
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ display:'flex', justifyContent:'center', alignItems:'flex-start', marginBottom:40 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Unbounded,sans-serif', fontSize:10, fontWeight:700, transition:'all .3s', border: step===i+1 ? `2px solid ${T.purple}` : step>i+1 ? `2px solid ${T.purple}` : `2px solid ${T.border}`, background: step===i+1 ? T.purple : step>i+1 ? T.purpleDim : T.card, color: step===i+1 ? '#fff' : step>i+1 ? T.purple : T.muted }}>
                {step>i+1 ? '✓' : s.n}
              </div>
              <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:step===i+1 ? '#fff' : T.muted, letterSpacing:1 }}>{s.label}</div>
            </div>
            {i < STEPS.length-1 && <div style={{ width:52, height:2, background:step>i+1 ? T.purple : T.border, margin:'0 6px', marginTop:-16, transition:'background .3s' }} />}
          </div>
        ))}
      </div>

      {/* Form */}
      <div style={{ maxWidth:740, margin:'0 auto', padding:'0 36px 80px' }}>
        {/* Step 1 */}
        {step === 1 && (
          <div style={{ animation:'fadeUp .35s ease' }}>
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:600, color:'rgba(255,255,255,.25)', letterSpacing:3, textTransform:'uppercase', marginBottom:18 }}>Datos de la marca</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>Nombre / Marca *</label>
                <input style={inp} placeholder="Ej: Frakxel" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>Industria *</label>
                <select style={inp} value={form.industry} onChange={e => set('industry', e.target.value)}>
                  <option value="">Seleccioná...</option>
                  {INDUSTRIES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, gridColumn:'1/-1' }}>
                <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>Descripción del negocio *</label>
                <textarea style={{ ...inp, resize:'vertical', minHeight:88, lineHeight:1.65 }} placeholder="¿Qué hace la marca? ¿Cuál es su propuesta de valor?" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>Valores <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
                <input style={inp} placeholder="Innovación, cercanía..." value={form.values} onChange={e => set('values', e.target.value)} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>USP / Diferencial <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span></label>
                <input style={inp} placeholder="Qué los hace únicos" value={form.usp} onChange={e => set('usp', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div style={{ animation:'fadeUp .35s ease' }}>
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:600, color:'rgba(255,255,255,.25)', letterSpacing:3, textTransform:'uppercase', marginBottom:18 }}>Audiencia y estilo</div>
            <div style={{ marginBottom:22 }}>
              <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase', display:'block', marginBottom:10 }}>Público objetivo</label>
              <Chips options={AUDIENCES} selected={form.audiences} onToggle={v => tog('audiences', v)} />
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase', display:'block', marginBottom:10 }}>Mood / Estilo buscado</label>
              <Chips options={MOODS} selected={form.moods} onToggle={v => tog('moods', v)} />
            </div>
            <hr style={{ border:'none', borderTop:`1px solid ${T.border}`, margin:'26px 0' }} />
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:600, color:'rgba(255,255,255,.25)', letterSpacing:3, textTransform:'uppercase', marginBottom:18 }}>Redes sociales</div>
            <div style={{ marginBottom:18 }}>
              <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase', display:'block', marginBottom:10 }}>Plataformas prioritarias</label>
              <Chips options={PLATFORMS} selected={form.platforms} onToggle={v => tog('platforms', v)} />
            </div>
            <div>
              <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase', display:'block', marginBottom:10 }}>Estilo visual en RRSS</label>
              <Chips options={RRSS_STYLES} selected={form.rrssStyle} onToggle={v => tog('rrssStyle', v)} />
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div style={{ animation:'fadeUp .35s ease' }}>
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:600, color:'rgba(255,255,255,.25)', letterSpacing:3, textTransform:'uppercase', marginBottom:18 }}>Contexto competitivo</div>
            {[
              { label:'Competidores o marcas mencionadas', key:'competitors', ph:'Ej: Patagonia, Nike...' },
              { label:'Marcas / estilos que le gustan', key:'likes', ph:'Ej: les gusta el estilo de Apple' },
              { label:'Qué definitivamente NO quieren', key:'dislikes', ph:'Colores, estilos, tipografías a evitar...' },
            ].map(({ label, key, ph }) => (
              <div key={key} style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>
                  {label} <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span>
                </label>
                <input style={inp} placeholder={ph} value={form[key]} onChange={e => set(key, e.target.value)} />
              </div>
            ))}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <label style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color:T.purple, letterSpacing:2.5, textTransform:'uppercase' }}>
                Notas adicionales <span style={{ color:T.muted, fontSize:8, fontWeight:400 }}>(opcional)</span>
              </label>
              <textarea style={{ ...inp, resize:'vertical', minHeight:80, lineHeight:1.65 }} placeholder="Cualquier otro detalle relevante del brief..." value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        )}

        {error && <div style={{ background:'rgba(255,60,60,.08)', border:'1px solid rgba(255,60,60,.3)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#ff8888', marginBottom:14, marginTop:14 }}>{error}</div>}

        <div style={{ display:'flex', gap:12, marginTop:20 }}>
          {step > 1 && <button onClick={back} style={{ flex:'0 0 auto', padding:'14px 24px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:10, color:T.muted, fontSize:13, transition:'all .2s' }}>← Atrás</button>}
          {step < 3 && <button onClick={next} style={{ flex:1, padding:15, background:T.purple, border:'none', borderRadius:10, color:'#fff', fontFamily:'Unbounded,sans-serif', fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase' }}>Siguiente →</button>}
          {step === 3 && <button onClick={generate} style={{ flex:1, padding:18, background:`linear-gradient(135deg,${T.purple},#9b35ff)`, border:'none', borderRadius:12, color:'#fff', fontFamily:'Unbounded,sans-serif', fontSize:12, fontWeight:700, letterSpacing:2, textTransform:'uppercase' }}>Generar Referencias Visuales ✦</button>}
        </div>
      </div>
    </div>
  )

  /* ══════════════════════════════════════════════════════
     RENDER — LOADING
  ══════════════════════════════════════════════════════ */
  if (phase === 'loading') return (
    <div style={{ minHeight:'100vh', background:T.dark }}>
      <Header />
      <ProgressBar />
      <div style={{ textAlign:'center', padding:'100px 36px' }}>
        <div style={{ width:52, height:52, border:`3px solid ${T.purpleDim}`, borderTopColor:T.purple, borderRadius:'50%', animation:'spin .85s linear infinite', margin:'0 auto 28px' }} />
        <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:20, fontWeight:700, marginBottom:10 }}>Analizando brief...</div>
        <p style={{ fontSize:13, color:T.muted, marginBottom:28 }}>Buscando referencias de branding e identidad visual</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:420, margin:'0 auto' }}>
          {['Arquetipo de marca','Referencias de logo','Paleta cromática','Cuentas RRSS'].map((t,i) => (
            <span key={i} style={{ padding:'5px 14px', borderRadius:99, border:`1px solid ${T.purpleBorder}`, fontSize:11, color:T.purple, animation:`pulse 2s ease-in-out ${i*.3}s infinite` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )

  /* ══════════════════════════════════════════════════════
     RENDER — RESULTS
  ══════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:'100vh', background:T.dark }}>
      <Header />
      <ProgressBar />

      <div style={{ maxWidth:960, margin:'0 auto', padding:'40px 36px 100px' }}>

        {/* Results toolbar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32, flexWrap:'wrap', gap:12 }}>

          {/* Left: client name + action buttons */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, color:T.orange, letterSpacing:3, textTransform:'uppercase', marginBottom:6 }}>★ Referencias · {form.name}</div>
              <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:20, fontWeight:900 }}>{form.name}</div>
            </div>
          </div>

          {/* Right: controls */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>

            {/* Mode toggle */}
            <div style={{ display:'flex', gap:3, padding:4, background:T.card2, borderRadius:10 }}>
              {[
                { key:'designer', label:'Diseñadores', icon:'◉' },
                { key:'client',   label:'Cliente',     icon:'★' },
              ].map(m => (
                <button key={m.key} onClick={() => setMode(m.key)} style={{
                  padding:'9px 18px', borderRadius:7, border:'none', cursor:'pointer',
                  fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, letterSpacing:1.5,
                  textTransform:'uppercase', transition:'all .25s',
                  background: mode === m.key ? T.purple : 'transparent',
                  color: mode === m.key ? '#fff' : T.muted,
                  boxShadow: mode === m.key ? `0 4px 14px ${T.purpleDim}` : 'none',
                }}>{m.icon} {m.label}</button>
              ))}
            </div>

            {/* History */}
            <HistoryPanel history={history} onRestore={h => { setResult(h.result) }} />

            {/* PDF Export */}
            <button
              onClick={handlePdfExport}
              style={{
                padding:'9px 20px', background:T.card2,
                border:`1px solid ${T.orangeBorder}`, borderRadius:9,
                color:T.orange, fontFamily:'Unbounded,sans-serif', fontSize:9,
                fontWeight:700, letterSpacing:1.5, textTransform:'uppercase',
                display:'flex', alignItems:'center', gap:8, transition:'all .25s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.orangeDim }}
              onMouseLeave={e => { e.currentTarget.style.background = T.card2 }}
            >
              ↓ Exportar PDF
            </button>

            {/* Regenerate + New */}
            <button onClick={() => { setPhase('form'); setStep(1) }} style={{ padding:'9px 18px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:9, color:T.muted, fontSize:12, transition:'all .2s' }}>← Editar Brief</button>
            <button onClick={generate} style={{ padding:'9px 18px', background:T.purpleDim, border:`1px solid ${T.purpleBorder}`, borderRadius:9, color:'#b06bff', fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, letterSpacing:1, textTransform:'uppercase', transition:'all .2s' }}>↺ Regenerar</button>
            <button onClick={resetToNew} style={{ padding:'9px 18px', background:T.card2, border:`1px solid ${T.border}`, borderRadius:9, color:T.muted, fontSize:12, transition:'all .2s' }}>+ Nuevo</button>
          </div>
        </div>

        {/* Mode description strip */}
        <div style={{
          padding:'10px 18px', borderRadius:10, marginBottom:28,
          background: mode === 'client' ? 'rgba(0,255,0,.05)' : T.purpleDim,
          border: `1px solid ${mode === 'client' ? T.greenBorder : T.purpleBorder}`,
          display:'flex', alignItems:'center', gap:10,
        }}>
          <span style={{ fontSize:14 }}>{mode === 'client' ? '★' : '◉'}</span>
          <div>
            <div style={{ fontFamily:'Unbounded,sans-serif', fontSize:9, fontWeight:700, color: mode === 'client' ? T.green : T.purple, letterSpacing:1.5, textTransform:'uppercase' }}>
              {mode === 'client' ? 'Vista Presentación Cliente' : 'Vista Interna Diseñadores'}
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
              {mode === 'client'
                ? 'Versión limpia para mostrar al cliente. Ocultando detalles técnicos internos.'
                : 'Versión completa con justificaciones técnicas, construcción de logotipos y referencias de RRSS.'}
            </div>
          </div>
          <button onClick={handlePdfExport} style={{ marginLeft:'auto', padding:'7px 16px', background:'transparent', border:`1px solid ${T.border}`, borderRadius:7, color:T.muted, fontSize:11, whiteSpace:'nowrap', cursor:'pointer' }}>
            ↓ PDF esta vista
          </button>
        </div>

        {/* Results */}
        <ResultsView raw={result} brief={form} mode={mode} />

      </div>

      {/* Footer */}
      <div style={{ textAlign:'center', padding:24, borderTop:`1px solid ${T.border}`, fontFamily:'Unbounded,sans-serif', fontSize:8, color:'rgba(255,255,255,.18)', letterSpacing:3 }}>
        <span style={{ color:T.purple, marginRight:8 }}>★ ★ ★</span>
        AVALON WORLD AGENCY · AI CHALLENGE 2026 · ÁREA DISEÑO
      </div>
    </div>
  )
}

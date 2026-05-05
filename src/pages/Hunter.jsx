import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { openPdfWindow } from '../utils/pdfExport'

const PROXY_URL = 'https://tiny-union-cf64anthropic-proxy.eli-587.workers.dev/'

const MOODS = ['Minimalista','Bold & Disruptivo','Sofisticado / Luxury','Orgánico / Natural','Tech / Futurista','Playful / Colorido','Editorial / Artístico','Retro / Vintage','Corporativo / Serio']
const AUDIENCES = ['B2B Corporativo','B2C Masivo','Millennials (28-42)','Gen Z (18-27)','Adultos 40-60','Profesionales','Padres / Familias','Niche / Especializado']
const INDUSTRIES = ['Tecnología / SaaS','Salud & Wellness','Moda & Lifestyle','Gastronomía & Food','Finanzas & Fintech','Educación','Real Estate','Entretenimiento & Media','Retail & E-commerce','Servicios Profesionales','Startup / Scale-up','Arte & Cultura','Belleza & Cosmética','Deporte & Fitness','Turismo & Hospitalidad']
const PLATFORMS = ['Instagram','TikTok','LinkedIn','Pinterest','YouTube','X / Twitter']
const RRSS_STYLES = ['Fotográfico editorial','Ilustración / Ilustrativo','Tipográfico / Text-based','Minimalista limpio','Colorido & vibrante','Dark / Oscuro','Texturas & Collage','3D / CGI']
const STEPS = [{n:'01',label:'Marca'},{n:'02',label:'Audiencia'},{n:'03',label:'Contexto'}]
const INIT_FORM = { name:'', websiteUrl:'', industry:'', description:'', values:'', usp:'', audiences:[], moods:[], platforms:[], rrssStyle:[], competitors:'', likes:'', dislikes:'', notes:'' }

const T = {
  purple:'#7d03ff', orange:'#ff7939', green:'#00ff00',
  purpleDim:'rgba(125,3,255,.14)', orangeDim:'rgba(255,121,57,.12)', greenDim:'rgba(0,255,0,.08)',
  purpleBorder:'rgba(125,3,255,.3)', orangeBorder:'rgba(255,121,57,.3)', greenBorder:'rgba(0,255,0,.2)',
  card:'#141414', card2:'#1a1a1a', dark:'#0b0b0b', border:'rgba(255,255,255,.07)', muted:'rgba(255,255,255,.45)',
}

function buildPrompt(f) {
  return `Eres un director creativo senior especializado en branding y diseño de identidad visual.
Analiza el siguiente brief y genera un informe COMPLETO de referencias visuales con links directos.

BRIEF DEL CLIENTE:
- Marca/Cliente: ${f.name || 'Sin nombre'}
- Web/Redes: ${f.websiteUrl || 'No especificado'}
- Industria: ${f.industry || 'No especificado'}
- Descripción: ${f.description || 'No especificado'}
- Valores: ${f.values || 'No especificado'}
- USP: ${f.usp || 'No especificado'}
- Público: ${f.audiences?.join(', ') || 'No especificado'}
- Competidores: ${f.competitors || 'No especificado'}
- Le gusta: ${f.likes || 'No especificado'}
- No quiere: ${f.dislikes || 'No especificado'}
- Mood: ${f.moods?.join(', ') || 'No especificado'}
- Plataformas RRSS: ${f.platforms?.join(', ') || 'No especificado'}
- Estilo RRSS: ${f.rrssStyle?.join(', ') || 'No especificado'}
- Notas: ${f.notes || 'Ninguna'}

Para CADA referencia incluí links directos entre []: ejemplo [https://instagram.com/marca]

Genera el informe con EXACTAMENTE estas secciones:

## ARQUETIPO DE MARCA
Arquetipo Jung dominante, posicionamiento, tono de voz y diferencial visual (4-5 oraciones).

## REFERENCIAS DE LOGOTIPO
5 marcas reales. Formato: Nombre - Construcción y por qué aplica [link]

## MARCAS DE REFERENCIA ESTÉTICA
6 marcas inspiradoras. Formato: Nombre - Razón [link]

## DIRECCIÓN DE PALETA
5 colores con hex (#XXXXXX). Nombre creativo. Lógica emocional. [link pinterest]

## TIPOGRAFÍAS SUGERIDAS
3 tipografías Google Fonts. Formato: Nombre - Rol - Carácter [https://fonts.google.com/specimen/...]

## IDENTIDAD VISUAL EN REDES SOCIALES
Dirección para feed, stories y plataformas. [links de referencia]

## CUENTAS DE REFERENCIA PARA RRSS
7 cuentas reales. Formato: @handle - Por qué [https://instagram.com/handle]

## KEYWORDS VISUALES
8 palabras clave. Descripción del mundo visual. [link pinterest moodboard]`.trim()
}

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

function toItems(t, m=7) { return (t||'').split('\n').map(l=>l.replace(/^[-•*\d.)]\s*/,'').trim()).filter(l=>l.length>4).slice(0,m) }
function extractHex(t) { return [...new Set((t||'').match(/#[A-Fa-f0-9]{6}/g)||[])].slice(0,7) }
function extractLinks(s) { return ((s||'').match(/\[https?:\/\/[^\]]+\]/g)||[]).map(m=>m.slice(1,-1)) }
function cleanText(s) { return (s||'').replace(/\[https?:\/\/[^\]]+\]/g,'').trim() }
function splitND(s) {
  const clean = cleanText(s), links = extractLinks(s), m = clean.match(/[-–—:]/)
  if (!m) return [clean,'',links]
  const i = clean.indexOf(m[0])
  return [clean.slice(0,i).trim(), clean.slice(i+1).trim(), links]
}

function LinkChip({ url }) {
  let label = '🔗 Ver'
  if (url.includes('instagram.com')) label = '📸 Instagram'
  else if (url.includes('pinterest.com')) label = '📌 Pinterest'
  else if (url.includes('behance.net')) label = '🎨 Behance'
  else if (url.includes('fonts.google.com')) label = 'Aa Google Fonts'
  else { try { label = `🔗 ${new URL(url).hostname.replace('www.','')}` } catch {} }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display:'inline-flex',alignItems:'center',gap:5,padding:'4px 12px',borderRadius:99,
      fontSize:11,fontWeight:500,background:'rgba(125,3,255,.1)',border:'1px solid rgba(125,3,255,.25)',
      color:'#b06bff',textDecoration:'none',transition:'all .2s',whiteSpace:'nowrap',
    }}>
      {label} ↗
    </a>
  )
}

function Card({ accent='purple', icon, title, sub, children, style={} }) {
  const C = {purple:T.purple,orange:T.orange,green:T.green,white:'rgba(255,255,255,.25)'}
  const B = {purple:T.purpleDim,orange:T.orangeDim,green:T.greenDim,white:'rgba(255,255,255,.07)'}
  return (
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,padding:28,marginBottom:20,position:'relative',overflow:'hidden',animation:'fadeUp .5s ease',...style}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:C[accent]||accent}}/>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <div style={{width:38,height:38,borderRadius:9,background:B[accent]||T.purpleDim,color:C[accent]||T.purple,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Unbounded,sans-serif',fontSize:13,fontWeight:900,flexShrink:0}}>{icon}</div>
        <div>
          <div style={{fontFamily:'Unbounded,sans-serif',fontSize:12,fontWeight:700}}>{title}</div>
          {sub && <div style={{fontSize:11,color:T.muted,marginTop:2}}>{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function RefList({ text, color=T.purple, max=6 }) {
  const items = toItems(text, max)
  if (!items.length) return <p style={{fontSize:14,color:'rgba(255,255,255,.72)',lineHeight:1.88}}>{cleanText(text)}</p>
  return (
    <div>
      {items.map((item,i) => {
        const [name,desc,links] = splitND(item)
        return (
          <div key={i} style={{padding:'12px 0',borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:'flex',gap:14}}>
              <span style={{fontFamily:'Unbounded,sans-serif',fontSize:10,fontWeight:700,color,width:22,flexShrink:0,paddingTop:2}}>{String(i+1).padStart(2,'0')}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{name}</div>
                {desc && <div style={{fontSize:12,color:T.muted,lineHeight:1.55,marginBottom:8}}>{desc}</div>}
                {links.length>0 && <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{links.map((url,j)=><LinkChip key={j} url={url}/>)}</div>}
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
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
      {options.map(o => (
        <button key={o} onClick={()=>onToggle(o)} style={{
          padding:'8px 16px',borderRadius:99,fontSize:12,cursor:'pointer',transition:'all .2s',
          border:selected.includes(o)?`1px solid ${T.purple}`:`1px solid ${T.border}`,
          background:selected.includes(o)?T.purple:'transparent',
          color:selected.includes(o)?'#fff':T.muted,fontWeight:selected.includes(o)?500:400,
        }}>{o}</button>
      ))}
    </div>
  )
}

const KW = [
  {bg:T.purpleDim,border:T.purpleBorder,color:'#b06bff'},
  {bg:T.orangeDim,border:T.orangeBorder,color:T.orange},
  {bg:T.greenDim,border:T.greenBorder,color:T.green},
  {bg:'rgba(255,255,255,.07)',border:T.border,color:'rgba(255,255,255,.7)'},
]

function HistoryPanel({ history=[], onRestore }) {
  const [open, setOpen] = useState(false)
  if (!history.length) return null
  function timeAgo(ts) {
    const d = ts?.toDate?ts.toDate():(ts?new Date(ts):new Date())
    const diff = (Date.now()-d.getTime())/1000
    if(diff<60) return 'ahora mismo'
    if(diff<3600) return `hace ${Math.floor(diff/60)} min`
    if(diff<86400) return `hace ${Math.floor(diff/3600)} hs`
    return `hace ${Math.floor(diff/86400)} días`
  }
  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{padding:'9px 16px',background:T.card2,border:`1px solid ${T.border}`,borderRadius:9,color:T.muted,fontSize:12,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        🕐 Historial <span style={{background:T.purple,color:'#fff',borderRadius:99,padding:'1px 7px',fontSize:10,fontFamily:'Unbounded,sans-serif',fontWeight:700}}>{history.length}</span>
      </button>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 8px)',right:0,width:300,background:'#1a1a1a',border:`1px solid ${T.border}`,borderRadius:14,padding:14,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,.7)',animation:'fadeUp .25s ease'}}>
          <div style={{fontFamily:'Unbounded,sans-serif',fontSize:9,color:T.muted,letterSpacing:2,textTransform:'uppercase',marginBottom:10}}>Versiones anteriores</div>
          <div style={{display:'flex',flexDirection:'column',gap:7,maxHeight:260,overflowY:'auto'}}>
            {[...history].reverse().map((h,i)=>(
              <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:9,padding:'11px 13px',cursor:'pointer'}} onClick={()=>{onRestore(h);setOpen(false)}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:700,color:T.purple}}>Versión {history.length-i}</span>
                  <span style={{fontSize:10,color:T.muted}}>{timeAgo(h.savedAt)}</span>
                </div>
                <div style={{fontSize:11,color:'rgba(255,255,255,.45)',lineHeight:1.5,overflow:'hidden',maxHeight:36}}>{h.result?.substring(0,90)}...</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultsView({ raw, brief, mode }) {
  const isClient = mode==='client'
  const s = {
    archetype:parseSection(raw,'ARQUETIPO'),
    logos:parseSection(raw,'LOGOTIPO','LOGO'),
    brands:parseSection(raw,'ESTÉTICA','MARCAS DE REFERENCIA'),
    colors:parseSection(raw,'PALETA','DIRECCIÓN DE PALETA'),
    typo:parseSection(raw,'TIPOGRAF'),
    rrss:parseSection(raw,'IDENTIDAD VISUAL EN REDES','IDENTIDAD VISUAL'),
    accounts:parseSection(raw,'CUENTAS DE REFERENCIA','CUENTAS PARA'),
    keywords:parseSection(raw,'KEYWORDS','PALABRAS CLAVE'),
  }
  const hexes = extractHex(s.colors)
  const kwords = toItems(s.keywords,8)
  const accounts = toItems(s.accounts,7)
  const colorLinks = extractLinks(s.colors)

  const Swatches = () => hexes.length>0 ? (
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
      {hexes.map((h,i)=>(
        <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
          <div style={{width:50,height:50,borderRadius:10,background:h,border:`1px solid ${T.border}`}}/>
          <span style={{fontSize:10,color:T.muted,fontFamily:'monospace'}}>{h}</span>
        </div>
      ))}
    </div>
  ) : null

  if (isClient) return (
    <div>
      <div style={{textAlign:'center',padding:'36px 0 28px',borderBottom:`1px solid ${T.border}`,marginBottom:32}}>
        <div style={{fontFamily:'Unbounded,sans-serif',fontSize:9,color:T.muted,letterSpacing:4,marginBottom:10}}>Avalon World Agency — Propuesta Visual</div>
        <div style={{fontFamily:'Unbounded,sans-serif',fontSize:'clamp(22px,4vw,38px)',fontWeight:900,lineHeight:1.05,marginBottom:10}}>
          Universo Visual<br/>
          <span style={{background:`linear-gradient(120deg,${T.purple},${T.orange})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>{brief.name}</span>
        </div>
        {brief.websiteUrl && <a href={brief.websiteUrl.startsWith('http')?brief.websiteUrl:`https://${brief.websiteUrl}`} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:T.purple,textDecoration:'none'}}>{brief.websiteUrl} ↗</a>}
      </div>
      {s.archetype&&<Card accent="purple" icon="◉" title="Posicionamiento de Marca" sub="Arquetipo y esencia"><p style={{fontSize:14,color:'rgba(255,255,255,.72)',lineHeight:1.88}}>{cleanText(s.archetype)}</p></Card>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {s.brands&&<Card accent="orange" icon="★" title="Marcas que Inspiran"><RefList text={s.brands} color={T.orange} max={6}/></Card>}
        {s.logos&&<Card accent="white" icon="✦" title="Estilos de Logotipo"><RefList text={s.logos} color="rgba(255,255,255,.4)" max={5}/></Card>}
      </div>
      {s.colors&&<Card accent="purple" icon="◈" title="Universo de Color"><p style={{fontSize:14,color:'rgba(255,255,255,.72)',lineHeight:1.88}}>{cleanText(s.colors)}</p><Swatches/>{colorLinks.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:12}}>{colorLinks.map((url,j)=><LinkChip key={j} url={url}/>)}</div>}</Card>}
      {s.rrss&&<Card accent="green" icon="◎" title="Identidad en Redes Sociales"><p style={{fontSize:13,color:'rgba(255,255,255,.72)',lineHeight:1.85}}>{cleanText(s.rrss)}</p>{extractLinks(s.rrss).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:10}}>{extractLinks(s.rrss).map((url,j)=><LinkChip key={j} url={url}/>)}</div>}</Card>}
      {kwords.length>0&&<Card accent="white" icon="◐" title="Universo Visual"><div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:14}}>{kwords.map((k,i)=>{const st=KW[i%4];return<span key={i} style={{padding:'7px 16px',borderRadius:99,fontSize:12,fontWeight:500,background:st.bg,border:`1px solid ${st.border}`,color:st.color}}>{cleanText(k)}</span>})}</div></Card>}
    </div>
  )

  return (
    <div>
      {s.archetype&&<Card accent="purple" icon="◉" title="Arquetipo de Marca" sub="Posicionamiento · Tono de voz · Diferencial visual"><p style={{fontSize:14,color:'rgba(255,255,255,.72)',lineHeight:1.88}}>{cleanText(s.archetype)}</p></Card>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {s.logos&&<Card accent="orange" icon="✦" title="Referencias de Logotipo" sub="Estilos y construcción técnica"><RefList text={s.logos} color={T.orange} max={5}/></Card>}
        {s.brands&&<Card accent="white" icon="★" title="Marcas de Referencia" sub="Inspiración cross-industry"><RefList text={s.brands} color="rgba(255,255,255,.4)" max={6}/></Card>}
      </div>
      {s.colors&&<Card accent="purple" icon="◈" title="Dirección de Paleta" sub="Propuesta cromática con lógica emocional"><p style={{fontSize:14,color:'rgba(255,255,255,.72)',lineHeight:1.88}}>{cleanText(s.colors)}</p><Swatches/>{colorLinks.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:12}}>{colorLinks.map((url,j)=><LinkChip key={j} url={url}/>)}</div>}</Card>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {s.typo&&<Card accent="orange" icon="Aa" title="Tipografías Sugeridas" sub="Display · Cuerpo · UI"><RefList text={s.typo} color={T.orange} max={4}/></Card>}
        {s.rrss&&<Card accent="green" icon="◎" title="Identidad Visual en RRSS" sub="Feed · Stories · Grilla"><p style={{fontSize:13,color:'rgba(255,255,255,.72)',lineHeight:1.85}}>{cleanText(s.rrss)}</p>{extractLinks(s.rrss).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:10}}>{extractLinks(s.rrss).map((url,j)=><LinkChip key={j} url={url}/>)}</div>}</Card>}
      </div>
      {accounts.length>0&&<Card accent="green" icon="@" title="Cuentas de Referencia para RRSS" sub="Estudios, agencias y marcas a seguir">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:4}}>
          {accounts.map((a,i)=>{
            const [handle,why,links] = splitND(a)
            return <div key={i} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{fontFamily:'Unbounded,sans-serif',fontSize:11,fontWeight:700,color:T.green,marginBottom:5}}>{handle.startsWith('@')?handle:`@${cleanText(handle)}`}</div>
              {why&&<div style={{fontSize:12,color:T.muted,lineHeight:1.5,marginBottom:8}}>{why}</div>}
              {links.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6}}>{links.map((url,j)=><LinkChip key={j} url={url}/>)}</div>}
            </div>
          })}
        </div>
      </Card>}
      {kwords.length>0&&<Card accent="white" icon="◐" title="Keywords Visuales" sub="Palabras que guían cada decisión creativa">
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:14}}>{kwords.map((k,i)=>{const st=KW[i%4];return<span key={i} style={{padding:'7px 16px',borderRadius:99,fontSize:12,fontWeight:500,background:st.bg,border:`1px solid ${st.border}`,color:st.color}}>{cleanText(k)}</span>})}</div>
        {extractLinks(s.keywords).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:14}}>{extractLinks(s.keywords).map((url,j)=><LinkChip key={j} url={url}/>)}</div>}
      </Card>}
    </div>
  )
}

export default function Hunter({ project, onBack }) {
  const { user } = useAuth()
  const [form, setForm] = useState(INIT_FORM)
  const [step, setStep] = useState(1)
  const [phase, setPhase] = useState('form')
  const [result, setResult] = useState('')
  const [mode, setMode] = useState('designer')
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [history, setHistory] = useState([])
  const projectIdRef = useRef(project?.id || null)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    if (project) {
      setForm(project.brief || INIT_FORM)
      setHistory(project.history || [])
      if (project.result) { setResult(project.result); setPhase('done') }
    }
  }, [project])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tog = (k, v) => setForm(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))

  const saveToFirestore = useCallback(async (brief, resultData, status, addToHistory=false) => {
    if (!user) return
    setSaveStatus('saving')
    try {
      const payload = { userId:user.uid, clientName:brief.name||'Sin nombre', brief, status, updatedAt:serverTimestamp() }
      if (resultData) payload.result = resultData
      if (projectIdRef.current) {
        const up = {...payload}
        if (addToHistory && resultData) up.history = arrayUnion({ result:resultData, savedAt:new Date().toISOString() })
        await updateDoc(doc(db,'projects',projectIdRef.current), up)
      } else {
        const r = await addDoc(collection(db,'projects'), {...payload, createdAt:serverTimestamp(), history:[]})
        projectIdRef.current = r.id
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2500)
    } catch(e) { console.error('Save error:',e); setSaveStatus('') }
  }, [user])

  useEffect(() => {
    if (phase !== 'form' || !form.name) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveToFirestore(form, null, 'draft'), 3000)
    return () => clearTimeout(saveTimerRef.current)
  }, [form, phase, saveToFirestore])

  const validate = () => {
    if (!form.name.trim()) { setError('Ingresá al menos el nombre del cliente.'); return false }
    setError(''); return true
  }

  const next = () => { if (!validate()) return; setStep(s => Math.min(s+1,3)) }
  const back = () => { setError(''); setStep(s => Math.max(s-1,1)) }

  const generate = async () => {
    if (!validate()) return
    setPhase('loading')
    try {
      const res = await fetch(PROXY_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:2500,
          messages:[{role:'user',content:buildPrompt(form)}],
        }),
      })
      const data = await res.json()
      const txt = (data.content||[]).map(b=>b.text||'').join('')
      if (!txt) throw new Error(data.error?.message||'Sin respuesta')
      setResult(txt)
      setHistory(h=>[...h,{result:txt,savedAt:new Date().toISOString()}])
      setPhase('done')
      await saveToFirestore(form, txt, 'completed', true)
    } catch(e) {
      setError(`Error: ${e.message}`)
      setPhase('form')
    }
  }

  const resetToNew = () => { setForm(INIT_FORM); setStep(1); setPhase('form'); setResult(''); setError(''); projectIdRef.current=null }
  const handlePdf = () => openPdfWindow(result, form, mode)

  const inp = {background:'#181818',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,padding:'13px 16px',color:'#fff',fontSize:14,outline:'none',width:'100%'}
  const sLbl = {fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:600,color:'rgba(255,255,255,.25)',letterSpacing:3,textTransform:'uppercase',marginBottom:18}
  const fLbl = {fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:700,color:T.purple,letterSpacing:2.5,textTransform:'uppercase',display:'block',marginBottom:8}

  const Header = () => (
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 32px',borderBottom:`1px solid ${T.border}`,background:'rgba(11,11,11,.97)',backdropFilter:'blur(14px)',position:'sticky',top:0,zIndex:100}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:T.muted,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>← Proyectos</button>
        <span style={{color:'rgba(255,255,255,.15)'}}>|</span>
        <span style={{fontFamily:'Unbounded,sans-serif',fontSize:10,color:'rgba(255,255,255,.35)',letterSpacing:2}}>{form.name||'Nuevo proyecto'}</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        {saveStatus==='saving'&&<span style={{fontSize:11,color:T.muted,fontFamily:'Unbounded,sans-serif',letterSpacing:1}}>Guardando...</span>}
        {saveStatus==='saved'&&<span style={{fontSize:11,color:T.green,fontFamily:'Unbounded,sans-serif',letterSpacing:1}}>✓ Guardado</span>}
        <span style={{fontFamily:'Unbounded,sans-serif',fontSize:8,fontWeight:700,background:T.green,color:'#000',padding:'5px 12px',borderRadius:99,letterSpacing:1.5}}>AVALON · 2026</span>
      </div>
    </header>
  )

  const ProgBar = () => (
    <div style={{height:2,background:T.border}}>
      <div style={{height:2,background:`linear-gradient(90deg,${T.purple},${T.orange})`,width:phase==='done'?'100%':`${((step-1)/3)*100}%`,transition:'width .5s'}}/>
    </div>
  )

  if (phase==='form') return (
    <div style={{minHeight:'100vh',background:T.dark}}>
      <Header/><ProgBar/>
      <div style={{padding:'52px 32px 36px',textAlign:'center',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-80,left:'50%',transform:'translateX(-50%)',width:700,height:380,background:'radial-gradient(ellipse at 50% 0%,rgba(125,3,255,.18) 0%,transparent 65%)',pointerEvents:'none'}}/>
        <div style={{fontFamily:'Unbounded,sans-serif',fontSize:9,color:T.orange,letterSpacing:4,textTransform:'uppercase',marginBottom:14}}>★ Diseño · Branding · IA</div>
        <h1 style={{fontFamily:'Unbounded,sans-serif',fontWeight:900,fontSize:'clamp(26px,5vw,48px)',lineHeight:1.0,marginBottom:16}}>
          Visual <span style={{background:`linear-gradient(120deg,${T.purple},${T.orange})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>Reference Hunter</span>
        </h1>
        <p style={{fontSize:14,color:T.muted,maxWidth:500,margin:'0 auto',lineHeight:1.75}}>Solo el nombre es obligatorio. La IA generará referencias visuales con links directos a Instagram, Pinterest, Behance y más.</p>
      </div>

      <div style={{display:'flex',justifyContent:'center',alignItems:'flex-start',marginBottom:36}}>
        {STEPS.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
              <div style={{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Unbounded,sans-serif',fontSize:10,fontWeight:700,transition:'all .3s',border:step===i+1?`2px solid ${T.purple}`:step>i+1?`2px solid ${T.purple}`:`2px solid ${T.border}`,background:step===i+1?T.purple:step>i+1?T.purpleDim:T.card,color:step===i+1?'#fff':step>i+1?T.purple:T.muted}}>
                {step>i+1?'✓':s.n}
              </div>
              <div style={{fontFamily:'Unbounded,sans-serif',fontSize:9,color:step===i+1?'#fff':T.muted,letterSpacing:1}}>{s.label}</div>
            </div>
            {i<STEPS.length-1&&<div style={{width:48,height:2,background:step>i+1?T.purple:T.border,margin:'0 6px',marginTop:-16,transition:'background .3s'}}/>}
          </div>
        ))}
      </div>

      <div style={{maxWidth:720,margin:'0 auto',padding:'0 32px 80px'}}>
        {step===1&&(
          <div style={{animation:'fadeUp .35s ease'}}>
            <div style={sLbl}>Datos de la marca</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18,padding:'16px 18px',background:'rgba(125,3,255,.07)',border:`1px solid ${T.purpleBorder}`,borderRadius:12}}>
              <label style={fLbl}>🌐 Web / Instagram del cliente <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional — la IA la analiza)</span></label>
              <input style={{...inp,background:'#111'}} type="url" placeholder="https://cliente.com o @instagramhandle" value={form.websiteUrl} onChange={e=>set('websiteUrl',e.target.value)}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label style={fLbl}>Nombre / Marca *</label>
                <input style={inp} placeholder="Ej: Studio Verde" value={form.name} onChange={e=>set('name',e.target.value)}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label style={fLbl}>Industria <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional)</span></label>
                <select style={inp} value={form.industry} onChange={e=>set('industry',e.target.value)}>
                  <option value="">Seleccioná...</option>
                  {INDUSTRIES.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8,gridColumn:'1/-1'}}>
                <label style={fLbl}>Descripción <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional si tenés la URL)</span></label>
                <textarea style={{...inp,resize:'vertical',minHeight:80,lineHeight:1.65}} placeholder="¿Qué hace la marca?" value={form.description} onChange={e=>set('description',e.target.value)}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label style={fLbl}>Valores <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional)</span></label>
                <input style={inp} placeholder="Innovación, cercanía..." value={form.values} onChange={e=>set('values',e.target.value)}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label style={fLbl}>USP / Diferencial <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional)</span></label>
                <input style={inp} placeholder="Qué los hace únicos" value={form.usp} onChange={e=>set('usp',e.target.value)}/>
              </div>
            </div>
          </div>
        )}

        {step===2&&(
          <div style={{animation:'fadeUp .35s ease'}}>
            <div style={sLbl}>Audiencia y estilo — todo opcional</div>
            <div style={{marginBottom:20}}><label style={fLbl}>Público objetivo</label><Chips options={AUDIENCES} selected={form.audiences} onToggle={v=>tog('audiences',v)}/></div>
            <div style={{marginBottom:20}}><label style={fLbl}>Mood / Estilo</label><Chips options={MOODS} selected={form.moods} onToggle={v=>tog('moods',v)}/></div>
            <hr style={{border:'none',borderTop:`1px solid ${T.border}`,margin:'22px 0'}}/>
            <div style={sLbl}>Redes sociales</div>
            <div style={{marginBottom:16}}><label style={fLbl}>Plataformas</label><Chips options={PLATFORMS} selected={form.platforms} onToggle={v=>tog('platforms',v)}/></div>
            <div><label style={fLbl}>Estilo visual en RRSS</label><Chips options={RRSS_STYLES} selected={form.rrssStyle} onToggle={v=>tog('rrssStyle',v)}/></div>
          </div>
        )}

        {step===3&&(
          <div style={{animation:'fadeUp .35s ease'}}>
            <div style={sLbl}>Contexto competitivo — todo opcional</div>
            {[{label:'Competidores',key:'competitors',ph:'Ej: Patagonia, Nike...'},{label:'Marcas que le gustan',key:'likes',ph:'Ej: Apple, Zara...'},{label:'Qué NO quieren',key:'dislikes',ph:'Colores, estilos a evitar...'}].map(({label,key,ph})=>(
              <div key={key} style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                <label style={fLbl}>{label} <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional)</span></label>
                <input style={inp} placeholder={ph} value={form[key]} onChange={e=>set(key,e.target.value)}/>
              </div>
            ))}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <label style={fLbl}>Notas adicionales <span style={{color:T.muted,fontSize:8,fontWeight:400}}>(opcional)</span></label>
              <textarea style={{...inp,resize:'vertical',minHeight:80,lineHeight:1.65}} placeholder="Cualquier otro detalle del brief..." value={form.notes} onChange={e=>set('notes',e.target.value)}/>
            </div>
          </div>
        )}

        {error&&<div style={{background:'rgba(255,60,60,.08)',border:'1px solid rgba(255,60,60,.3)',borderRadius:10,padding:'12px 16px',fontSize:13,color:'#ff8888',marginTop:14}}>{error}</div>}

        <div style={{display:'flex',gap:12,marginTop:20}}>
          {step>1&&<button onClick={back} style={{flex:'0 0 auto',padding:'14px 22px',background:'transparent',border:`1px solid ${T.border}`,borderRadius:10,color:T.muted,fontSize:13,cursor:'pointer'}}>← Atrás</button>}
          {step<3&&<button onClick={next} style={{flex:1,padding:15,background:T.purple,border:'none',borderRadius:10,color:'#fff',fontFamily:'Unbounded,sans-serif',fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'}}>Siguiente →</button>}
          {step===3&&<button onClick={generate} style={{flex:1,padding:18,background:`linear-gradient(135deg,${T.purple},#9b35ff)`,border:'none',borderRadius:12,color:'#fff',fontFamily:'Unbounded,sans-serif',fontSize:12,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'}}>Generar Referencias Visuales ✦</button>}
        </div>
        {step<3&&form.name&&<div style={{textAlign:'center',marginTop:16}}><button onClick={generate} style={{background:'none',border:'none',color:'rgba(125,3,255,.6)',fontSize:12,cursor:'pointer',textDecoration:'underline',textDecorationStyle:'dotted'}}>Saltar y generar ahora →</button></div>}
      </div>
    </div>
  )

  if (phase==='loading') return (
    <div style={{minHeight:'100vh',background:T.dark}}>
      <Header/><ProgBar/>
      <div style={{textAlign:'center',padding:'100px 32px'}}>
        <div style={{width:52,height:52,border:`3px solid ${T.purpleDim}`,borderTopColor:T.purple,borderRadius:'50%',animation:'spin .85s linear infinite',margin:'0 auto 28px'}}/>
        <div style={{fontFamily:'Unbounded,sans-serif',fontSize:20,fontWeight:700,marginBottom:10}}>Buscando referencias...</div>
        <p style={{fontSize:13,color:T.muted,marginBottom:28}}>Generando con links directos a Instagram, Pinterest, Behance</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',maxWidth:440,margin:'0 auto'}}>
          {['Arquetipo','Logotipos','Paleta','RRSS','Links'].map((t,i)=>(
            <span key={i} style={{padding:'5px 14px',borderRadius:99,border:`1px solid ${T.purpleBorder}`,fontSize:11,color:T.purple,animation:`pulse 2s ease-in-out ${i*.25}s infinite`}}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:T.dark}}>
      <Header/><ProgBar/>
      <div style={{maxWidth:960,margin:'0 auto',padding:'36px 32px 100px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontFamily:'Unbounded,sans-serif',fontSize:9,color:T.orange,letterSpacing:3,textTransform:'uppercase',marginBottom:5}}>★ Referencias</div>
            <div style={{fontFamily:'Unbounded,sans-serif',fontSize:20,fontWeight:900}}>{form.name}</div>
            {form.websiteUrl&&<a href={form.websiteUrl.startsWith('http')?form.websiteUrl:`https://${form.websiteUrl}`} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:T.muted,textDecoration:'none'}}>🌐 {form.websiteUrl} ↗</a>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:3,padding:4,background:T.card2,borderRadius:10}}>
              {[{key:'designer',label:'Diseñadores',icon:'◉'},{key:'client',label:'Cliente',icon:'★'}].map(m=>(
                <button key={m.key} onClick={()=>setMode(m.key)} style={{padding:'9px 16px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',transition:'all .25s',background:mode===m.key?T.purple:'transparent',color:mode===m.key?'#fff':T.muted}}>{m.icon} {m.label}</button>
              ))}
            </div>
            <HistoryPanel history={history} onRestore={h=>setResult(h.result)}/>
            <button onClick={handlePdf} style={{padding:'9px 16px',background:T.card2,border:`1px solid ${T.orangeBorder}`,borderRadius:9,color:T.orange,fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',cursor:'pointer'}}>↓ PDF</button>
            <button onClick={()=>{setPhase('form');setStep(1)}} style={{padding:'9px 14px',background:'transparent',border:`1px solid ${T.border}`,borderRadius:9,color:T.muted,fontSize:12,cursor:'pointer'}}>← Editar</button>
            <button onClick={generate} style={{padding:'9px 14px',background:T.purpleDim,border:`1px solid ${T.purpleBorder}`,borderRadius:9,color:'#b06bff',fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:700,cursor:'pointer'}}>↺ Regenerar</button>
            <button onClick={resetToNew} style={{padding:'9px 14px',background:T.card2,border:`1px solid ${T.border}`,borderRadius:9,color:T.muted,fontSize:12,cursor:'pointer'}}>+ Nuevo</button>
          </div>
        </div>

        <div style={{padding:'10px 16px',borderRadius:10,marginBottom:24,background:mode==='client'?'rgba(0,255,0,.05)':T.purpleDim,border:`1px solid ${mode==='client'?T.greenBorder:T.purpleBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div>
            <div style={{fontFamily:'Unbounded,sans-serif',fontSize:9,fontWeight:700,color:mode==='client'?T.green:T.purple,letterSpacing:1.5,textTransform:'uppercase'}}>{mode==='client'?'Vista Presentación Cliente':'Vista Interna Diseñadores'}</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>{mode==='client'?'Versión limpia para mostrar al cliente.':'Versión completa con referencias técnicas y links.'}</div>
          </div>
          <button onClick={handlePdf} style={{padding:'7px 16px',background:'transparent',border:`1px solid ${T.border}`,borderRadius:7,color:T.muted,fontSize:11,cursor:'pointer',whiteSpace:'nowrap'}}>↓ Descargar como PDF</button>
        </div>

        <ResultsView raw={result} brief={form} mode={mode}/>
      </div>
      <div style={{textAlign:'center',padding:24,borderTop:`1px solid ${T.border}`,fontFamily:'Unbounded,sans-serif',fontSize:8,color:'rgba(255,255,255,.18)',letterSpacing:3}}>
        <span style={{color:T.purple,marginRight:8}}>★ ★ ★</span>AVALON WORLD AGENCY · AI CHALLENGE 2026 · ÁREA DISEÑO
      </div>
    </div>
  )
}

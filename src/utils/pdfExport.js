/* ══════════════════════════════════════════════════════════
   PDF EXPORT UTILITY
   Generates a print-optimised HTML → PDF
   Works with Adobe Illustrator (Place PDF)
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
    .filter(l => l.length > 4).slice(0, max)
}

function extractHex(text) {
  return [...new Set((text || '').match(/#[A-Fa-f0-9]{6}/g) || [])].slice(0, 6)
}

function extractLinks(str) {
  const matches = (str || '').match(/\[https?:\/\/[^\]]+\]/g) || []
  return matches.map(m => m.slice(1, -1))
}

function cleanText(str) {
  return (str || '').replace(/\[https?:\/\/[^\]]+\]/g, '').trim()
}

function splitND(str) {
  const clean = cleanText(str)
  const links = extractLinks(str)
  const m = clean.match(/[-–—:]/)
  if (!m) return [clean, '', links]
  const i = clean.indexOf(m[0])
  return [clean.slice(0, i).trim(), clean.slice(i + 1).trim(), links]
}

/* ── Link label helper ── */
function getLinkLabel(url) {
  if (url.includes('instagram.com')) return '📸 Instagram'
  if (url.includes('pinterest.com')) return '📌 Pinterest'
  if (url.includes('behance.net'))   return '🎨 Behance'
  if (url.includes('fonts.google.com')) return 'Aa Google Fonts'
  if (url.includes('dribbble.com'))  return '🏀 Dribbble'
  try { return `🔗 ${new URL(url).hostname.replace('www.','')}` } catch { return '🔗 Ver referencia' }
}

/* ── Ref list HTML ── */
function refListHtml(items, accentColor = '#7d03ff') {
  return items.map((item, i) => {
    const [name, desc, links] = splitND(item)
    const linksHtml = links.length > 0
      ? `<div class="ref-links">${links.map(url => `<a href="${url}" class="ref-link-chip">${getLinkLabel(url)} ↗</a>`).join('')}</div>`
      : ''
    return `<div class="ref-item">
      <span class="ref-n" style="color:${accentColor}">0${i+1}</span>
      <div class="ref-body">
        <div class="ref-name">${name}</div>
        ${desc ? `<div class="ref-desc">${desc}</div>` : ''}
        ${linksHtml}
      </div>
    </div>`
  }).join('')
}

/* ── Swatch row ── */
function swatchRowHtml(hexes) {
  if (!hexes.length) return ''
  return `<div class="swatch-row">${hexes.map(h => `
    <div class="swatch">
      <div class="swatch-dot" style="background:${h}"></div>
      <span class="swatch-hex">${h}</span>
    </div>`).join('')}</div>`
}

/* ── Color link chips ── */
function linkChipsHtml(links, label = '') {
  if (!links.length) return ''
  return `<div class="link-chips">
    ${label ? `<span class="link-chips-label">${label}</span>` : ''}
    ${links.map(url => `<a href="${url}" class="ref-link-chip">${getLinkLabel(url)} ↗</a>`).join('')}
  </div>`
}

/* ══════════════════════════════════════════════════════════
   MAIN EXPORT FUNCTION
══════════════════════════════════════════════════════════ */
export function generatePdfHtml(raw, brief, mode = 'designer') {
  const isClient = mode === 'client'
  const date = new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })

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
  const logos    = toItems(s.logos, 5)
  const brands   = toItems(s.brands, 6)
  const typos    = toItems(s.typo, 3)
  const colorLinks = extractLinks(s.colors)
  const rrssLinks  = extractLinks(s.rrss)
  const kwLinks    = extractLinks(s.keywords)

  const kwColors = ['#7d03ff','#ff7939','#0a6640','#888']

  /* ── Keyword chips ── */
  const kwChipsHtml = kwords.map((k, i) => 
    `<span class="kw" style="border-color:${kwColors[i%4]};color:${kwColors[i%4]}">${cleanText(k)}</span>`
  ).join('')

  /* ── RRSS account items ── */
  const rrssItemsHtml = accounts.map(a => {
    const [handle, why, links] = splitND(a)
    return `<div class="rrss-item">
      <div class="rrss-handle">${handle.startsWith('@') ? handle : `@${cleanText(handle)}`}</div>
      ${why ? `<div class="rrss-why">${why}</div>` : ''}
      ${linkChipsHtml(links)}
    </div>`
  }).join('')

  /* ══ DESIGNER SECTIONS ══ */
  const designerSections = `
    ${s.logos || s.brands ? `
    <div class="two-col section">
      ${s.logos ? `<div class="col card accent-orange">
        <div class="card-ico-row">
          <div class="card-ico" style="background:rgba(255,121,57,.1);color:#ff7939">✦</div>
          <div><div class="card-title">Referencias de Logotipo</div><div class="card-subtitle">Construcción · Justificación técnica</div></div>
        </div>
        <div class="ref-list">${refListHtml(logos, '#ff7939')}</div>
      </div>` : ''}
      ${s.brands ? `<div class="col card accent-gray">
        <div class="card-ico-row">
          <div class="card-ico" style="background:rgba(0,0,0,.05);color:#666">★</div>
          <div><div class="card-title">Marcas de Referencia Estética</div><div class="card-subtitle">Inspiración cross-industry</div></div>
        </div>
        <div class="ref-list">${refListHtml(brands, '#888')}</div>
      </div>` : ''}
    </div>` : ''}

    ${s.colors ? `
    <div class="section card accent-purple">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(125,3,255,.08);color:#7d03ff">◈</div>
        <div><div class="card-title">Dirección de Paleta</div><div class="card-subtitle">Propuesta cromática con lógica emocional</div></div>
      </div>
      <p class="prose">${cleanText(s.colors)}</p>
      ${swatchRowHtml(hexes)}
      ${linkChipsHtml(colorLinks, '🎨 Referencias visuales de la paleta:')}
    </div>` : ''}

    ${s.typo || s.rrss ? `
    <div class="two-col section">
      ${s.typo ? `<div class="col card accent-orange">
        <div class="card-ico-row">
          <div class="card-ico" style="background:rgba(255,121,57,.1);color:#ff7939">Aa</div>
          <div><div class="card-title">Tipografías Sugeridas</div><div class="card-subtitle">Display · Cuerpo · UI</div></div>
        </div>
        <div class="ref-list">${refListHtml(typos, '#ff7939')}</div>
      </div>` : ''}
      ${s.rrss ? `<div class="col card accent-green">
        <div class="card-ico-row">
          <div class="card-ico" style="background:rgba(10,102,64,.08);color:#0a6640">◎</div>
          <div><div class="card-title">Identidad Visual en RRSS</div><div class="card-subtitle">Feed · Stories · Grilla · Recursos</div></div>
        </div>
        <p class="prose small">${cleanText(s.rrss)}</p>
        ${linkChipsHtml(rrssLinks)}
      </div>` : ''}
    </div>` : ''}

    ${accounts.length > 0 ? `
    <div class="section card accent-green">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(10,102,64,.08);color:#0a6640">@</div>
        <div><div class="card-title">Cuentas de Referencia para RRSS</div><div class="card-subtitle">Estudios, agencias y marcas a seguir</div></div>
      </div>
      <div class="rrss-grid">${rrssItemsHtml}</div>
    </div>` : ''}

    ${kwords.length > 0 ? `
    <div class="section card accent-gray">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(0,0,0,.04);color:#666">◐</div>
        <div><div class="card-title">Keywords Visuales</div><div class="card-subtitle">Guía creativa para cada decisión de diseño</div></div>
      </div>
      <div class="kw-row">${kwChipsHtml}</div>
      ${linkChipsHtml(kwLinks, '📌 Moodboard de referencia:')}
    </div>` : ''}
  `

  /* ══ CLIENT SECTIONS ══ */
  const clientSections = `
    ${s.brands ? `
    <div class="section card accent-orange">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(255,121,57,.1);color:#ff7939">★</div>
        <div><div class="card-title">Marcas que Inspiran</div><div class="card-subtitle">Referencias estéticas y de posicionamiento</div></div>
      </div>
      <div class="ref-list">${refListHtml(brands, '#ff7939')}</div>
    </div>` : ''}

    ${s.colors ? `
    <div class="section card accent-purple">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(125,3,255,.08);color:#7d03ff">◈</div>
        <div><div class="card-title">Universo de Color</div><div class="card-subtitle">Dirección cromática propuesta</div></div>
      </div>
      <p class="prose">${cleanText(s.colors)}</p>
      ${swatchRowHtml(hexes)}
      ${linkChipsHtml(colorLinks, '🎨 Ver referencias de color:')}
    </div>` : ''}

    ${s.rrss ? `
    <div class="section card accent-green">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(10,102,64,.08);color:#0a6640">◎</div>
        <div><div class="card-title">Identidad en Redes Sociales</div><div class="card-subtitle">Feed · Stories · Ecosistema digital</div></div>
      </div>
      <p class="prose">${cleanText(s.rrss)}</p>
      ${linkChipsHtml(rrssLinks)}
    </div>` : ''}

    ${kwords.length > 0 ? `
    <div class="section card accent-gray">
      <div class="card-ico-row">
        <div class="card-ico" style="background:rgba(0,0,0,.04);color:#666">◐</div>
        <div><div class="card-title">Universo Visual</div><div class="card-subtitle">Las palabras que definen la dirección creativa</div></div>
      </div>
      <div class="kw-row">${kwChipsHtml}</div>
      ${linkChipsHtml(kwLinks, '📌 Moodboard:')}
    </div>` : ''}
  `

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${brief.name || 'Cliente'} — Referencias Visuales · Avalon</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;600;700;900&family=Poppins:wght@300;400;500;600&display=swap');
  *{ box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4; margin:0; }

  body {
    font-family:'Poppins',sans-serif;
    background:#fff;
    color:#111;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }

  /* ── COVER ── */
  .cover {
    width:210mm; height:297mm;
    background:#0b0b0b;
    display:flex; flex-direction:column; justify-content:space-between;
    padding:14mm 14mm 10mm;
    page-break-after:always;
    position:relative; overflow:hidden;
  }
  .cover-glow {
    position:absolute; top:-60mm; left:50%; transform:translateX(-50%);
    width:180mm; height:140mm;
    background:radial-gradient(ellipse,rgba(125,3,255,.35) 0%,transparent 65%);
    pointer-events:none;
  }
  .cover-top { display:flex; align-items:center; justify-content:space-between; position:relative; }
  .cover-mark { font-family:'Unbounded',sans-serif; font-size:22pt; font-weight:900; color:#7d03ff; }
  .cover-logo-text { font-family:'Unbounded',sans-serif; font-size:5.5pt; color:rgba(255,255,255,.4); letter-spacing:3px; text-transform:uppercase; line-height:1.6; margin-left:10px; }
  .cover-badge { background:#00ff00; color:#000; font-family:'Unbounded',sans-serif; font-size:6pt; font-weight:700; padding:4px 12px; border-radius:99px; letter-spacing:1.5px; text-transform:uppercase; }
  .cover-center { text-align:center; position:relative; }
  .cover-eyebrow { font-family:'Unbounded',sans-serif; font-size:7pt; color:#ff7939; letter-spacing:4px; text-transform:uppercase; margin-bottom:14px; }
  .cover-h1 { font-family:'Unbounded',sans-serif; font-size:32pt; font-weight:900; line-height:1.0; color:#fff; margin-bottom:10px; letter-spacing:-1.5px; }
  .cover-h1 span { background:linear-gradient(120deg,#7d03ff,#ff7939); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
  .cover-client { font-family:'Unbounded',sans-serif; font-size:14pt; font-weight:300; color:rgba(255,255,255,.65); margin-top:6px; }
  .cover-url { font-size:9pt; color:rgba(125,3,255,.7); margin-top:6px; font-style:italic; }
  .cover-type-badge { display:inline-block; margin-top:20px; padding:6px 18px; border-radius:99px; border:1px solid; font-family:'Unbounded',sans-serif; font-size:7pt; font-weight:700; letter-spacing:2px; text-transform:uppercase; }
  .cover-brief-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; position:relative; }
  .cover-brief-item { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:11px 14px; }
  .cover-brief-label { font-family:'Unbounded',sans-serif; font-size:5.5pt; color:rgba(255,255,255,.3); letter-spacing:2px; text-transform:uppercase; margin-bottom:5px; }
  .cover-brief-value { font-size:8pt; color:rgba(255,255,255,.75); line-height:1.5; }
  .cover-bottom { display:flex; justify-content:space-between; align-items:flex-end; font-family:'Unbounded',sans-serif; font-size:6pt; color:rgba(255,255,255,.2); letter-spacing:2px; position:relative; }

  /* ── CONTENT ── */
  .content { padding:11mm 13mm; background:#fff; }
  .page-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:7mm; border-bottom:1px solid #eee; margin-bottom:7mm; }
  .ph-mark { font-family:'Unbounded',sans-serif; font-size:12pt; font-weight:900; color:#7d03ff; }
  .ph-name { font-family:'Unbounded',sans-serif; font-size:5.5pt; color:#999; letter-spacing:2.5px; text-transform:uppercase; line-height:1.5; margin-left:8px; }
  .ph-client { font-family:'Unbounded',sans-serif; font-size:7pt; font-weight:700; color:#111; }
  .ph-url { font-size:7.5pt; color:#7d03ff; text-decoration:none; }
  .ph-date { font-size:7.5pt; color:#999; text-align:right; }
  .mode-strip { padding:7px 16px; border-radius:8px; font-family:'Unbounded',sans-serif; font-size:7pt; font-weight:700; letter-spacing:2px; text-transform:uppercase; display:inline-block; margin-bottom:7mm; }

  /* Client hero */
  .client-hero { text-align:center; padding:12mm 0 8mm; border-bottom:2px solid #f0f0f0; margin-bottom:7mm; }
  .client-hero-agency { font-family:'Unbounded',sans-serif; font-size:6.5pt; color:#aaa; letter-spacing:3.5px; text-transform:uppercase; margin-bottom:10px; }
  .client-hero-h1 { font-family:'Unbounded',sans-serif; font-size:24pt; font-weight:900; line-height:1.05; margin-bottom:8px; color:#111; }
  .client-hero-h1 span { color:#7d03ff; }
  .client-hero-sub { font-size:9pt; color:#666; max-width:120mm; margin:0 auto; line-height:1.65; }
  .client-hero-url { font-size:8pt; color:#7d03ff; text-decoration:none; display:inline-block; margin-top:6px; }

  /* Archetype dark card */
  .archetype-card { background:#0b0b0b; border-radius:14px; padding:18px 22px; margin-bottom:6mm; position:relative; overflow:hidden; page-break-inside:avoid; }
  .archetype-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#7d03ff,#ff7939); }
  .archetype-glow { position:absolute; top:-40px; right:-40px; width:120px; height:120px; background:radial-gradient(circle,rgba(125,3,255,.2) 0%,transparent 65%); }
  .archetype-card .card-title { color:#fff !important; }
  .archetype-card .card-subtitle { color:rgba(255,255,255,.45) !important; }
  .archetype-card .prose { color:rgba(255,255,255,.78) !important; }
  .archetype-card .card-ico { background:rgba(125,3,255,.2) !important; color:#9b35ff !important; }

  /* Generic card */
  .card { background:#fafafa; border:1px solid #e8e8e8; border-radius:12px; padding:16px 20px; margin-bottom:5mm; page-break-inside:avoid; position:relative; overflow:hidden; }
  .card::before { content:''; position:absolute; top:0; left:0; right:0; height:2.5px; }
  .accent-purple::before { background:#7d03ff; }
  .accent-orange::before { background:#ff7939; }
  .accent-green::before  { background:#0a6640; }
  .accent-gray::before   { background:#ccc; }
  .card-ico-row { display:flex; align-items:center; gap:10px; margin-bottom:11px; }
  .card-ico { width:30px; height:30px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Unbounded',sans-serif; font-size:11pt; font-weight:900; flex-shrink:0; }
  .card-title { font-family:'Unbounded',sans-serif; font-size:9pt; font-weight:700; color:#111; letter-spacing:.3px; margin-bottom:2px; }
  .card-subtitle { font-size:7.5pt; color:#888; }

  /* Grid */
  .two-col { display:grid; grid-template-columns:1fr 1fr; gap:5mm; margin-bottom:5mm; }
  .two-col .card { margin-bottom:0; }
  .section { page-break-inside:avoid; }

  /* Text */
  .prose { font-size:8.5pt; color:#333; line-height:1.8; }
  .prose.small { font-size:8pt; }

  /* Ref list */
  .ref-list { display:flex; flex-direction:column; margin-top:10px; }
  .ref-item { display:flex; gap:10px; padding:7px 0; border-bottom:1px solid #efefef; }
  .ref-item:last-child { border-bottom:none; padding-bottom:0; }
  .ref-n { font-family:'Unbounded',sans-serif; font-size:7.5pt; font-weight:700; width:18px; flex-shrink:0; padding-top:1px; }
  .ref-body { flex:1; }
  .ref-name { font-weight:600; font-size:8.5pt; margin-bottom:2px; color:#111; }
  .ref-desc { font-size:7.5pt; color:#555; line-height:1.5; margin-bottom:5px; }
  .ref-links { display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; }

  /* Link chips */
  .ref-link-chip {
    display:inline-block; padding:3px 9px; border-radius:99px;
    font-size:6.5pt; font-weight:600;
    background:rgba(125,3,255,.06); border:1px solid rgba(125,3,255,.2);
    color:#7d03ff; text-decoration:none;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .link-chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:9px; align-items:center; }
  .link-chips-label { font-size:7pt; color:#888; margin-right:4px; }

  /* Swatches */
  .swatch-row { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
  .swatch { display:flex; flex-direction:column; align-items:center; gap:5px; }
  .swatch-dot { width:44px; height:44px; border-radius:9px; border:1px solid rgba(0,0,0,.08); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .swatch-hex { font-size:7pt; color:#888; font-family:'Courier New',monospace; }

  /* KW chips */
  .kw-row { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
  .kw { padding:4px 12px; border-radius:99px; font-size:7.5pt; font-weight:600; border:1.5px solid; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  /* RRSS grid */
  .rrss-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
  .rrss-item { background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:10px 12px; }
  .rrss-handle { font-family:'Unbounded',sans-serif; font-size:8pt; font-weight:700; color:#0a6640; margin-bottom:4px; }
  .rrss-why { font-size:7pt; color:#555; line-height:1.5; margin-bottom:5px; }

  /* Footer */
  .page-footer { margin-top:7mm; padding-top:4mm; border-top:1px solid #eee; display:flex; justify-content:space-between; align-items:center; font-family:'Unbounded',sans-serif; font-size:6pt; color:#bbb; letter-spacing:2px; text-transform:uppercase; }

  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .cover { page-break-after:always; }
    .section, .card { page-break-inside:avoid; }
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-glow"></div>
  <div class="cover-top">
    <div style="display:flex;align-items:center;gap:10px">
      <div class="cover-mark">AVE</div>
      <div class="cover-logo-text">Avalon World Agency<br>Reference Hunter</div>
    </div>
    <div class="cover-badge">AI Challenge 2026</div>
  </div>

  <div class="cover-center">
    <div class="cover-eyebrow">★ &nbsp; Diseño · Branding · IA &nbsp; ★</div>
    <div class="cover-h1">Referencias<br><span>Visuales</span></div>
    <div class="cover-client">${brief.name || 'Cliente'}</div>
    ${brief.websiteUrl ? `<div class="cover-url">🌐 ${brief.websiteUrl}</div>` : ''}
    <div class="cover-type-badge" style="${isClient
      ? 'border-color:rgba(0,255,0,.4);color:#00ff00'
      : 'border-color:rgba(125,3,255,.4);color:#9b35ff'}">
      ${isClient ? '★ Presentación Cliente' : '◉ Vista Técnica Diseñadores'}
    </div>
  </div>

  <div class="cover-brief-grid">
    ${brief.industry ? `<div class="cover-brief-item"><div class="cover-brief-label">Industria</div><div class="cover-brief-value">${brief.industry}</div></div>` : ''}
    ${brief.audiences?.length ? `<div class="cover-brief-item"><div class="cover-brief-label">Público</div><div class="cover-brief-value">${brief.audiences.slice(0,2).join(', ')}</div></div>` : ''}
    ${brief.moods?.length ? `<div class="cover-brief-item"><div class="cover-brief-label">Mood</div><div class="cover-brief-value">${brief.moods.slice(0,2).join(', ')}</div></div>` : ''}
    ${brief.competitors ? `<div class="cover-brief-item"><div class="cover-brief-label">Competencia</div><div class="cover-brief-value">${brief.competitors.substring(0,60)}</div></div>` : ''}
    ${brief.dislikes ? `<div class="cover-brief-item"><div class="cover-brief-label">No quieren</div><div class="cover-brief-value">${brief.dislikes.substring(0,60)}</div></div>` : ''}
    <div class="cover-brief-item"><div class="cover-brief-label">Fecha</div><div class="cover-brief-value">${date}</div></div>
  </div>

  <div class="cover-bottom">
    <span style="color:#7d03ff">★</span> AVALON WORLD AGENCY
    <span>INFORME CONFIDENCIAL · ÁREA DISEÑO</span>
    <span>${date}</span>
  </div>
</div>

<!-- CONTENT -->
<div class="content">

  <div class="page-header">
    <div style="display:flex;align-items:center">
      <span class="ph-mark">AVE</span>
      <span class="ph-name">Avalon World Agency<br>Reference Hunter</span>
    </div>
    <div style="text-align:right">
      <div class="ph-client">${brief.name} ${brief.industry ? `· ${brief.industry}` : ''}</div>
      ${brief.websiteUrl ? `<a href="${brief.websiteUrl}" class="ph-url">🌐 ${brief.websiteUrl}</a>` : ''}
      <div class="ph-date">${date}</div>
    </div>
  </div>

  <div class="mode-strip" style="${isClient
    ? 'background:rgba(10,102,64,.06);border:1px solid rgba(10,102,64,.2);color:#0a6640'
    : 'background:rgba(125,3,255,.05);border:1px solid rgba(125,3,255,.2);color:#7d03ff'}">
    ${isClient ? '★ Presentación para el cliente · Dirección Visual' : '◉ Vista interna diseñadores · Informe técnico con links'}
  </div>

  ${isClient ? `<div class="client-hero">
    <div class="client-hero-agency">Avalon World Agency — Propuesta Visual</div>
    <div class="client-hero-h1">Universo Visual<br><span>${brief.name}</span></div>
    <p class="client-hero-sub">Seleccionamos referencias que capturan la esencia y dirección visual de tu marca.</p>
    ${brief.websiteUrl ? `<a href="${brief.websiteUrl}" class="client-hero-url">🌐 ${brief.websiteUrl} ↗</a>` : ''}
  </div>` : ''}

  <!-- Archetype -->
  ${s.archetype ? `
  <div class="section archetype-card">
    <div class="archetype-glow"></div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="card-ico" style="background:rgba(125,3,255,.2);color:#9b35ff">◉</div>
      <div>
        <div class="card-title">Arquetipo de Marca</div>
        <div class="card-subtitle">${isClient ? 'Posicionamiento y esencia' : 'Arquetipo Jung · Posicionamiento · Tono de voz'}</div>
      </div>
    </div>
    <p class="prose" style="color:rgba(255,255,255,.78)">${cleanText(s.archetype)}</p>
  </div>` : ''}

  ${isClient ? clientSections : designerSections}

  <div class="page-footer">
    <span>AVALON WORLD AGENCY</span>
    <span style="color:#7d03ff">★</span>
    <span>REFERENCE HUNTER · ${(brief.name || 'CLIENTE').toUpperCase()} · ${date.toUpperCase()}</span>
  </div>
</div>
</body>
</html>`
}

export function openPdfWindow(raw, brief, mode) {
  const html = generatePdfHtml(raw, brief, mode)
  const win = window.open('', '_blank', 'width=950,height=1100,scrollbars=yes')
  if (!win) { alert('Habilitá las ventanas emergentes para generar el PDF.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 1200)
}

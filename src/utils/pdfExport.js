/**
 * generatePdfHtml
 * Creates a standalone HTML document optimized for:
 *   1. Print to PDF (Cmd+P → Save as PDF)
 *   2. Open PDF in Adobe Illustrator for editing
 *
 * @param {string} raw       - Raw AI result text
 * @param {object} brief     - Form data
 * @param {string} mode      - 'designer' | 'client'
 * @returns {string}         - Full HTML string
 */

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
  return [...new Set((text || '').match(/#[A-Fa-f0-9]{6}/g) || [])].slice(0, 6)
}

function splitND(str) {
  const m = str.match(/[-–—:]/)
  if (!m) return [str, '']
  const i = str.indexOf(m[0])
  return [str.slice(0, i).trim(), str.slice(i + 1).trim()]
}

export function generatePdfHtml(raw, brief, mode = 'designer') {
  const isClient = mode === 'client'
  const date = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

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

  /* ── Color swatches SVG row ── */
  const swatchRow = hexes.length > 0
    ? `<div class="swatch-row">${hexes.map(h => `
        <div class="swatch">
          <div class="swatch-dot" style="background:${h}"></div>
          <span class="swatch-hex">${h}</span>
        </div>`).join('')}</div>`
    : ''

  /* ── Ref list helper ── */
  const refList = (items, accentColor = '#7d03ff') => items.map((item, i) => {
    const [name, desc] = splitND(item)
    return `<div class="ref-item">
      <span class="ref-n" style="color:${accentColor}">0${i + 1}</span>
      <div class="ref-body">
        <div class="ref-name">${name}</div>
        ${desc ? `<div class="ref-desc">${desc}</div>` : ''}
      </div>
    </div>`
  }).join('')

  /* ── Keyword chips ── */
  const kwColors = ['#7d03ff','#ff7939','#0a6640','#555']
  const kwChips = kwords.map((k, i) => `<span class="kw" style="border-color:${kwColors[i % 4]};color:${kwColors[i % 4]}">${k}</span>`).join('')

  /* ── RRSS accounts ── */
  const rrssItems = accounts.map(a => {
    const [handle, why] = splitND(a)
    return `<div class="rrss-item">
      <div class="rrss-handle">${handle.startsWith('@') ? handle : `@${handle}`}</div>
      <div class="rrss-why">${why || ''}</div>
    </div>`
  }).join('')

  /* ══ DESIGNER SECTIONS ══ */
  const designerSections = `
    ${s.logos ? `
    <div class="section two-col">
      <div class="col card accent-orange">
        <div class="card-title">✦ Referencias de Logotipo</div>
        <div class="card-subtitle">Construcción · Justificación técnica</div>
        <div class="ref-list">${refList(logos, '#ff7939')}</div>
      </div>
      <div class="col card accent-gray">
        <div class="card-title">★ Marcas de Referencia Estética</div>
        <div class="card-subtitle">Inspiración cross-industry</div>
        <div class="ref-list">${refList(brands, '#888')}</div>
      </div>
    </div>` : ''}

    ${s.colors ? `
    <div class="section card accent-purple">
      <div class="card-title">◈ Dirección de Paleta</div>
      <div class="card-subtitle">Propuesta cromática con lógica emocional</div>
      <p class="prose">${s.colors}</p>
      ${swatchRow}
    </div>` : ''}

    ${s.typo || s.rrss ? `
    <div class="section two-col">
      ${s.typo ? `<div class="col card accent-orange">
        <div class="card-title">Aa Tipografías Sugeridas</div>
        <div class="card-subtitle">Display · Cuerpo · UI</div>
        <div class="ref-list">${refList(typos, '#ff7939')}</div>
      </div>` : ''}
      ${s.rrss ? `<div class="col card accent-green">
        <div class="card-title">◎ Identidad Visual en RRSS</div>
        <div class="card-subtitle">Feed · Stories · Grilla · Recursos</div>
        <p class="prose small">${s.rrss}</p>
      </div>` : ''}
    </div>` : ''}

    ${accounts.length > 0 ? `
    <div class="section card accent-green">
      <div class="card-title">@ Cuentas de Referencia para RRSS</div>
      <div class="card-subtitle">Estudios, agencias y marcas a seguir de cerca</div>
      <div class="rrss-grid">${rrssItems}</div>
    </div>` : ''}

    ${kwords.length > 0 ? `
    <div class="section card accent-gray">
      <div class="card-title">◐ Keywords Visuales</div>
      <div class="card-subtitle">Palabras que guían cada decisión creativa</div>
      <div class="kw-row">${kwChips}</div>
    </div>` : ''}
  `

  /* ══ CLIENT SECTIONS ══ */
  const clientSections = `
    ${s.brands ? `
    <div class="section card accent-orange">
      <div class="card-title">★ Marcas que Inspiran</div>
      <div class="card-subtitle">Referencias estéticas y de posicionamiento</div>
      <div class="ref-list">${refList(brands, '#ff7939')}</div>
    </div>` : ''}

    ${s.colors ? `
    <div class="section card accent-purple">
      <div class="card-title">◈ Universo de Color</div>
      <div class="card-subtitle">Dirección cromática propuesta</div>
      <p class="prose">${s.colors}</p>
      ${swatchRow}
    </div>` : ''}

    ${s.rrss ? `
    <div class="section card accent-green">
      <div class="card-title">◎ Identidad en Redes Sociales</div>
      <div class="card-subtitle">Feed · Stories · Ecosistema digital</div>
      <p class="prose">${s.rrss}</p>
    </div>` : ''}

    ${kwords.length > 0 ? `
    <div class="section card accent-gray">
      <div class="card-title">◐ Universo Visual</div>
      <div class="card-subtitle">Las palabras que definen la dirección creativa</div>
      <div class="kw-row">${kwChips}</div>
    </div>` : ''}
  `

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Frakxel — Referencias Visuales · Avalon</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;600;700;900&family=Poppins:wght@300;400;500;600&display=swap');

  /* ── RESET ── */
  *{ box-sizing:border-box; margin:0; padding:0; }

  /* ── PAGE ── */
  @page {
    size: A4;
    margin: 0;
  }

  body {
    font-family: 'Poppins', sans-serif;
    background: #fff;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── COVER PAGE ── */
  .cover {
    width: 210mm;
    height: 297mm;
    background: #0b0b0b;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 14mm 14mm 10mm;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  .cover-glow {
    position: absolute;
    top: -60mm; left: 50%;
    transform: translateX(-50%);
    width: 180mm; height: 140mm;
    background: radial-gradient(ellipse, rgba(125,3,255,.35) 0%, transparent 65%);
    pointer-events: none;
  }

  .cover-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
  }

  .cover-logo-mark {
    font-family: 'Unbounded', sans-serif;
    font-size: 22pt;
    font-weight: 900;
    color: #7d03ff;
    letter-spacing: -1px;
  }

  .cover-logo-text {
    font-family: 'Unbounded', sans-serif;
    font-size: 6pt;
    font-weight: 300;
    color: rgba(255,255,255,.45);
    letter-spacing: 3px;
    text-transform: uppercase;
    line-height: 1.6;
    margin-left: 10px;
  }

  .cover-badge {
    background: #00ff00;
    color: #000;
    font-family: 'Unbounded', sans-serif;
    font-size: 6pt;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 99px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .cover-center {
    text-align: center;
    position: relative;
  }

  .cover-eyebrow {
    font-family: 'Unbounded', sans-serif;
    font-size: 7pt;
    font-weight: 400;
    color: #ff7939;
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .cover-h1 {
    font-family: 'Unbounded', sans-serif;
    font-size: 32pt;
    font-weight: 900;
    line-height: 1.0;
    color: #fff;
    margin-bottom: 10px;
    letter-spacing: -1.5px;
  }

  .cover-h1 span {
    background: linear-gradient(120deg, #7d03ff, #ff7939);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .cover-client {
    font-family: 'Unbounded', sans-serif;
    font-size: 14pt;
    font-weight: 300;
    color: rgba(255,255,255,.6);
    margin-top: 6px;
  }

  .cover-type-badge {
    display: inline-block;
    margin-top: 20px;
    padding: 6px 18px;
    border-radius: 99px;
    border: 1px solid;
    font-family: 'Unbounded', sans-serif;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .cover-brief-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    position: relative;
  }

  .cover-brief-item {
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 10px;
    padding: 12px 14px;
  }

  .cover-brief-label {
    font-family: 'Unbounded', sans-serif;
    font-size: 6pt;
    font-weight: 600;
    color: rgba(255,255,255,.3);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 5px;
  }

  .cover-brief-value {
    font-size: 8pt;
    color: rgba(255,255,255,.75);
    line-height: 1.5;
  }

  .cover-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-family: 'Unbounded', sans-serif;
    font-size: 6pt;
    color: rgba(255,255,255,.2);
    letter-spacing: 2px;
    position: relative;
  }

  /* ── CONTENT PAGES ── */
  .content {
    padding: 12mm 14mm;
    background: #fff;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8mm;
    border-bottom: 1px solid #eee;
    margin-bottom: 8mm;
  }

  .page-header-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ph-mark {
    font-family: 'Unbounded', sans-serif;
    font-size: 12pt;
    font-weight: 900;
    color: #7d03ff;
  }

  .ph-name {
    font-family: 'Unbounded', sans-serif;
    font-size: 5.5pt;
    color: #999;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    line-height: 1.5;
  }

  .ph-client {
    font-family: 'Unbounded', sans-serif;
    font-size: 7pt;
    font-weight: 700;
    color: #111;
  }

  .ph-date {
    font-size: 8pt;
    color: #999;
    text-align: right;
  }

  /* ── MODE HEADER STRIP ── */
  .mode-strip {
    padding: 7px 16px;
    border-radius: 8px;
    font-family: 'Unbounded', sans-serif;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    display: inline-block;
    margin-bottom: 8mm;
  }

  /* ── ARCHETYPE CARD ── */
  .archetype-card {
    background: #0b0b0b;
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 7mm;
    position: relative;
    overflow: hidden;
    page-break-inside: avoid;
  }

  .archetype-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #7d03ff, #ff7939);
  }

  .archetype-glow {
    position: absolute;
    top: -40px; right: -40px;
    width: 120px; height: 120px;
    background: radial-gradient(circle, rgba(125,3,255,.25) 0%, transparent 65%);
  }

  .archetype-card .card-title {
    color: #fff !important;
  }

  .archetype-card .card-subtitle {
    color: rgba(255,255,255,.45) !important;
  }

  .archetype-card .prose {
    color: rgba(255,255,255,.78) !important;
  }

  .archetype-card .card-ico {
    background: rgba(125,3,255,.2) !important;
    color: #9b35ff !important;
  }

  /* ── GENERIC CARD ── */
  .card {
    background: #fafafa;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 18px 22px;
    margin-bottom: 5mm;
    page-break-inside: avoid;
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 2.5px;
  }

  .accent-purple::before { background: #7d03ff; }
  .accent-orange::before { background: #ff7939; }
  .accent-green::before  { background: #0a6640; }
  .accent-gray::before   { background: #ccc; }

  .card-ico-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .card-ico {
    width: 30px; height: 30px;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Unbounded', sans-serif;
    font-size: 11pt;
    font-weight: 900;
    flex-shrink: 0;
  }

  .card-title {
    font-family: 'Unbounded', sans-serif;
    font-size: 9pt;
    font-weight: 700;
    color: #111;
    letter-spacing: .3px;
    margin-bottom: 2px;
  }

  .card-subtitle {
    font-size: 7.5pt;
    color: #888;
  }

  /* ── TWO COLUMN GRID ── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5mm;
    margin-bottom: 5mm;
  }

  .two-col .card {
    margin-bottom: 0;
  }

  .section {
    page-break-inside: avoid;
  }

  /* ── PROSE ── */
  .prose {
    font-size: 8.5pt;
    color: #333;
    line-height: 1.8;
  }

  .prose.small {
    font-size: 8pt;
  }

  /* ── REF LIST ── */
  .ref-list {
    display: flex;
    flex-direction: column;
    margin-top: 10px;
  }

  .ref-item {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #efefef;
  }

  .ref-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .ref-n {
    font-family: 'Unbounded', sans-serif;
    font-size: 7.5pt;
    font-weight: 700;
    width: 18px;
    flex-shrink: 0;
    padding-top: 1px;
  }

  .ref-name {
    font-weight: 600;
    font-size: 8.5pt;
    margin-bottom: 2px;
    color: #111;
  }

  .ref-desc {
    font-size: 7.5pt;
    color: #666;
    line-height: 1.5;
  }

  /* ── SWATCHES ── */
  .swatch-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
  }

  .swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .swatch-dot {
    width: 44px; height: 44px;
    border-radius: 9px;
    border: 1px solid rgba(0,0,0,.08);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .swatch-hex {
    font-size: 7pt;
    color: #888;
    font-family: 'Courier New', monospace;
  }

  /* ── KW CHIPS ── */
  .kw-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 12px;
  }

  .kw {
    padding: 5px 13px;
    border-radius: 99px;
    font-size: 8pt;
    font-weight: 500;
    border: 1.5px solid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── RRSS ACCOUNTS GRID ── */
  .rrss-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  }

  .rrss-item {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 10px 12px;
  }

  .rrss-handle {
    font-family: 'Unbounded', sans-serif;
    font-size: 7.5pt;
    font-weight: 700;
    color: #0a6640;
    margin-bottom: 4px;
  }

  .rrss-why {
    font-size: 7pt;
    color: #666;
    line-height: 1.5;
  }

  /* ── FOOTER STRIP ── */
  .page-footer {
    margin-top: 8mm;
    padding-top: 5mm;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Unbounded', sans-serif;
    font-size: 6pt;
    color: #bbb;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .footer-dot {
    color: #7d03ff;
  }

  /* ── CLIENT MODE TWEAKS ── */
  .client-hero {
    text-align: center;
    padding: 14mm 0 10mm;
    border-bottom: 2px solid #f0f0f0;
    margin-bottom: 8mm;
  }

  .client-hero-agency {
    font-family: 'Unbounded', sans-serif;
    font-size: 6.5pt;
    color: #aaa;
    letter-spacing: 3.5px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }

  .client-hero-h1 {
    font-family: 'Unbounded', sans-serif;
    font-size: 26pt;
    font-weight: 900;
    line-height: 1.05;
    margin-bottom: 8px;
    color: #111;
  }

  .client-hero-h1 span {
    color: #7d03ff;
  }

  .client-hero-sub {
    font-size: 9.5pt;
    color: #666;
    max-width: 120mm;
    margin: 0 auto;
    line-height: 1.65;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover { page-break-after: always; }
    .section, .card { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- ══════════════ COVER PAGE ══════════════ -->
<div class="cover">
  <div class="cover-glow"></div>

  <div class="cover-top">
    <div style="display:flex;align-items:center;gap:10px">
      <div class="cover-logo-mark">AVE</div>
      <div class="cover-logo-text">Avalon World Agency<br>Reference Hunter</div>
    </div>
    <div class="cover-badge">AI Challenge 2026</div>
  </div>

  <div class="cover-center">
    <div class="cover-eyebrow">★ &nbsp; Diseño · Branding · IA &nbsp; ★</div>
    <div class="cover-h1">
      Referencias<br><span>Visuales</span>
    </div>
    <div class="cover-client">${brief.name || 'Cliente'}</div>

    <div class="cover-type-badge" style="${isClient
      ? 'border-color:rgba(0,255,0,.4);color:#00ff00'
      : 'border-color:rgba(125,3,255,.4);color:#9b35ff'}">
      ${isClient ? '★ Vista Presentación Cliente' : '◉ Vista Técnica Diseñadores'}
    </div>
  </div>

  <div class="cover-brief-grid">
    ${brief.industry ? `<div class="cover-brief-item">
      <div class="cover-brief-label">Industria</div>
      <div class="cover-brief-value">${brief.industry}</div>
    </div>` : ''}
    ${brief.audiences?.length ? `<div class="cover-brief-item">
      <div class="cover-brief-label">Público objetivo</div>
      <div class="cover-brief-value">${brief.audiences.slice(0,3).join(', ')}</div>
    </div>` : ''}
    ${brief.moods?.length ? `<div class="cover-brief-item">
      <div class="cover-brief-label">Mood / Estilo</div>
      <div class="cover-brief-value">${brief.moods.slice(0,3).join(', ')}</div>
    </div>` : ''}
    ${brief.platforms?.length ? `<div class="cover-brief-item">
      <div class="cover-brief-label">Plataformas RRSS</div>
      <div class="cover-brief-value">${brief.platforms.join(', ')}</div>
    </div>` : ''}
    ${brief.values ? `<div class="cover-brief-item">
      <div class="cover-brief-label">Valores de marca</div>
      <div class="cover-brief-value">${brief.values}</div>
    </div>` : ''}
    <div class="cover-brief-item">
      <div class="cover-brief-label">Fecha</div>
      <div class="cover-brief-value">${date}</div>
    </div>
  </div>

  <div class="cover-bottom">
    <span><span class="footer-dot" style="color:#7d03ff">★</span> AVALON WORLD AGENCY</span>
    <span>ÁREA DISEÑO · INFORME CONFIDENCIAL</span>
    <span>${date}</span>
  </div>
</div>

<!-- ══════════════ CONTENT PAGES ══════════════ -->
<div class="content">

  <!-- Page header -->
  <div class="page-header">
    <div class="page-header-brand">
      <span class="ph-mark">AVE</span>
      <div class="ph-name">Avalon World Agency<br>Reference Hunter</div>
    </div>
    <div>
      <div class="ph-client">${brief.name} · ${brief.industry || ''}</div>
      <div class="ph-date">${date}</div>
    </div>
  </div>

  <!-- Mode badge -->
  <div class="mode-strip" style="${isClient
    ? 'background:rgba(10,102,64,.08);border:1px solid rgba(10,102,64,.2);color:#0a6640'
    : 'background:rgba(125,3,255,.06);border:1px solid rgba(125,3,255,.2);color:#7d03ff'}">
    ${isClient ? '★ Presentación para el cliente · Dirección Visual' : '◉ Vista interna diseñadores · Informe técnico completo'}
  </div>

  ${isClient ? `<!-- CLIENT HERO -->
  <div class="client-hero">
    <div class="client-hero-agency">Avalon World Agency — Propuesta Visual</div>
    <div class="client-hero-h1">Universo Visual<br><span>${brief.name}</span></div>
    <p class="client-hero-sub">Seleccionamos referencias que capturan la esencia y dirección visual de tu marca.</p>
  </div>` : ''}

  <!-- Archetype -->
  ${s.archetype ? `
  <div class="section archetype-card">
    <div class="archetype-glow"></div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="card-ico" style="background:rgba(125,3,255,.2);color:#9b35ff">◉</div>
      <div>
        <div class="card-title">Arquetipo de Marca</div>
        <div class="card-subtitle">${isClient ? 'Posicionamiento y esencia de marca' : 'Arquetipo Jung · Posicionamiento · Tono de voz'}</div>
      </div>
    </div>
    <p class="prose" style="color:rgba(255,255,255,.78)">${s.archetype}</p>
  </div>` : ''}

  ${isClient ? clientSections : designerSections}

  <!-- Footer -->
  <div class="page-footer">
    <span>AVALON WORLD AGENCY</span>
    <span><span class="footer-dot">★</span></span>
    <span>REFERENCE HUNTER · ${brief.name?.toUpperCase() || 'CLIENTE'} · ${date.toUpperCase()}</span>
  </div>

</div>
</body>
</html>`
}

export function openPdfWindow(raw, brief, mode) {
  const html = generatePdfHtml(raw, brief, mode)
  const win = window.open('', '_blank', 'width=900,height=1100')
  if (!win) { alert('Habilitá las ventanas emergentes para generar el PDF.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 800)
}

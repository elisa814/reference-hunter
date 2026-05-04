import { useState, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import {
  collection, query, where, orderBy,
  onSnapshot, deleteDoc, doc,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

/* ── helpers ── */
function timeAgo(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)   return 'ahora mismo'
  if (diff < 3600) return `hace ${Math.floor(diff/60)} min`
  if (diff < 86400)return `hace ${Math.floor(diff/3600)} hs`
  return `hace ${Math.floor(diff/86400)} días`
}

function StatusBadge({ status }) {
  const isCompleted = status === 'completed'
  return (
    <span style={{
      padding: '4px 12px', borderRadius: 99, fontSize: 10, fontWeight: 600,
      fontFamily: 'Unbounded,sans-serif', letterSpacing: 1,
      background: isCompleted ? 'rgba(0,255,0,.08)' : 'rgba(255,121,57,.1)',
      border: `1px solid ${isCompleted ? 'rgba(0,255,0,.2)' : 'rgba(255,121,57,.3)'}`,
      color: isCompleted ? '#00ff00' : '#ff7939',
    }}>
      {isCompleted ? 'COMPLETADO' : 'BORRADOR'}
    </span>
  )
}

function ProjectCard({ project, onOpen, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar el proyecto "${project.clientName}"?`)) return
    setDeleting(true)
    await deleteDoc(doc(db, 'projects', project.id))
  }

  return (
    <div
      onClick={() => onOpen(project)}
      style={{
        background: '#141414', border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 16, padding: 24, cursor: 'pointer',
        transition: 'all .2s', animation: 'fadeUp .4s ease',
        opacity: deleting ? .4 : 1, position: 'relative',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(125,3,255,.4)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'}
    >
      {/* Accent top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        borderRadius: '16px 16px 0 0',
        background: project.status === 'completed'
          ? 'linear-gradient(90deg,#7d03ff,#0a6640)'
          : 'rgba(255,121,57,.5)',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 15, fontWeight: 900, marginBottom: 6 }}>
            {project.clientName || 'Sin nombre'}
          </div>
          <StatusBadge status={project.status} />
        </div>
        <button
          onClick={handleDelete}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,.25)',
            fontSize: 16, padding: 4, borderRadius: 6, transition: 'color .2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#ff5555'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.25)'}
        >✕</button>
      </div>

      {project.brief?.industry && (
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 99,
          background: 'rgba(125,3,255,.1)', border: '1px solid rgba(125,3,255,.25)',
          color: '#b06bff', fontSize: 11, fontFamily: 'Unbounded,sans-serif',
          letterSpacing: .5, marginBottom: 14,
        }}>
          {project.brief.industry}
        </div>
      )}

      {/* Mood chips preview */}
      {project.brief?.moods?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {project.brief.moods.slice(0, 3).map(m => (
            <span key={m} style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 10,
              background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.5)',
              border: '1px solid rgba(255,255,255,.1)',
            }}>{m}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', fontFamily: 'Unbounded,sans-serif', letterSpacing: 1 }}>
        {timeAgo(project.updatedAt)}
      </div>
    </div>
  )
}

/* ── Main Dashboard ── */
export default function Dashboard({ onNew, onOpen }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user])

  const filtered = projects.filter(p =>
    (p.clientName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.brief?.industry || '').toLowerCase().includes(search.toLowerCase())
  )

  const completed = projects.filter(p => p.status === 'completed').length
  const drafts    = projects.filter(p => p.status !== 'completed').length

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0b' }}>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 36px', borderBottom: '1px solid rgba(255,255,255,.07)',
        background: 'rgba(11,11,11,.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 20, fontWeight: 900, color: '#7d03ff' }}>AVE</span>
          <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 9, fontWeight: 300, color: 'rgba(255,255,255,.45)', letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1.5 }}>
            Avalon World Agency<br />Reference Hunter
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{user?.email}</span>
          <button
            onClick={() => signOut(auth)}
            style={{
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8, padding: '7px 16px', color: 'rgba(255,255,255,.6)',
              fontSize: 12, fontFamily: 'Poppins,sans-serif', transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = 'rgba(255,255,255,.6)' }}
          >Cerrar sesión</button>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 36px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 9, color: '#ff7939', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>★ Mis proyectos</div>
          <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 28, fontWeight: 900, lineHeight: 1.1, marginBottom: 6 }}>
            Reference Hunter
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', marginBottom: 28 }}>
            Todas tus búsquedas de referencias visuales en un solo lugar.
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
            {[
              { label: 'Total', value: projects.length, color: '#7d03ff' },
              { label: 'Completados', value: completed, color: '#00ff00' },
              { label: 'Borradores', value: drafts, color: '#ff7939' },
            ].map(s => (
              <div key={s.label} style={{
                background: '#141414', border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 12, padding: '14px 22px', minWidth: 110,
              }}>
                <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 9, color: 'rgba(255,255,255,.35)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={onNew}
              style={{
                padding: '13px 28px', background: '#7d03ff', border: 'none',
                borderRadius: 10, color: '#fff', fontFamily: 'Unbounded,sans-serif',
                fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                transition: 'all .25s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6600e0'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#7d03ff'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              + Nuevo Proyecto
            </button>

            <input
              placeholder="Buscar por cliente o industria..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 200, background: '#141414',
                border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
                padding: '13px 18px', color: '#fff', fontSize: 13, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Project grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.35)' }}>
            <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 11, letterSpacing: 2 }}>CARGANDO PROYECTOS...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 36px',
            border: '1px dashed rgba(255,255,255,.1)', borderRadius: 16,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
            <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              {search ? 'Sin resultados' : 'Ningún proyecto todavía'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', marginBottom: 24 }}>
              {search ? `No hay proyectos que coincidan con "${search}"` : 'Creá tu primer informe de referencias con IA.'}
            </div>
            {!search && (
              <button
                onClick={onNew}
                style={{
                  padding: '12px 24px', background: '#7d03ff', border: 'none',
                  borderRadius: 10, color: '#fff', fontFamily: 'Unbounded,sans-serif',
                  fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: 'pointer',
                }}
              >+ Nuevo Proyecto</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} onOpen={onOpen} onDelete={() => {}} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

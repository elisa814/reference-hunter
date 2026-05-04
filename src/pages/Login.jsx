import { useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

const S = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#0b0b0b',
    padding: 24, position: 'relative', overflow: 'hidden',
  },
  glow: {
    position: 'absolute', top: -200, left: '50%',
    transform: 'translateX(-50%)', width: 700, height: 500,
    background: 'radial-gradient(ellipse at 50% 0%, rgba(125,3,255,.2) 0%, transparent 65%)',
    pointerEvents: 'none',
  },
  card: {
    background: '#141414', border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400,
    position: 'relative', animation: 'fadeUp .4s ease',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 },
  mark: { fontFamily: 'Unbounded,sans-serif', fontSize: 22, fontWeight: 900, color: '#7d03ff' },
  title: { fontFamily: 'Unbounded,sans-serif', fontSize: 20, fontWeight: 900, marginBottom: 6 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,.45)', marginBottom: 32, lineHeight: 1.6 },
  label: {
    fontFamily: 'Unbounded,sans-serif', fontSize: 9, fontWeight: 700,
    color: '#7d03ff', letterSpacing: 2, textTransform: 'uppercase',
    display: 'block', marginBottom: 7,
  },
  input: {
    width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 10, padding: '13px 16px', color: '#fff',
    fontSize: 14, outline: 'none', marginBottom: 16, transition: 'border-color .2s',
  },
  btn: {
    width: '100%', padding: 15, background: '#7d03ff', border: 'none',
    borderRadius: 10, color: '#fff', fontFamily: 'Unbounded,sans-serif',
    fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
    cursor: 'pointer', transition: 'all .25s', marginBottom: 12,
  },
  btnGoogle: {
    width: '100%', padding: 13, background: 'transparent',
    border: '1px solid rgba(255,255,255,.15)',
    borderRadius: 10, color: '#fff', fontFamily: 'Poppins,sans-serif',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    transition: 'all .2s', marginBottom: 24,
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  divLine: { flex: 1, height: 1, background: 'rgba(255,255,255,.08)' },
  divText: { fontSize: 11, color: 'rgba(255,255,255,.3)', fontFamily: 'Unbounded,sans-serif', letterSpacing: 1 },
  toggle: { textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.45)' },
  toggleLink: { color: '#7d03ff', cursor: 'pointer', fontWeight: 600, background: 'none', border: 'none', fontSize: 13 },
  error: {
    background: 'rgba(255,60,60,.08)', border: '1px solid rgba(255,60,60,.3)',
    borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#ff8888', marginBottom: 14,
  },
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

export default function Login() {
  const [mode, setMode]     = useState('login') // 'login' | 'signup'
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, pass)
      } else {
        await createUserWithEmailAndPassword(auth, email, pass)
      }
    } catch (e) {
      const msgs = {
        'auth/invalid-credential': 'Email o contraseña incorrectos.',
        'auth/email-already-in-use': 'Ese email ya está registrado.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-email': 'El email no es válido.',
      }
      setError(msgs[e.code] || 'Ocurrió un error. Intentá de nuevo.')
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      setError('No se pudo iniciar sesión con Google.')
    }
  }

  return (
    <div style={S.page}>
      <div style={S.glow} />
      <div style={S.card}>
        <div style={S.logo}>
          <span style={S.mark}>AVE</span>
          <div>
            <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 9, color: 'rgba(255,255,255,.4)', letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1.5 }}>Avalon World Agency</div>
            <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,.4)', letterSpacing: 3, textTransform: 'uppercase' }}>Reference Hunter</div>
          </div>
        </div>

        <div style={S.title}>{mode === 'login' ? 'Bienvenida 👋' : 'Crear cuenta'}</div>
        <div style={S.sub}>
          {mode === 'login'
            ? 'Iniciá sesión para acceder a tus proyectos de referencias visuales.'
            : 'Creá tu cuenta para empezar a generar referencias con IA.'}
        </div>

        {error && <div style={S.error}>{error}</div>}

        <label style={S.label}>Email</label>
        <input
          style={S.input} type="email" placeholder="tu@email.com"
          value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />

        <label style={S.label}>Contraseña</label>
        <input
          style={S.input} type="password" placeholder="••••••••"
          value={pass} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />

        <button
          style={{ ...S.btn, opacity: loading ? .6 : 1 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Cargando...' : mode === 'login' ? 'Entrar →' : 'Crear cuenta →'}
        </button>

        <div style={S.divider}>
          <div style={S.divLine} />
          <span style={S.divText}>o</span>
          <div style={S.divLine} />
        </div>

        <button style={S.btnGoogle} onClick={handleGoogle}>
          <GoogleIcon /> Continuar con Google
        </button>

        <div style={S.toggle}>
          {mode === 'login' ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
          <button style={S.toggleLink} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
            {mode === 'login' ? 'Registrarse' : 'Iniciar sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (isRegister) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name: name || email.split('@')[0],
          subject: 'Genel'
        })
        window.location.href = '/'
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError('E-posta veya şifre hatalı'); setLoading(false); return }
      window.location.href = '/'
    }
    setLoading(false)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg2)'
    }}>
      <div style={{
        background: 'var(--bg)', border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '40px',
        width: '100%', maxWidth: '400px'
      }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '6px' }}>
            📚 GaziÇArk
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text2)' }}>
            {isRegister ? 'Yeni hesap oluştur' : 'Hesabına giriş yap'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isRegister && (
            <input
              type="text"
              placeholder="Adın"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inp}
            />
          )}
          <input
            type="email"
            placeholder="E-posta"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inp}
          />
          <input
            type="password"
            placeholder="Şifre"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            style={inp}
          />
          {error && (
            <p style={{ fontSize: '13px', color: '#E24B4A' }}>{error}</p>
          )}
          <button type="submit" disabled={loading} style={{
            padding: '11px', fontSize: '14px', fontWeight: 500,
            background: 'var(--purple)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius)', cursor: 'pointer',
            opacity: loading ? 0.7 : 1
          }}>
            {loading ? '...' : (isRegister ? 'Kayıt ol' : 'Giriş yap')}
          </button>
        </form>

        <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text2)', textAlign: 'center' }}>
          {isRegister ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?'}{' '}
          <span
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 500 }}
          >
            {isRegister ? 'Giriş yap' : 'Kayıt ol'}
          </span>
        </p>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '11px 14px', fontSize: '14px',
  border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
  background: 'var(--bg2)', color: 'var(--text)', outline: 'none', width: '100%'
}
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

const YEARS = [1, 2, 3, 4, 5, 6]

type Props = {
  currentUser: Profile
  onClose: () => void
  onSave: () => void
}

export default function ProfilePanel({ currentUser, onClose, onSave }: Props) {
  const supabase = createClient()
  const [name, setName] = useState(currentUser.name)
  const [year, setYear] = useState(currentUser.year ?? 1)
  const [bio, setBio] = useState(currentUser.bio ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('profiles').update({ name, year, bio }).eq('id', currentUser.id)
    setSaving(false)
    onSave()
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
          width: '480px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Profil Ayarları</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text3)' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={lbl}>İsim</label>
            <input id="profil-isim" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Sınıf</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  style={{
                    padding: '6px 14px', fontSize: '13px', borderRadius: 'var(--radius)',
                    border: '0.5px solid var(--border)', cursor: 'pointer',
                    background: year === y ? 'var(--purple)' : 'var(--bg2)',
                    color: year === y ? '#fff' : 'var(--text)',
                  }}
                >
                  {y}. Sınıf
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Hakkında</label>
            <textarea
              id="profil-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Çalışma tarzın, hedeflerin..."
              rows={3}
              style={{ ...inp, resize: 'none', lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={secBtn}>İptal</button>
          <button id="btn-profil-kaydet" onClick={handleSave} disabled={saving} style={priBtn}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: '12px', color: 'var(--text2)', display: 'block', marginBottom: '6px' }
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: '13px',
  border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
  background: 'var(--bg2)', color: 'var(--text)', outline: 'none',
}
const priBtn: React.CSSProperties = {
  padding: '8px 20px', fontSize: '13px', fontWeight: 500,
  background: 'var(--purple)', color: '#fff', border: 'none',
  borderRadius: 'var(--radius)', cursor: 'pointer',
}
const secBtn: React.CSSProperties = {
  padding: '8px 20px', fontSize: '13px', background: 'none',
  color: 'var(--text2)', border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius)', cursor: 'pointer',
}

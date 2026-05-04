'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]

type Props = {
  currentUser: Profile
  targetUser: Profile & { common?: string[], commonSubjects?: string[], commonSlots: number, userSlots: string[] }
  mySlots: string[]
  onClose: () => void
  onSuccess: () => void
}

export default function StudyProposalModal({ currentUser, targetUser, mySlots, onClose, onSuccess }: Props) {
  const supabase = createClient()
  const targetCommon = targetUser.common || targetUser.commonSubjects || []
  const [subject, setSubject] = useState(targetCommon.length > 0 ? targetCommon[0] : '')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // Gelecek 14 günü oluştur
  const next14Days = Array.from({length: 14}).map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  // Ortak müsait saatleri bul
  const commonSlots = mySlots.filter(s => targetUser.userSlots.includes(s))
  
  // Seçilen tarihin hangi güne (0-6) denk geldiğini bul (Pazartesi=0)
  const selectedDateObj = selectedDate ? new Date(selectedDate) : null
  const selectedDayIndex = selectedDateObj ? (selectedDateObj.getDay() + 6) % 7 : -1
  
  // Sadece seçilen günün ortak saatlerini al
  const hoursForSelectedDay = commonSlots
    .filter(slot => slot.startsWith(`${selectedDayIndex}-`))
    .map(slot => Number(slot.split('-')[1]))
    .sort((a, b) => a - b)

  async function handleSend() {
    if (!selectedDate || selectedSlots.length === 0) return
    setSending(true)
    
    const proposalToInsert = {
      sender_id: currentUser.id,
      receiver_id: targetUser.id,
      subject: 'Genel Çalışma',
      date: selectedDate,
      hours: selectedSlots.sort((a,b)=>a-b),
      message: message.trim() || null
    }
    
    const { error } = await supabase.from('study_proposals').insert([proposalToInsert])
    
    if (error) {
      alert("Teklif gönderilirken hata oluştu: " + error.message)
      console.error(error)
      setSending(false)
      return
    }
    
    setSending(false)
    onSuccess()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)', width: '480px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>📚 {targetUser.name} ile Birlikte Çalış</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text3)' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {commonSlots.length === 0 && (
            <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius)', fontSize: '12px' }}>
              ⚠️ Ortak müsait saatiniz yok. Lütfen programınızı güncelleyin.
            </div>
          )}



          <div>
            <label style={lbl}>Tarih Seç</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', paddingBottom: '8px' }}>
              {next14Days.map(date => {
                const dateStr = date.toISOString().split('T')[0]
                const dayIdx = (date.getDay() + 6) % 7
                const hasCommon = commonSlots.some(s => s.startsWith(`${dayIdx}-`))
                const isSel = selectedDate === dateStr
                
                return (
                  <div 
                    key={dateStr} 
                    onClick={() => {
                      if (!hasCommon) return
                      setSelectedDate(dateStr)
                      setSelectedSlots([]) // Tarih değişince seçili saatleri sıfırla
                    }}
                    style={{
                      width: '100%', height: '54px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 'var(--radius)', border: isSel ? '2px solid var(--purple)' : '1px solid var(--border)',
                      background: isSel ? 'var(--purple-light)' : (hasCommon ? 'var(--bg2)' : 'var(--bg)'),
                      cursor: hasCommon ? 'pointer' : 'not-allowed', opacity: hasCommon ? 1 : 0.4,
                      transition: 'all .1s'
                    }}
                  >
                    <span style={{ fontSize: '11px', color: isSel ? 'var(--purple)' : 'var(--text3)', fontWeight: 500 }}>{DAYS[dayIdx].substring(0,3)}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: isSel ? 'var(--purple)' : 'var(--text)' }}>{date.getDate()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {selectedDate && hoursForSelectedDay.length > 0 && (
            <div>
              <label style={lbl}>Saat Seç (Çoklu seçebilirsiniz)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '12px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg2)' }}>
                {hoursForSelectedDay.map(h => {
                  const isSel = selectedSlots.includes(h)
                  return (
                    <button key={h} onClick={() => setSelectedSlots(prev => prev.includes(h) ? prev.filter(s => s !== h) : [...prev, h])} style={{
                      padding: '8px 14px', fontSize: '13px', borderRadius: 'var(--radius)',
                      border: isSel ? 'none' : '0.5px solid var(--border)', cursor: 'pointer',
                      background: isSel ? 'var(--purple)' : 'var(--bg)', color: isSel ? '#fff' : 'var(--text)',
                      fontWeight: isSel ? 600 : 400
                    }}>
                      {h}:00
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label style={lbl}>Kısa Not (Opsiyonel)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Hangi konuya çalışalım?" rows={2} style={{ ...inp, resize: 'none', lineHeight: 1.5 }} />
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={secBtn}>İptal</button>
          <button onClick={handleSend} disabled={sending || !selectedDate || selectedSlots.length === 0} style={{ ...priBtn, opacity: (!selectedDate || selectedSlots.length === 0) ? 0.5 : 1 }}>
            {sending ? 'Gönderiliyor...' : 'Teklif Gönder'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: '12px', color: 'var(--text2)', display: 'block', marginBottom: '6px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: '13px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }
const priBtn: React.CSSProperties = { padding: '8px 20px', fontSize: '13px', fontWeight: 500, background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }
const secBtn: React.CSSProperties = { padding: '8px 20px', fontSize: '13px', background: 'none', color: 'var(--text2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' }

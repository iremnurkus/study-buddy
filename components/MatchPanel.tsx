'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MatchedUser, Profile, FriendRequest } from '@/types'

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const COLORS = ['#dbeafe','#d1fae5','#fee2e2','#e0e7ff','#fef3c7','#dcfce7']
const TEXT_COLORS = ['#1e40af','#065f46','#991b1b','#3730a3','#92400e','#166534']

function getColorIdx(str: string) {
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h % COLORS.length
}

function Avatar({ name, size = 44 }: { name: string, size?: number }) {
  const i = getColorIdx(name)
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: COLORS[i], color: TEXT_COLORS[i],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 600, flexShrink: 0
    }}>{initials}</div>
  )
}

type Props = {
  currentUser: Profile
  onStartChat: (userId: string) => void
  onClose: () => void
}

export default function MatchPanel({ currentUser, onStartChat, onClose }: Props) {
  const supabase = createClient()
  const [matches, setMatches] = useState<MatchedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'year'|'subject'>('all')
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [tab, setTab] = useState<'discover'|'requests'>('discover')
  const [sending, setSending] = useState<string | null>(null)

  useEffect(() => { loadMatches() }, [])

  async function loadMatches() {
    setLoading(true)

    // Kendi derslerim ve müsaitliğim
    const [{ data: mySubjects }, { data: myAvail }] = await Promise.all([
      supabase.from('user_subjects').select('subject').eq('user_id', currentUser.id),
      supabase.from('availability').select('day,hour').eq('user_id', currentUser.id)
    ])

    // Tüm diğer kullanıcılar
    const { data: allUsers } = await supabase
      .from('profiles').select('*').neq('id', currentUser.id)

    // Tüm dersler ve müsaitlikler
    const { data: allSubjects } = await supabase.from('user_subjects').select('*')
    const { data: allAvail } = await supabase.from('availability').select('*')

    // İstekler
    const { data: reqs } = await supabase
      .from('friend_requests').select('*')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    setRequests(reqs ?? [])

    const mySubjectSet = new Set((mySubjects ?? []).map((s: any) => s.subject))
    const mySlotSet = new Set((myAvail ?? []).map((a: any) => `${a.day}-${a.hour}`))

    const matched: MatchedUser[] = (allUsers ?? []).map((user: any) => {
      const userSubjects = (allSubjects ?? []).filter((s: any) => s.user_id === user.id).map((s: any) => s.subject)
      const userSlots = new Set((allAvail ?? []).filter((a: any) => a.user_id === user.id).map((a: any) => `${a.day}-${a.hour}`))

      const commonSubjects = userSubjects.filter((s: string) => mySubjectSet.has(s))
      const commonSlots = Array.from(mySlotSet).filter(s => userSlots.has(s)).length

      const req = (reqs ?? []).find((r: FriendRequest) =>
        (r.sender_id === currentUser.id && r.receiver_id === user.id) ||
        (r.sender_id === user.id && r.receiver_id === currentUser.id)
      )
      let requestStatus: MatchedUser['requestStatus'] = 'none'
      if (req) {
        if (req.status === 'accepted') requestStatus = 'accepted'
        else if (req.sender_id === currentUser.id) requestStatus = 'pending_sent'
        else requestStatus = 'pending_received'
      }

      // Skor: ortak saat x1 + aynı sınıf x5 (dersler sadece bilgi amaçlı)
      const yearBonus = user.year === currentUser.year ? 5 : 0
      const matchScore = commonSlots + yearBonus

      return { ...user, matchScore, commonSubjects, commonSlots, requestStatus }
    })

    matched.sort((a, b) => b.matchScore - a.matchScore)
    setMatches(matched)
    setLoading(false)
  }

  async function sendRequest(receiverId: string) {
    setSending(receiverId)
    await supabase.from('friend_requests').insert({ sender_id: currentUser.id, receiver_id: receiverId })
    await loadMatches()
    setSending(null)
  }

  async function respondRequest(requestId: string, status: 'accepted' | 'rejected') {
    await supabase.from('friend_requests').update({ status }).eq('id', requestId)
    await loadMatches()
  }

  const pendingReceived = requests.filter(r => r.receiver_id === currentUser.id && r.status === 'pending')

  const filtered = matches.filter(m => {
    if (filter === 'year') return m.year === currentUser.year
    if (filter === 'subject') return m.commonSubjects.length > 0
    return true
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
        width: '600px', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>GaziÇArk Bul 🔍</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text3)' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            <button onClick={() => setTab('discover')} style={{
              padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: tab === 'discover' ? '2px solid var(--purple)' : '2px solid transparent',
              color: tab === 'discover' ? 'var(--purple)' : 'var(--text2)', fontWeight: tab === 'discover' ? 500 : 400
            }}>Keşfet</button>
            <button onClick={() => setTab('requests')} style={{
              padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: tab === 'requests' ? '2px solid var(--purple)' : '2px solid transparent',
              color: tab === 'requests' ? 'var(--purple)' : 'var(--text2)', fontWeight: tab === 'requests' ? 500 : 400
            }}>
              İstekler {pendingReceived.length > 0 && (
                <span style={{
                  background: '#E24B4A', color: '#fff', fontSize: '10px',
                  borderRadius: '10px', padding: '1px 6px', marginLeft: '4px'
                }}>{pendingReceived.length}</span>
              )}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

          {tab === 'discover' && (
            <>
              {/* Filtreler */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(['all', 'year', 'subject'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '5px 14px', fontSize: '12px', borderRadius: '20px',
                    border: '0.5px solid var(--border)', cursor: 'pointer',
                    background: filter === f ? 'var(--purple)' : 'var(--bg2)',
                    color: filter === f ? '#fff' : 'var(--text2)'
                  }}>
                    {f === 'all' ? 'Hepsi' : f === 'year' ? 'Aynı sınıf' : 'Ortak ders'}
                  </button>
                ))}
              </div>

              {loading ? (
                <p style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>Yükleniyor...</p>
              ) : filtered.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>
                  Eşleşen kullanıcı bulunamadı. Profilini tamamla!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filtered.map(user => (
                    <div key={user.id} style={{
                      background: 'var(--bg2)', borderRadius: 'var(--radius)',
                      padding: '14px 16px', border: '0.5px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <Avatar name={user.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600 }}>{user.name}</span>
                            <span style={{
                              fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                              background: 'var(--purple-light)', color: 'var(--purple-dark)'
                            }}>{user.year}. Sınıf</span>
                            {user.matchScore > 0 && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                background: '#dbeafe', color: '#1e40af'
                              }}>%{Math.min(100, user.matchScore * 8)} uyum</span>
                            )}
                          </div>

                          {user.bio && (
                            <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>{user.bio}</p>
                          )}

                          {user.commonSubjects.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                              {user.commonSubjects.map(s => (
                                <span key={s} style={{
                                  fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                  background: '#dbeafe', color: '#1e40af'
                                }}>{s}</span>
                              ))}
                            </div>
                          )}

                          {user.commonSlots > 0 && (
                            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
                              🕐 {user.commonSlots} ortak müsait saat
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                          {user.requestStatus === 'none' && (
                            <button onClick={() => sendRequest(user.id)} disabled={sending === user.id} style={{
                              padding: '6px 14px', fontSize: '12px', fontWeight: 500,
                              background: 'var(--purple)', color: '#fff', border: 'none',
                              borderRadius: 'var(--radius)', cursor: 'pointer', whiteSpace: 'nowrap'
                            }}>
                              {sending === user.id ? '...' : 'İstek Gönder'}
                            </button>
                          )}
                          {user.requestStatus === 'pending_sent' && (
                            <span style={{ fontSize: '12px', color: 'var(--text3)', padding: '6px 0' }}>İstek gönderildi</span>
                          )}
                          {user.requestStatus === 'pending_received' && (
                            <span style={{ fontSize: '12px', color: '#E24B4A', padding: '6px 0' }}>İstek bekliyor</span>
                          )}
                          {user.requestStatus === 'accepted' && (
                            <button onClick={() => onStartChat(user.id)} style={{
                              padding: '6px 14px', fontSize: '12px', fontWeight: 500,
                              background: '#1D9E75', color: '#fff', border: 'none',
                              borderRadius: 'var(--radius)', cursor: 'pointer'
                            }}>Mesaj At</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'requests' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingReceived.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>
                  Bekleyen istek yok
                </p>
              ) : pendingReceived.map(req => {
                const sender = matches.find(m => m.id === req.sender_id)
                if (!sender) return null
                return (
                  <div key={req.id} style={{
                    background: 'var(--bg2)', borderRadius: 'var(--radius)',
                    padding: '14px 16px', border: '0.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '12px'
                  }}>
                    <Avatar name={sender.name} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{sender.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{sender.year}. Sınıf</div>
                      {sender.commonSubjects.length > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                          Ortak dersler: {sender.commonSubjects.join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => respondRequest(req.id, 'rejected')} style={{
                        padding: '6px 12px', fontSize: '12px', borderRadius: 'var(--radius)',
                        border: '0.5px solid var(--border)', background: 'none',
                        color: 'var(--text2)', cursor: 'pointer'
                      }}>Reddet</button>
                      <button onClick={() => respondRequest(req.id, 'accepted')} style={{
                        padding: '6px 12px', fontSize: '12px', borderRadius: 'var(--radius)',
                        border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer'
                      }}>Kabul Et</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

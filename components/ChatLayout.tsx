'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Message } from '@/types'
import ProfilePanel from './ProfilePanel'
import MatchPanel from './MatchPanel'

type Props = {
  currentUser: Profile
  allUsers: Profile[]
  initialConversations: any[]
}

const SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'İngilizce', 'Türkçe', 'Genel']

const COLORS = ['#EEEDFE', '#E1F5EE', '#FAECE7', '#E6F1FB', '#FAEEDA', '#EAF3DE']
const TEXT_COLORS = ['#3C3489', '#085041', '#4A1B0C', '#0C447C', '#633806', '#3B6D11']

function getColorIdx(str: string) {
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h % COLORS.length
}

function Avatar({ name, size = 36 }: { name: string, size?: number }) {
  const i = getColorIdx(name)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: COLORS[i], color: TEXT_COLORS[i],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 600, flexShrink: 0
    }}>{initials}</div>
  )
}

export default function ChatLayout({ currentUser, allUsers, initialConversations }: Props) {
  const supabase = createClient()
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<any[]>(initialConversations)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [profileName, setProfileName] = useState(currentUser?.name ?? '')
  const [profileSubject, setProfileSubject] = useState(currentUser?.subject ?? 'Genel')
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [showMatch, setShowMatch] = useState(false)
  const [mySubjects, setMySubjects] = useState<string[]>([])
  const [myAvailability, setMyAvailability] = useState<{day:number,hour:number}[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadMyData() }, [])

  async function loadMyData() {
    const [{ data: subs }, { data: avail }, { data: reqs }] = await Promise.all([
      supabase.from('user_subjects').select('subject').eq('user_id', currentUser?.id),
      supabase.from('availability').select('day,hour').eq('user_id', currentUser?.id),
      supabase.from('friend_requests').select('id').eq('receiver_id', currentUser?.id).eq('status', 'pending')
    ])
    setMySubjects((subs ?? []).map((s: any) => s.subject))
    setMyAvailability(avail ?? [])
    setPendingCount((reqs ?? []).length)
  }

  async function startConversationByUserId(userId: string) {
    setShowMatch(false)
    const user = allUsers.find(u => u.id === userId)
    if (user) await startConversation(user)
  }

  // Aktif konuşmanın diğer kullanıcısı
  const activeConv = conversations.find(c => c.id === activeConvId)
  const otherUserId = activeConv
    ? (activeConv.user1 === currentUser?.id ? activeConv.user2 : activeConv.user1)
    : null
  const otherUser = allUsers.find(u => u.id === otherUserId)

  // Presence (online durumu)
  useEffect(() => {
    if (!currentUser) return
    const channel = supabase.channel('online-users', {
      config: { presence: { key: currentUser.id } }
    })
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnline(new Set(Object.keys(state)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: currentUser.id })
        }
      })
    return () => { supabase.removeChannel(channel) }
  }, [currentUser?.id])

  // Mesajları yükle + realtime abone ol
  useEffect(() => {
    if (!activeConvId) return
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', activeConvId)
      .order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    const channel = supabase
      .channel(`messages:${activeConvId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConvId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeConvId])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function startConversation(user: Profile) {
    // Mevcut konuşma var mı kontrol et
    const existing = conversations.find(c =>
      (c.user1 === currentUser.id && c.user2 === user.id) ||
      (c.user1 === user.id && c.user2 === currentUser.id)
    )
    if (existing) { setActiveConvId(existing.id); return }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user1: currentUser.id, user2: user.id })
      .select()
      .single()

    if (!error && data) {
      setConversations(prev => [data, ...prev])
      setActiveConvId(data.id)
    }
  }

  async function sendMessage() {
    if (!input.trim() || !activeConvId || !currentUser) return
    const content = input.trim()
    setInput('')
    await supabase.from('messages').insert({
      conversation_id: activeConvId,
      sender_id: currentUser.id,
      content
    })
  }

  async function saveProfile() {
    await supabase.from('profiles')
      .update({ name: profileName, subject: profileSubject })
      .eq('id', currentUser.id)
    setShowProfile(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.subject?.toLowerCase().includes(search.toLowerCase())
  )

  function formatTime(ts: string) {
    const d = new Date(ts)
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg2)' }}>

      {/* SIDEBAR */}
      <div style={{
        width: '280px', flexShrink: 0, background: 'var(--bg)',
        borderRight: '0.5px solid var(--border)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px', borderBottom: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>📚 Study Buddy</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowMatch(true)} style={{
              ...iconBtn, position: 'relative',
              background: 'var(--purple-light)', borderRadius: 'var(--radius)',
              padding: '4px 10px', fontSize: '12px', color: 'var(--purple)'
            }}>
              🔍 Buddy Bul
              {pendingCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: '#E24B4A', color: '#fff', fontSize: '9px',
                  borderRadius: '50%', width: '14px', height: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{pendingCount}</span>
              )}
            </button>
            <button onClick={() => setShowProfile(true)} style={iconBtn}>⚙️</button>
            <button onClick={signOut} style={iconBtn}>↩</button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)' }}>
          <input
            placeholder="Arkadaş ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Kullanıcı listesi */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filteredUsers.length === 0 && (
            <p style={{ padding: '12px', fontSize: '13px', color: 'var(--text3)', textAlign: 'center' }}>
              Kullanıcı bulunamadı
            </p>
          )}
          {filteredUsers.map(user => {
            const conv = conversations.find(c =>
              (c.user1 === currentUser?.id && c.user2 === user.id) ||
              (c.user1 === user.id && c.user2 === currentUser?.id)
            )
            const isActive = conv?.id === activeConvId
            const isOnline = online.has(user.id)
            const lastMsg = conv?.messages?.[conv.messages.length - 1]

            return (
              <div
                key={user.id}
                onClick={() => startConversation(user)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 8px', borderRadius: 'var(--radius)',
                  cursor: 'pointer', transition: 'background 0.1s',
                  background: isActive ? 'var(--bg2)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ position: 'relative' }}>
                  <Avatar name={user.name} />
                  {isOnline && (
                    <span style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: '9px', height: '9px', borderRadius: '50%',
                      background: '#1D9E75', border: '2px solid var(--bg)'
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{user.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    {lastMsg ? lastMsg.content.slice(0, 28) + (lastMsg.content.length > 28 ? '…' : '') : user.subject}
                  </div>
                </div>
                {lastMsg && (
                  <div style={{ fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>
                    {formatTime(lastMsg.created_at)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Current user footer */}
        <div style={{
          padding: '12px 16px', borderTop: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <Avatar name={currentUser?.name ?? '?'} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 500 }}>{currentUser?.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{currentUser?.subject}</div>
          </div>
        </div>
      </div>

      {/* CHAT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!activeConvId ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
            color: 'var(--text3)'
          }}>
            <span style={{ fontSize: '48px' }}>📖</span>
            <p style={{ fontSize: '15px' }}>Bir arkadaş seç ve sohbet başlat</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{
              padding: '14px 20px', borderBottom: '0.5px solid var(--border)',
              background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              {otherUser && <Avatar name={otherUser.name} />}
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{otherUser?.name}</div>
                <div style={{ fontSize: '12px', color: online.has(otherUserId ?? '') ? '#1D9E75' : 'var(--text3)' }}>
                  {online.has(otherUserId ?? '') ? '● Çevrimiçi' : 'Çevrimdışı'} · {otherUser?.subject}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '20px',
              display: 'flex', flexDirection: 'column', gap: '10px'
            }}>
              {messages.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', marginTop: '20px' }}>
                  Henüz mesaj yok. İlk mesajı sen gönder! 👋
                </p>
              )}
              {messages.map(msg => {
                const isMine = msg.sender_id === currentUser?.id
                return (
                  <div key={msg.id} style={{
                    display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start',
                    gap: '8px', alignItems: 'flex-end'
                  }}>
                    {!isMine && otherUser && <Avatar name={otherUser.name} size={28} />}
                    <div>
                      <div style={{
                        padding: '9px 14px',
                        borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMine ? 'var(--purple)' : 'var(--bg)',
                        color: isMine ? '#fff' : 'var(--text)',
                        border: isMine ? 'none' : '0.5px solid var(--border)',
                        fontSize: '14px', lineHeight: 1.5,
                        maxWidth: '480px', wordBreak: 'break-word'
                      }}>
                        {msg.content}
                      </div>
                      <div style={{
                        fontSize: '10px', color: 'var(--text3)', marginTop: '3px',
                        textAlign: isMine ? 'right' : 'left'
                      }}>
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '14px 20px', borderTop: '0.5px solid var(--border)',
              background: 'var(--bg)', display: 'flex', gap: '10px', alignItems: 'flex-end'
            }}>
              <textarea
                value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Mesaj yaz... (Enter = gönder)"
                rows={1}
                style={{
                  flex: 1, padding: '10px 14px', fontSize: '14px',
                  border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg2)', color: 'var(--text)', outline: 'none',
                  resize: 'none', lineHeight: 1.5, minHeight: '42px', maxHeight: '120px',
                  overflow: 'hidden'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                style={{
                  padding: '10px 20px', fontSize: '14px', fontWeight: 500,
                  background: input.trim() ? 'var(--purple)' : 'var(--bg3)',
                  color: input.trim() ? '#fff' : 'var(--text3)',
                  border: 'none', borderRadius: 'var(--radius)', cursor: input.trim() ? 'pointer' : 'default',
                  transition: 'all 0.15s', flexShrink: 0
                }}
              >
                Gönder
              </button>
            </div>
          </>
        )}
      </div>

      {/* PROFILE PANEL */}
      {showProfile && (
        <ProfilePanel
          currentUser={currentUser}
          initialSubjects={mySubjects}
          initialAvailability={myAvailability}
          onClose={() => setShowProfile(false)}
          onSave={loadMyData}
        />
      )}

      {/* MATCH PANEL */}
      {showMatch && (
        <MatchPanel
          currentUser={currentUser}
          onStartChat={startConversationByUserId}
          onClose={() => { setShowMatch(false); loadMyData() }}
        />
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: '13px',
  border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
  background: 'var(--bg2)', color: 'var(--text)', outline: 'none', width: '100%'
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '16px', padding: '4px', opacity: 0.7
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 18px', fontSize: '13px', fontWeight: 500,
  background: 'var(--purple)', color: '#fff', border: 'none',
  borderRadius: 'var(--radius)', cursor: 'pointer'
}

const secondaryBtn: React.CSSProperties = {
  padding: '8px 18px', fontSize: '13px',
  background: 'none', color: 'var(--text2)',
  border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius)', cursor: 'pointer'
}

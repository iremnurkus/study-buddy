'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Message, StudyProposal } from '@/types'
import ProfilePanel from './ProfilePanel'
import MatchPanel from './MatchPanel'
import StudyProposalModal from './StudyProposalModal'

const TIP_SUBJECTS = ['Anatomi','Fizyoloji','Biyokimya','Histoloji','Mikrobiyoloji','Patoloji','Farmakoloji','İmmünoloji','Dahiliye','Cerrahi','Pediatri','Kadın Doğum','Psikiyatri','Nöroloji','Kardiyoloji','Radyoloji','TUS Hazırlık','Klinik Beceriler']
const DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']
const HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]
const COLORS = ['#d5edeb','#d1fae5','#fef3c7','#e0e7ff','#fce7f3','#dcfce7']
const TCOLS = ['#0a5a54','#065f46','#92400e','#3730a3','#9d174d','#166534']

function cidx(s:string){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))&0xffff;return h%COLORS.length}
function Avatar({name,size=36}:{name:string,size?:number}){
  const i=cidx(name),ini=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return <div style={{width:size,height:size,borderRadius:'50%',background:COLORS[i],color:TCOLS[i],display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.35,fontWeight:600,flexShrink:0}}>{ini}</div>
}

type Props={currentUser:Profile,allUsers:Profile[],initialConversations:any[],initialSubjects:string[],initialAvailability:{day:number,hour:number}[]}

export default function Dashboard({currentUser,allUsers,initialConversations,initialSubjects,initialAvailability}:Props){
  const sb=createClient()
  const [subjects,setSubjects]=useState<string[]>(initialSubjects)
  const [avail,setAvail]=useState<Set<string>>(new Set(initialAvailability.map(a=>`${a.day}-${a.hour}`)))
  const [savingP,setSavingP]=useState(false)
  const [saved,setSaved]=useState(false)
  const [showPanel,setShowPanel]=useState(false)
  const [feed,setFeed]=useState<any[]>([])
  const [loadingFeed,setLoadingFeed]=useState(true)
  const [convs,setConvs]=useState<any[]>(initialConversations)
  const [activeConv,setActiveConv]=useState<string|null>(null)
  const [msgs,setMsgs]=useState<Message[]>([])
  const [input,setInput]=useState('')
  const [online,setOnline]=useState<Set<string>>(new Set())
  const [showProfile,setShowProfile]=useState(false)
  const [showMatch,setShowMatch]=useState(false)
  const [showPlans,setShowPlans]=useState(false)
  const [selectedPlanDate,setSelectedPlanDate]=useState<string|null>(null)
  const [pending,setPending]=useState(0)
  const [expandedUser,setExpandedUser]=useState<string|null>(null)
  const [proposalTarget,setProposalTarget]=useState<any|null>(null)
  const [proposals,setProposals]=useState<StudyProposal[]>([])
  const [pendingProposalsCount,setPendingProposalsCount]=useState(0)
  const endRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{loadFeed();loadPending();loadProposals();requestNotificationPermission()},[])

  async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'denied') {
      await Notification.requestPermission()
    }
  }

  async function loadProposals() {
    const { data } = await sb.from('study_proposals')
      .select('*')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })
    
    const props = data as StudyProposal[] || []
    setProposals(props)
    
    const pCount = props.filter(p => p.receiver_id === currentUser.id && p.status === 'pending').length
    setPendingProposalsCount(pCount)
  }

  // Hatırlatıcı kontrolcüsü
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()

      proposals.forEach(p => {
        if (p.status !== 'accepted' || !p.date) return
        const pHours = p.hours ? p.hours : ((p as any).hour ? [(p as any).hour] : [])
        const [y, m, d] = p.date.split('-').map(Number)
        
        pHours.forEach(h => {
          const proposalTime = new Date(y, m - 1, d, h, 0, 0).getTime()
          const diffMinutes = Math.round((proposalTime - now.getTime()) / 60000)

          let msg = ''
          if (diffMinutes === 24 * 60) {
            msg = `Yarın ${p.subject} çalışmanız var!`
          } else if (diffMinutes === 10) {
            msg = `${p.subject} çalışmanız 10 dakika sonra başlıyor!`
          } else if (diffMinutes === 5) {
            msg = `${p.subject} çalışmanız 5 dakika sonra başlıyor!`
          }

          if (msg) {
            const otherId = p.sender_id === currentUser.id ? p.receiver_id : p.sender_id
            const other = allUsers.find(u => u.id === otherId)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Birlikte Çalışma Hatırlatması', {
                body: `${other?.name || 'Arkadaşın'} ile ${msg}`,
                icon: '/favicon.ico'
              })
            }
          }
        })
      })
    }, 60000) // Her dakika kontrol et

    return () => clearInterval(interval)
  }, [proposals, allUsers, currentUser.id])

  async function loadPending(){
    const {data}=await sb.from('friend_requests').select('id').eq('receiver_id',currentUser.id).eq('status','pending')
    setPending((data??[]).length)
  }

  async function loadFeed(){
    setLoadingFeed(true)
    const [mySubs,myAv,allSubs,allAv,reqs,users]=await Promise.all([
      sb.from('user_subjects').select('subject').eq('user_id',currentUser.id),
      sb.from('availability').select('day,hour').eq('user_id',currentUser.id),
      sb.from('user_subjects').select('*'),
      sb.from('availability').select('*'),
      sb.from('friend_requests').select('*').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`),
      sb.from('profiles').select('*').neq('id',currentUser.id)
    ])
    const mySS=new Set((mySubs.data??[]).map((s:any)=>s.subject))
    const mySlots=new Set((myAv.data??[]).map((a:any)=>`${a.day}-${a.hour}`))
    const items=(users.data??[]).map((u:any)=>{
      const us=(allSubs.data??[]).filter((s:any)=>s.user_id===u.id).map((s:any)=>s.subject)
      const uSlotsSet=new Set((allAv.data??[]).filter((a:any)=>a.user_id===u.id).map((a:any)=>`${a.day}-${a.hour}`))
      const common=us.filter((s:string)=>mySS.has(s))
      const commonSlots=Array.from(mySlots).filter(s=>uSlotsSet.has(s)).length
      const req=(reqs.data??[]).find((r:any)=>(r.sender_id===currentUser.id&&r.receiver_id===u.id)||(r.sender_id===u.id&&r.receiver_id===currentUser.id))
      let rs:'none'|'pending_sent'|'pending_received'|'accepted'='none'
      if(req){if(req.status==='accepted')rs='accepted';else if(req.sender_id===currentUser.id)rs='pending_sent';else rs='pending_received'}
      
      const matchPercent=mySlots.size>0?Math.round((commonSlots/mySlots.size)*100):0
      const score=commonSlots
      
      const days=Array.from(uSlotsSet).map(k=>Number(k.split('-')[0]))
      const uniqueDays=Array.from(new Set(days)).sort()
      const userSlots=Array.from(uSlotsSet)
      return{...u,common,commonSlots,score,matchPercent,rs,uniqueDays,userSubjects:us,userSlots}
    }).filter((u:any)=>u.userSubjects.length>0||Array.from(avail).length>0).sort((a:any,b:any)=>b.score-a.score)
    setFeed(items)
    setLoadingFeed(false)
  }

  useEffect(()=>{
    if(!currentUser)return
    const ch=sb.channel('online',{config:{presence:{key:currentUser.id}}})
    ch.on('presence',{event:'sync'},()=>setOnline(new Set(Object.keys(ch.presenceState())))).subscribe(async s=>{if(s==='SUBSCRIBED')await ch.track({user_id:currentUser.id})})
    return()=>{sb.removeChannel(ch)}
  },[currentUser?.id])

  useEffect(()=>{
    if(!activeConv)return
    sb.from('messages').select('*').eq('conversation_id',activeConv).order('created_at').then(({data})=>setMsgs(data??[]))
    const ch=sb.channel(`m:${activeConv}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${activeConv}`},(p)=>setMsgs(prev=>[...prev,p.new as Message])).subscribe()
    return()=>{sb.removeChannel(ch)}
  },[activeConv])

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[msgs])

  async function saveProposal(){
    setSavingP(true)
    await sb.from('user_subjects').delete().eq('user_id',currentUser.id)
    if(subjects.length)await sb.from('user_subjects').insert(subjects.map(s=>({user_id:currentUser.id,subject:s})))
    await sb.from('availability').delete().eq('user_id',currentUser.id)
    const slots=Array.from(avail).map(k=>{const[d,h]=k.split('-').map(Number);return{user_id:currentUser.id,day:d,hour:h}})
    if(slots.length)await sb.from('availability').insert(slots)
    setSavingP(false);setSaved(true);setTimeout(()=>setSaved(false),2500)
    loadFeed()
  }

  async function sendReq(rid:string){
    await sb.from('friend_requests').insert({sender_id:currentUser.id,receiver_id:rid})
    loadFeed()
  }

  async function startChat(userId:string){
    setShowMatch(false)
    const ex=convs.find(c=>(c.user1===currentUser.id&&c.user2===userId)||(c.user1===userId&&c.user2===currentUser.id))
    if(ex){setActiveConv(ex.id);return}
    const{data,error}=await sb.from('conversations').insert({user1:currentUser.id,user2:userId}).select().single()
    if(!error&&data){setConvs(p=>[data,...p]);setActiveConv(data.id)}
  }

  async function sendMsg(){
    if(!input.trim()||!activeConv)return
    const c=input.trim();setInput('')
    await sb.from('messages').insert({conversation_id:activeConv,sender_id:currentUser.id,content:c})
  }

  const ac=convs.find(c=>c.id===activeConv)
  const othId=ac?(ac.user1===currentUser.id?ac.user2:ac.user1):null
  const oth=allUsers.find(u=>u.id===othId)
  const convsU=convs.map(c=>{const oid=c.user1===currentUser.id?c.user2:c.user1;const o=allUsers.find(u=>u.id===oid);const ms=c.messages??[];return{...c,o,last:ms[ms.length-1]}})
  const fmt=(ts:string)=>new Date(ts).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})

  return(
    <div style={{display:'flex',height:'100vh',background:'var(--bg2)',overflow:'hidden'}}>

      {/* SIDEBAR */}
      <div style={{width:200,flexShrink:0,background:'var(--bg)',borderRight:'0.5px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'16px 14px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:22}}>📚</span>
          <span style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>GaziÇArk</span>
        </div>
        <div style={{flex:1,padding:'8px 6px',display:'flex',flexDirection:'column',gap:2}}>
          <SideBtn id="sb-teklif" active={showPanel} label="Kendi Programım" title="Kendi Programım" onClick={()=>{setShowPanel(p=>!p);setShowPlans(false)}}>📋</SideBtn>
          <SideBtn id="sb-buddy" label="Arkadaş Bul" title="Arkadaş Bul" onClick={()=>setShowMatch(true)} badge={pending}>🔍</SideBtn>
          <SideBtn id="sb-planlar" active={showPlans} label="Çalışma Planım" title="Çalışma Planım" onClick={()=>{setShowPlans(p=>!p);setShowPanel(false)}} badge={pendingProposalsCount}>📅</SideBtn>
          <SideBtn id="sb-profil" label="Profil" title="Profil" onClick={()=>setShowProfile(true)}>⚙️</SideBtn>
        </div>
        <div style={{padding:'8px 6px',borderTop:'0.5px solid var(--border)'}}>
          <SideBtn id="sb-cikis" label="Çıkış" title="Çıkış" onClick={async()=>{await sb.auth.signOut();window.location.href='/auth'}}>↩</SideBtn>
        </div>
      </div>

      {/* PROPOSAL PANEL */}
      {showPanel&&(
        <div style={{width:360,flexShrink:0,background:'var(--bg)',borderRight:'0.5px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideIn .2s ease'}}>
          <div style={{padding:'16px 16px 12px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>📋 Çalışma Teklifim</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Ders ve program seç</div>
            </div>
            <button onClick={()=>setShowPanel(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text3)'}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Dersler <span style={{fontWeight:400,color:'var(--text3)'}}>({subjects.length})</span></div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:20}}>
              {TIP_SUBJECTS.map(s=>(
                <button key={s} onClick={()=>setSubjects(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])} style={{padding:'4px 10px',fontSize:11,borderRadius:20,border:'0.5px solid var(--border)',cursor:'pointer',background:subjects.includes(s)?'var(--purple)':'var(--bg2)',color:subjects.includes(s)?'#fff':'var(--text)',transition:'all .1s'}}>{s}</button>
              ))}
            </div>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Program <span style={{fontWeight:400,color:'var(--text3)'}}>({avail.size} slot)</span></div>
            <div style={{overflowX:'auto'}}>
              <table style={{borderCollapse:'collapse',fontSize:10,width:'100%'}}>
                <thead><tr><th style={{width:28,color:'var(--text3)',fontWeight:400}}/>{DAYS.map(d=><th key={d} style={{padding:'2px 3px',color:'var(--text2)',fontWeight:500,textAlign:'center'}}>{d}</th>)}</tr></thead>
                <tbody>{HOURS.map(h=>(
                  <tr key={h}>
                    <td style={{padding:'2px 4px 2px 0',color:'var(--text3)',whiteSpace:'nowrap'}}>{h}:00</td>
                    {DAYS.map((_,d)=>{const a=avail.has(`${d}-${h}`);return<td key={d} onClick={()=>{const k=`${d}-${h}`;setAvail(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n})}} style={{width:32,height:22,cursor:'pointer',background:a?'var(--purple)':'var(--bg2)',border:'1px solid var(--bg)',borderRadius:3,transition:'background .1s'}}/>})}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div style={{padding:'12px 16px',borderTop:'0.5px solid var(--border)'}}>
            <button id="btn-teklif-kaydet" onClick={saveProposal} disabled={savingP} style={{width:'100%',padding:10,fontSize:13,fontWeight:600,background:saved?'#1D9E75':'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer',transition:'background .25s'}}>
              {savingP?'Kaydediliyor..':saved?'✓ Kaydedildi!':'Teklifi Güncelle'}
            </button>
          </div>
        </div>
      )}

      {/* WORK PLANS PANEL */}
      {showPlans&&(
        <div style={{width:360,flexShrink:0,background:'var(--bg)',borderRight:'0.5px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideIn .2s ease'}}>
          <div style={{padding:'16px 16px 12px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>📅 Çalışma Planım</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Takvimden gün seçerek filtreleyebilirsiniz</div>
            </div>
            <button onClick={()=>setShowPlans(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text3)'}}>✕</button>
          </div>
          
          {/* Mini Calendar Filter */}
          <div style={{padding:'12px 16px',borderBottom:'0.5px solid var(--border)',background:'var(--bg2)'}}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {Array.from({length: 14}).map((_, i) => {
                const d = new Date()
                d.setDate(d.getDate() + i)
                const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                const dayIdx = (d.getDay() + 6) % 7
                const hasProposals = proposals.some(p => p.date === dateStr && p.status !== 'rejected')
                const isSel = selectedPlanDate === dateStr
                
                return (
                  <div 
                    key={dateStr} 
                    onClick={() => setSelectedPlanDate(p => p === dateStr ? null : dateStr)}
                    style={{
                      width: '100%', height: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 'var(--radius)', border: isSel ? '2px solid var(--purple)' : '1px solid var(--border)',
                      background: isSel ? 'var(--purple-light)' : 'var(--bg)',
                      cursor: 'pointer', position: 'relative',
                      transition: 'all .1s'
                    }}
                  >
                    <span style={{ fontSize: '10px', color: isSel ? 'var(--purple)' : 'var(--text3)', fontWeight: 500 }}>{DAYS[dayIdx].substring(0,3)}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: isSel ? 'var(--purple)' : 'var(--text)' }}>{d.getDate()}</span>
                    {hasProposals && <span style={{position:'absolute',bottom:'4px',width:'4px',height:'4px',borderRadius:'50%',background:'var(--purple)'}}/>}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
            {proposals.length === 0 ? (
               <div style={{textAlign:'center',color:'var(--text3)',paddingTop:40}}>
                 <div style={{fontSize:32,marginBottom:8}}>📭</div>
                 <p style={{fontSize:13}}>Henüz teklif yok</p>
               </div>
            ) : proposals.filter(p => !selectedPlanDate || p.date === selectedPlanDate).map(p => {
              const isMine = p.sender_id === currentUser.id
              const otherUser = allUsers.find(u => u.id === (isMine ? p.receiver_id : p.sender_id))
              if (!otherUser) return null
              
              // Tarihi formatla
              const pDate = new Date(p.date)
              const pDayIdx = (pDate.getDay() + 6) % 7
              const dateDisplay = `${pDate.getDate()} ${['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][pDate.getMonth()]} ${DAYS[pDayIdx]}`

              return (
                <div key={p.id} style={{background:'var(--bg2)',border:'0.5px solid var(--border)',borderRadius:'var(--radius)',padding:'12px',fontSize:'13px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                    <div style={{fontWeight:600}}>{otherUser.name} ile</div>
                    {p.status === 'pending' ? (
                      <span style={{fontSize:'10px',background:'#fef3c7',color:'#92400e',padding:'2px 6px',borderRadius:'10px'}}>Bekliyor</span>
                    ) : p.status === 'accepted' ? (
                      <span style={{fontSize:'10px',background:'#d1fae5',color:'#065f46',padding:'2px 6px',borderRadius:'10px'}}>Onaylandı</span>
                    ) : (
                      <span style={{fontSize:'10px',background:'#fee2e2',color:'#991b1b',padding:'2px 6px',borderRadius:'10px'}}>Reddedildi</span>
                    )}
                  </div>
                  <div style={{color:'var(--text2)',fontSize:'12px',marginBottom:'8px'}}>
                    📚 {p.subject} <br/>
                    🕒 {dateDisplay} - {(p.hours ? p.hours : ((p as any).hour ? [(p as any).hour] : [])).map(h => `${h}:00`).join(', ')}
                  </div>
                  {p.message && (
                    <div style={{fontSize:'12px',background:'var(--bg)',padding:'6px',borderRadius:'4px',fontStyle:'italic',marginBottom:'8px',color:'var(--text2)'}}>"{p.message}"</div>
                  )}
                  {p.status === 'pending' && !isMine && (
                    <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
                      <button onClick={async ()=>{await sb.from('study_proposals').update({status:'rejected'}).eq('id',p.id);loadProposals()}} style={{flex:1,padding:'6px',fontSize:'12px',background:'none',border:'0.5px solid var(--border)',borderRadius:'var(--radius)',cursor:'pointer'}}>Reddet</button>
                      <button onClick={async ()=>{await sb.from('study_proposals').update({status:'accepted'}).eq('id',p.id);loadProposals()}} style={{flex:1,padding:'6px',fontSize:'12px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}>Kabul Et</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CENTER FEED */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',background:'var(--bg)',borderBottom:'0.5px solid var(--border)',flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:700}}>🎯 Çalışma Teklifleri</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Diğer kullanıcıların çalışma tekliflerini incele</div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {loadingFeed?(
            <div style={{textAlign:'center',color:'var(--text3)',paddingTop:60,fontSize:13}}>Yükleniyor...</div>
          ):feed.length===0?(
            <div style={{textAlign:'center',color:'var(--text3)',paddingTop:60}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <p style={{fontSize:14,fontWeight:500}}>Henüz teklif yok</p>
              <p style={{fontSize:12,marginTop:6}}>Sol panelden kendi teklifini oluştur!</p>
            </div>
          ):feed.map((u:any)=>{
            const isExp=expandedUser===u.id
            const mySlotSet=new Set(Array.from(avail))
            return(
            <div key={u.id} style={{background:'var(--bg)',borderRadius:'var(--radius-lg)',border:isExp?'1.5px solid var(--purple)':'0.5px solid var(--border)',marginBottom:14,transition:'all .2s',overflow:'hidden'}}>
              {/* Compact card - always visible */}
              <div onClick={()=>setExpandedUser(isExp?null:u.id)} style={{padding:'14px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>{if(!isExp)(e.currentTarget.parentElement as HTMLDivElement).style.borderColor='var(--purple)'}} onMouseLeave={e=>{if(!isExp)(e.currentTarget.parentElement as HTMLDivElement).style.borderColor='var(--border)'}}>
                <Avatar name={u.name} size={40}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:14,fontWeight:600}}>{u.name}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:'var(--purple-light)',color:'var(--purple)'}}>{u.year}. Sınıf</span>
                    {u.matchPercent>0&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:'#d5edeb',color:'#0a5a54'}}>%{u.matchPercent} uyum</span>}
                  </div>
                  <div style={{fontSize:12,color:'var(--text3)'}}>
                    {u.userSubjects.length>0?u.userSubjects.slice(0,3).join(', ')+(u.userSubjects.length>3?` +${u.userSubjects.length-3}`:''):'Ders belirtilmemiş'}
                    {u.commonSlots>0&&<span> · 🕐 {u.commonSlots} ortak saat</span>}
                  </div>
                </div>
                <div style={{fontSize:16,color:'var(--text3)',transition:'transform .2s',transform:isExp?'rotate(180deg)':'rotate(0)'}}>▼</div>
              </div>

              {/* Expanded detail */}
              {isExp&&(
                <div style={{padding:'0 16px 16px',borderTop:'0.5px solid var(--border)',animation:'fadeIn .2s ease'}}>
                  {/* Bio */}
                  {u.bio&&<p style={{fontSize:13,color:'var(--text2)',padding:'12px 0 8px',lineHeight:1.5}}>{u.bio}</p>}

                  {/* All subjects */}
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}>📚 Çalıştığı Dersler</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {u.userSubjects.map((s:string)=>{
                        const isCommon=u.common.includes(s)
                        return <span key={s} style={{fontSize:11,padding:'4px 10px',borderRadius:14,background:isCommon?'var(--purple-light)':'var(--bg2)',color:isCommon?'var(--purple-dark)':'var(--text2)',border:isCommon?'1px solid var(--border)':'0.5px solid var(--border)',fontWeight:isCommon?500:400}}>{isCommon?'✓ ':''}{s}</span>
                      })}
                    </div>
                    {u.common.length>0&&<div style={{fontSize:11,color:'var(--purple)',marginTop:6}}>✓ {u.common.length} ortak ders</div>}
                  </div>

                  {/* Availability mini-table */}
                  {u.userSlots.length>0&&(
                    <div style={{marginTop:16}}>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}>🕐 Müsaitlik Programı</div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{borderCollapse:'collapse',fontSize:10,width:'100%'}}>
                          <thead><tr><th style={{width:30,color:'var(--text3)',fontWeight:400}}/>{DAYS.map(d=><th key={d} style={{padding:'2px 3px',color:'var(--text2)',fontWeight:500,textAlign:'center',fontSize:10}}>{d}</th>)}</tr></thead>
                          <tbody>{HOURS.map(h=>{
                            const hasAnyInRow=DAYS.some((_,d)=>u.userSlots.includes(`${d}-${h}`))
                            if(!hasAnyInRow)return null
                            return(
                            <tr key={h}>
                              <td style={{padding:'1px 4px 1px 0',color:'var(--text3)',whiteSpace:'nowrap'}}>{h}:00</td>
                              {DAYS.map((_,d)=>{
                                const slotKey=`${d}-${h}`
                                const theirSlot=u.userSlots.includes(slotKey)
                                const mySlot=mySlotSet.has(slotKey)
                                const isCommonSlot=theirSlot&&mySlot
                                return <td key={d} style={{width:30,height:20,background:isCommonSlot?'var(--purple-dark)':theirSlot?'var(--purple)':'var(--bg2)',border:'1px solid var(--bg)',borderRadius:3,opacity:theirSlot?1:0.4}} title={isCommonSlot?'Ortak müsait!':theirSlot?'Müsait':''}/>
                              })}
                            </tr>
                          )})}</tbody>
                        </table>
                      </div>
                      <div style={{display:'flex',gap:12,marginTop:8,fontSize:10,color:'var(--text3)'}}>
                        <span><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'var(--purple)',verticalAlign:'middle',marginRight:4}}/>Müsait</span>
                        <span><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'var(--purple-dark)',verticalAlign:'middle',marginRight:4}}/>Ortak</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{marginTop:16,display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button onClick={(e)=>{e.stopPropagation();setProposalTarget(u)}} style={{padding:'8px 16px',fontSize:12,fontWeight:500,background:'var(--bg3)',color:'var(--text)',border:'0.5px solid var(--border)',borderRadius:'var(--radius)',cursor:'pointer'}}>📚 Birlikte Çalış</button>
                    {u.rs==='none'&&<button onClick={(e)=>{e.stopPropagation();sendReq(u.id)}} style={{padding:'8px 16px',fontSize:12,fontWeight:500,background:'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}>İstek Gönder</button>}
                    {u.rs==='pending_sent'&&<span style={{fontSize:12,color:'var(--text3)',padding:'8px 0'}}>⏳ İstek gönderildi</span>}
                    {u.rs==='pending_received'&&<span style={{fontSize:12,color:'#E24B4A',padding:'8px 0'}}>📩 İstek bekliyor</span>}
                    {u.rs==='accepted'&&<button onClick={(e)=>{e.stopPropagation();startChat(u.id)}} style={{padding:'8px 16px',fontSize:12,fontWeight:500,background:'#1D9E75',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}>💬 Mesaj At</button>}
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>
      </div>

      {/* RIGHT: MESSAGES */}
      <div style={{width:320,flexShrink:0,borderLeft:'0.5px solid var(--border)',display:'flex',flexDirection:'column',background:'var(--bg)'}}>
        {!activeConv?(
          <>
            <div style={{padding:'14px 16px',borderBottom:'0.5px solid var(--border)',flexShrink:0}}>
              <div style={{fontSize:14,fontWeight:700}}>💬 Mesajlarım</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
              {convsU.length===0?(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,color:'var(--text3)'}}>
                  <span style={{fontSize:36}}>💬</span>
                  <p style={{fontSize:13}}>Henüz sohbet yok</p>
                </div>
              ):convsU.map(c=>(
                <div key={c.id} onClick={()=>setActiveConv(c.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 10px',borderRadius:'var(--radius)',cursor:'pointer',marginBottom:6,border:'0.5px solid var(--border)',transition:'border-color .15s'}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--purple)'} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--border)'}>
                  <div style={{position:'relative'}}>
                    <Avatar name={c.o?.name??'?'} size={32}/>
                    {online.has(c.o?.id??'')&&<span style={{position:'absolute',bottom:0,right:0,width:8,height:8,borderRadius:'50%',background:'#1D9E75',border:'2px solid var(--bg)'}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{c.o?.name??'?'}</div>
                    <div style={{fontSize:11,color:'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.last?c.last.content.slice(0,30)+(c.last.content.length>30?'…':''):c.o?.subject??''}</div>
                  </div>
                  {c.last&&<div style={{fontSize:10,color:'var(--text3)',flexShrink:0}}>{fmt(c.last.created_at)}</div>}
                </div>
              ))}
            </div>
          </>
        ):(
          <>
            <div style={{padding:'12px 14px',borderBottom:'0.5px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <button onClick={()=>{setActiveConv(null);setMsgs([])}} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text2)',padding:'0 4px 0 0'}}>←</button>
              {oth&&<Avatar name={oth.name} size={30}/>}
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{oth?.name}</div>
                <div style={{fontSize:11,color:online.has(othId??'')?'#1D9E75':'var(--text3)'}}>{online.has(othId??'')?'● Çevrimiçi':'Çevrimdışı'}</div>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:8}}>
              {msgs.length===0&&<p style={{textAlign:'center',color:'var(--text3)',fontSize:12,marginTop:16}}>İlk mesajı sen gönder! 👋</p>}
              {msgs.map(m=>{const mine=m.sender_id===currentUser.id;return(
                <div key={m.id} style={{display:'flex',justifyContent:mine?'flex-end':'flex-start',gap:6,alignItems:'flex-end'}}>
                  {!mine&&oth&&<Avatar name={oth.name} size={24}/>}
                  <div>
                    <div style={{padding:'8px 12px',borderRadius:mine?'12px 12px 3px 12px':'12px 12px 12px 3px',background:mine?'var(--purple)':'var(--bg2)',color:mine?'#fff':'var(--text)',border:mine?'none':'0.5px solid var(--border)',fontSize:13,maxWidth:220,wordBreak:'break-word'}}>{m.content}</div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2,textAlign:mine?'right':'left'}}>{fmt(m.created_at)}</div>
                  </div>
                </div>
              )})}
              <div ref={endRef}/>
            </div>
            <div style={{padding:'10px 12px',borderTop:'0.5px solid var(--border)',display:'flex',gap:8,alignItems:'flex-end',flexShrink:0}}>
              <textarea value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,100)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}}} placeholder="Mesaj yaz..." rows={1} style={{flex:1,padding:'8px 12px',fontSize:13,border:'0.5px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg2)',color:'var(--text)',outline:'none',resize:'none',minHeight:38,maxHeight:100,overflow:'hidden'}}/>
              <button onClick={sendMsg} disabled={!input.trim()} style={{padding:'8px 14px',fontSize:13,fontWeight:500,background:input.trim()?'var(--purple)':'var(--bg3)',color:input.trim()?'#fff':'var(--text3)',border:'none',borderRadius:'var(--radius)',cursor:input.trim()?'pointer':'default',flexShrink:0}}>→</button>
            </div>
          </>
        )}
      </div>

      {showProfile&&<ProfilePanel currentUser={currentUser} onClose={()=>setShowProfile(false)} onSave={()=>setShowProfile(false)}/>}
      {showMatch&&<MatchPanel currentUser={currentUser} onStartChat={startChat} onClose={()=>{setShowMatch(false);loadPending()}}/>}
      {proposalTarget&&<StudyProposalModal currentUser={currentUser} targetUser={proposalTarget} mySlots={Array.from(avail)} onClose={()=>setProposalTarget(null)} onSuccess={()=>{setProposalTarget(null);loadProposals();setShowPlans(true)}}/>}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

function SideBtn({children,onClick,active,title,badge,id,label}:{children:any,onClick:()=>void,active?:boolean,title:string,badge?:number,id?:string,label?:string}){
  return(
    <button id={id} title={title} onClick={onClick} style={{width:'100%',padding:'8px 10px',borderRadius:'var(--radius)',border:'none',cursor:'pointer',fontSize:18,background:active?'var(--purple-light)':'none',display:'flex',alignItems:'center',gap:10,position:'relative',color:active?'var(--purple)':'inherit',transition:'background .15s'}} onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLButtonElement).style.background='var(--bg2)'}} onMouseLeave={e=>{if(!active)(e.currentTarget as HTMLButtonElement).style.background='none'}}>
      <span style={{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',width:24,height:24}}>{children}</span>
      {label&&<span style={{fontSize:13,fontWeight:active?600:500,color:active?'var(--purple)':'var(--text2)',whiteSpace:'nowrap'}}>{label}</span>}
      {(badge??0)>0&&<span style={{marginLeft:'auto',background:'#E24B4A',color:'#fff',fontSize:9,borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{badge}</span>}
    </button>
  )
}

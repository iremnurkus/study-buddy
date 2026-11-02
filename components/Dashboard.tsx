'use client'
import { useState, useEffect, useRef } from 'react'
import { X, ArrowRight, Settings, LogOut, PanelLeftClose, PanelLeftOpen, BookOpen, ClipboardList, Timer, Search, CalendarDays, Inbox, Clock, Target, MessageCircle, Mail, Users, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { mondayOf, addWeeks, weekLabel, upcomingWeeks, slotKeys } from '@/lib/weeks'
import type { Profile, Message, StudyProposal } from '@/types'
import ProfilePanel from './ProfilePanel'
import MatchPanel from './MatchPanel'
import StudyProposalModal from './StudyProposalModal'

const TIP_SUBJECTS = ['Anatomi','Fizyoloji','Biyokimya','Histoloji','Mikrobiyoloji','Patoloji','Farmakoloji','İmmünoloji','Dahiliye','Cerrahi','Pediatri','Kadın Doğum','Psikiyatri','Nöroloji','Kardiyoloji','Radyoloji','TUS Hazırlık','Klinik Beceriler']
const DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']
const HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]
const COLORS = ['#1b3b45','#1c3d33','#433a1f','#27305a','#46253c','#213f2b']
const TCOLS = ['#8fcfc8','#86d0b0','#d9b36a','#a5b4f0','#e69bbd','#8fd0a0']

function cidx(s:string){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))&0xffff;return h%COLORS.length}
function Avatar({name,size=36}:{name:string,size?:number}){
  const i=cidx(name),ini=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return <div style={{width:size,height:size,borderRadius:'50%',background:COLORS[i],color:TCOLS[i],display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.35,fontWeight:600,flexShrink:0}}>{ini}</div>
}

type Props={currentUser:Profile,allUsers:Profile[],initialConversations:any[],initialSubjects:string[],initialAvailability:{day:number,hour:number,week_start?:string}[]}

export default function Dashboard({currentUser,allUsers,initialConversations,initialSubjects,initialAvailability}:Props){
  const sb=createClient()
  const [subjects,setSubjects]=useState<string[]>(initialSubjects)
  const [availByWeek,setAvailByWeek]=useState<Record<string,Set<string>>>(()=>{
    const m:Record<string,Set<string>>={}
    initialAvailability.forEach(a=>{if(!a.week_start)return;(m[a.week_start]??=new Set()).add(`${a.day}-${a.hour}`)})
    return m
  })
  const [dirtyWeeks,setDirtyWeeks]=useState<string[]>([])
  const [myAllSlots,setMyAllSlots]=useState<string[]>([])
  const [editWeek,setEditWeek]=useState(()=>mondayOf(new Date()))
  const weeks=upcomingWeeks()
  const avail=availByWeek[editWeek]??new Set<string>()
  const setAvail=(fn:(p:Set<string>)=>Set<string>)=>{
    setAvailByWeek(m=>({...m,[editWeek]:fn(m[editWeek]??new Set())}))
    setDirtyWeeks(d=>d.includes(editWeek)?d:[...d,editWeek])
  }
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
  const [showPlans,setShowPlans]=useState(true)
  const [showSession,setShowSession]=useState(false)
  const [showMsgs,setShowMsgs]=useState(false)
  const [collapsed,setCollapsed]=useState(false)
  const [sessSubject,setSessSubject]=useState<string>('')
  const [sessMinutes,setSessMinutes]=useState(25)
  const [sessStarted,setSessStarted]=useState(false)
  const [selectedPlanDate,setSelectedPlanDate]=useState<string|null>(null)
  const [pending,setPending]=useState(0)
  const [expandedUser,setExpandedUser]=useState<string|null>(null)
  const [proposalTarget,setProposalTarget]=useState<any|null>(null)
  const [proposals,setProposals]=useState<StudyProposal[]>([])
  const [pendingProposalsCount,setPendingProposalsCount]=useState(0)
  const [now,setNow]=useState(Date.now())
  const completing=useRef<Set<string>>(new Set())
  const endRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{loadFeed();loadPending();loadProposals();requestNotificationPermission()},[])

  useEffect(()=>{
    const ch=sb.channel('proposals-live').on('postgres_changes',{event:'*',schema:'public',table:'study_proposals'},()=>loadProposals()).subscribe()
    return()=>{sb.removeChannel(ch)}
  },[currentUser.id])

  useEffect(()=>{
    const t=setInterval(()=>setNow(Date.now()),1000)
    return()=>clearInterval(t)
  },[])

  const totalMin=(p:StudyProposal)=>Math.max(1,(p.hours?.length||1))*60
  const durMs=(p:StudyProposal)=>(p.duration_min||totalMin(p))*60000
  const [pickDur,setPickDur]=useState<Record<string,number>>({})
  const sessState=(p:StudyProposal):'idle'|'running'|'done'=>{
    if(p.completed_at)return 'done'
    if(p.started_at)return now-new Date(p.started_at).getTime()>=durMs(p)?'done':'running'
    return 'idle'
  }

  useEffect(()=>{
    proposals.forEach(p=>{
      if(p.started_at&&!p.completed_at&&sessState(p)==='done'&&!completing.current.has(p.id)){
        completing.current.add(p.id)
        sb.from('study_proposals').update({completed_at:new Date().toISOString()}).eq('id',p.id).is('completed_at',null).then(()=>loadProposals())
      }
    })
  },[now,proposals])

  async function startSession(p:StudyProposal){
    const mine=p.sender_id===currentUser.id?'sender_ready':'receiver_ready'
    const other=p.sender_id===currentUser.id?'receiver_ready':'sender_ready'
    const upd:any={[mine]:true}
    if(!p.duration_min)upd.duration_min=pickDur[p.id]||totalMin(p)
    const {error:e1}=await sb.from('study_proposals').update(upd).eq('id',p.id)
    if(e1){alert('Oturum başlatılamadı: '+e1.message+'\n\nSupabase SQL Editor\'de supabase_schema.sql içindeki "5. Ortak Çalışma Oturumu" bölümünü çalıştırdın mı?');return}
    const {data}=await sb.from('study_proposals').select('*').eq('id',p.id).single()
    if(data&&(data as any)[other]&&!(data as any).started_at){
      await sb.from('study_proposals').update({started_at:new Date().toISOString()}).eq('id',p.id).is('started_at',null)
    }
    loadProposals()
  }

  async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'denied') {
      await Notification.requestPermission()
    }
  }

  const todayStr=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()
  const matchedFriends=feed.filter((u:any)=>u.commonSlots>0)
  const fmtClock=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
  const firstHour=(p:StudyProposal)=>Math.min(...((p.hours&&p.hours.length?p.hours:((p as any).hour?[(p as any).hour]:[24])) as number[]))
  const sessionProps=proposals.filter(p=>p.status==='accepted'&&(p.date>=todayStr||p.started_at)).sort((a,b)=>{
    const da=sessState(a)==='done'?1:0,db=sessState(b)==='done'?1:0
    if(da!==db)return da-db
    if(a.date!==b.date)return a.date<b.date?-1:1
    return firstHour(a)-firstHour(b)
  })
  const sortedProposals=[...proposals].sort((a,b)=>{
    const pa=a.date<todayStr?1:0,pb=b.date<todayStr?1:0
    if(pa!==pb)return pa-pb
    if(a.date!==b.date)return pa?(a.date<b.date?1:-1):(a.date<b.date?-1:1)
    return firstHour(a)-firstHour(b)
  })

  async function loadProposals() {
    const { data } = await sb.from('study_proposals')
      .select('*')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order('date', { ascending: true })
    
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
      sb.from('availability').select('user_id,day,hour,week_start').eq('user_id',currentUser.id),
      sb.from('user_subjects').select('*'),
      sb.from('availability').select('*'),
      sb.from('friend_requests').select('*').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`),
      sb.from('profiles').select('*').neq('id',currentUser.id)
    ])
    const mySS=new Set((mySubs.data??[]).map((s:any)=>s.subject))
    const mySlots=slotKeys(myAv.data??[],currentUser.id,weeks)
    setMyAllSlots(Array.from(mySlots))
    const items=(users.data??[]).map((u:any)=>{
      const us=(allSubs.data??[]).filter((s:any)=>s.user_id===u.id).map((s:any)=>s.subject)
      const uSlotsSet=slotKeys(allAv.data??[],u.id,weeks)
      const common=us.filter((s:string)=>mySS.has(s))
      const commonSlots=Array.from(mySlots).filter(s=>uSlotsSet.has(s)).length
      const req=(reqs.data??[]).find((r:any)=>(r.sender_id===currentUser.id&&r.receiver_id===u.id)||(r.sender_id===u.id&&r.receiver_id===currentUser.id))
      let rs:'none'|'pending_sent'|'pending_received'|'accepted'='none'
      if(req){if(req.status==='accepted')rs='accepted';else if(req.sender_id===currentUser.id)rs='pending_sent';else rs='pending_received'}
      
      const matchPercent=mySlots.size>0?Math.round((commonSlots/mySlots.size)*100):0
      const score=commonSlots
      
      const days=Array.from(uSlotsSet).map(k=>Number(k.split('|')[1].split('-')[0]))
      const uniqueDays=Array.from(new Set(days)).sort()
      const userSlots=Array.from(uSlotsSet)
      return{...u,common,commonSlots,score,matchPercent,rs,uniqueDays,userSubjects:us,userSlots}
    }).filter((u:any)=>u.userSubjects.length>0||mySlots.size>0).sort((a:any,b:any)=>b.score-a.score)
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
    await sb.from('availability').delete().eq('user_id',currentUser.id).in('week_start',dirtyWeeks)
    const slots=dirtyWeeks.flatMap(w=>Array.from(availByWeek[w]??[]).map(k=>{const[d,h]=k.split('-').map(Number);return{user_id:currentUser.id,day:d,hour:h,week_start:w}}))
    if(slots.length)await sb.from('availability').insert(slots)
    setDirtyWeeks([])
    setSavingP(false);setSaved(true);setTimeout(()=>setSaved(false),2500)
    loadFeed()
  }

  async function sendReq(rid:string){
    await sb.from('friend_requests').insert({sender_id:currentUser.id,receiver_id:rid})
    loadFeed()
  }

  async function startChat(userId:string){
    setShowMatch(false);setShowMsgs(true)
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

  const isHome=!(showPanel||showSession||showMatch||showMsgs)
  const ac=convs.find(c=>c.id===activeConv)
  const othId=ac?(ac.user1===currentUser.id?ac.user2:ac.user1):null
  const oth=allUsers.find(u=>u.id===othId)
  const convsU=convs.map(c=>{const oid=c.user1===currentUser.id?c.user2:c.user1;const o=allUsers.find(u=>u.id===oid);const ms=c.messages??[];return{...c,o,last:ms[ms.length-1]}})
  const fmt=(ts:string)=>new Date(ts).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})

  return(
    <div className="dark-theme" style={{display:'flex',height:'100vh',boxSizing:'border-box',padding:12,gap:12,background:'var(--app-bg)',overflow:'hidden'}}>

      {/* SIDEBAR */}
      <div style={{width:collapsed?56:200,flexShrink:0,display:'flex',flexDirection:'column',gap:10,transition:'width .2s ease'}}>
        <div style={{padding:collapsed?0:'0 8px 0 14px',flex:1,minHeight:40,boxSizing:'border-box',background:'var(--bg)',border:'1px solid var(--border)',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:collapsed?'center':'space-between',gap:8}}>
          {!collapsed&&<div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
            <BookOpen size={22} color="var(--purple)" style={{flexShrink:0}}/>
            <span style={{fontSize:16,fontWeight:700,color:'var(--text)',whiteSpace:'nowrap'}}>GaziÇArk</span>
          </div>}
          <button id="sb-toggle" title={collapsed?'Menüyü aç':'Menüyü kapat'} onClick={()=>setCollapsed(c=>!c)} style={{background:'none',border:'none',color:'var(--text2)',cursor:'pointer',padding:4,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button>
        </div>
        <div style={{flex:6,minHeight:0,display:'flex',flexDirection:'column',gap:10}}>
          <SideBtn id="sb-teklif" collapsed={collapsed} active={showPanel} label="Kendi Programım" title="Kendi Programım" onClick={()=>{setShowPanel(p=>!p);setShowPlans(false);setShowSession(false);setShowMatch(false);setShowMsgs(false)}}><ClipboardList size={20}/></SideBtn>
          <SideBtn id="sb-session" collapsed={collapsed} active={showSession} label="Çalışma Oturumu" title="Çalışma Oturumu" onClick={()=>{setShowSession(p=>!p);setShowPanel(false);setShowPlans(false);setShowMatch(false);setShowMsgs(false)}}><Timer size={20}/></SideBtn>
          <SideBtn id="sb-buddy" collapsed={collapsed} label="Arkadaş Bul" title="Arkadaş Bul" onClick={()=>{setShowMatch(p=>!p);setShowPanel(false);setShowPlans(false);setShowSession(false);setShowMsgs(false)}} active={showMatch} badge={pending}><Search size={20}/></SideBtn>
          <SideBtn id="sb-mesaj" collapsed={collapsed} active={showMsgs} label="Mesajlarım" title="Mesajlarım" onClick={()=>{setShowMsgs(p=>!p);setShowPanel(false);setShowPlans(false);setShowSession(false);setShowMatch(false)}}><MessageCircle size={20}/></SideBtn>
          <SideBtn id="sb-planlar" collapsed={collapsed} active={isHome} label="Çalışma Planım" title="Çalışma Planım" onClick={()=>{setShowPlans(true);setShowPanel(false);setShowSession(false);setShowMatch(false);setShowMsgs(false)}} badge={pendingProposalsCount}><CalendarDays size={20}/></SideBtn>
          <SideBtn id="sb-profil" collapsed={collapsed} label="Profil" title="Profil" onClick={()=>setShowProfile(true)}><Settings size={20}/></SideBtn>
        </div>
        <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',gap:10}}>
          <SideBtn id="sb-cikis" collapsed={collapsed} label="Çıkış" title="Çıkış" onClick={async()=>{await sb.auth.signOut();window.location.href='/auth'}}><LogOut size={20}/></SideBtn>
        </div>
      </div>

      {/* PROPOSAL PANEL */}
      {showPanel&&(
        <div style={{flex:1,minWidth:0,maxWidth:760,width:'100%',margin:'0 auto',alignSelf:'center',maxHeight:'min(100%, 860px)',background:'var(--bg)',border:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideIn .2s ease'}}>
          <div style={{padding:'0 16px',height:72,boxSizing:'border-box',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}><ClipboardList size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Çalışma Teklifim</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Ders ve program seç</div>
            </div>
            <button onClick={()=>setShowPanel(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text3)'}}><X size={16}/></button>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Dersler <span style={{fontWeight:400,color:'var(--text3)'}}>({subjects.length})</span></div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:20}}>
              {TIP_SUBJECTS.map(s=>(
                <button key={s} onClick={()=>setSubjects(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])} style={{padding:'4px 10px',fontSize:11,borderRadius:0,border:'1px solid var(--border)',cursor:'pointer',background:subjects.includes(s)?'var(--purple)':'var(--bg2)',color:subjects.includes(s)?'#fff':'var(--text)',transition:'all .1s'}}>{s}</button>
              ))}
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text2)'}}>Program <span style={{fontWeight:400,color:'var(--text3)'}}>({avail.size} slot)</span></div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <button title="Önceki haftanın programını kopyala" onClick={()=>setAvail(()=>new Set(availByWeek[addWeeks(editWeek,-1)]??[]))} style={{background:'var(--bg2)',border:'1px solid var(--border)',color:'var(--text2)',cursor:'pointer',padding:'3px 7px',fontSize:11,display:'flex',alignItems:'center',gap:4}}><Copy size={12}/> Önceki haftadan kopyala</button>
                <button disabled={editWeek<=weeks[0]} onClick={()=>setEditWeek(w=>addWeeks(w,-1))} style={{background:'var(--bg2)',border:'1px solid var(--border)',color:'var(--text2)',cursor:editWeek<=weeks[0]?'default':'pointer',opacity:editWeek<=weeks[0]?.4:1,padding:3,display:'flex'}}><ChevronLeft size={14}/></button>
                <span style={{fontSize:12,fontWeight:600,minWidth:96,textAlign:'center'}}>{weekLabel(editWeek)}{editWeek===weeks[0]&&<span style={{fontWeight:400,color:'var(--text3)'}}> · bu hafta</span>}</span>
                <button disabled={editWeek>=weeks[weeks.length-1]} onClick={()=>setEditWeek(w=>addWeeks(w,1))} style={{background:'var(--bg2)',border:'1px solid var(--border)',color:'var(--text2)',cursor:editWeek>=weeks[weeks.length-1]?'default':'pointer',opacity:editWeek>=weeks[weeks.length-1]?.4:1,padding:3,display:'flex'}}><ChevronRight size={14}/></button>
              </div>
            </div>
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
          <div style={{padding:'0 16px',height:96,boxSizing:'border-box',display:'flex',alignItems:'center',borderTop:'1px solid var(--border)',flexShrink:0}}>
            <button id="btn-teklif-kaydet" onClick={saveProposal} disabled={savingP} style={{width:'100%',padding:10,fontSize:13,fontWeight:600,background:saved?'#1D9E75':'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer',transition:'background .25s'}}>
              {savingP?'Kaydediliyor..':saved?'✓ Kaydedildi!':'Teklifi Güncelle'}
            </button>
          </div>
        </div>
      )}

      {/* STUDY SESSION PANEL (iskelet; işlevsellik sonra eklenecek) */}
      {showSession&&(
        <div style={{flex:1,minWidth:0,maxWidth:760,width:'100%',margin:'0 auto',alignSelf:'center',maxHeight:'min(100%, 860px)',background:'var(--bg)',border:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideIn .2s ease'}}>
          <div style={{padding:'0 16px',height:72,boxSizing:'border-box',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}><Timer size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Çalışma Oturumu</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Yaklaşan ortak çalışmalar · iki taraf da başlatınca oturum başlar</div>
            </div>
            <button onClick={()=>setShowSession(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text3)'}}><X size={16}/></button>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:8}}><CalendarDays size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Yaklaşan Oturumlar</div>
            {sessionProps.length===0?(
              <div style={{fontSize:12,color:'var(--text3)',padding:'10px 12px',border:'1px dashed var(--border)',marginBottom:24}}>Onaylanmış ortak çalışma teklifi yok.</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
                {sessionProps.map(p=>{
                  const isMine=p.sender_id===currentUser.id
                  const other=allUsers.find(u=>u.id===(isMine?p.receiver_id:p.sender_id))
                  const st=sessState(p)
                  const myReady=isMine?p.sender_ready:p.receiver_ready
                  const otherReady=isMine?p.receiver_ready:p.sender_ready
                  const hrs=(p.hours&&p.hours.length?p.hours:[]).slice().sort((a,b)=>a-b)
                  const [y,m,d]=p.date.split('-').map(Number)
                  const remaining=p.started_at?durMs(p)-(now-new Date(p.started_at).getTime()):0
                  const isToday=p.date===todayStr
                  return(
                    <div key={p.id} style={{padding:'12px',background:'var(--bg2)',border:st==='running'?'1px solid var(--purple)':'1px solid var(--border)',opacity:st==='done'?0.6:1}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600}}>{other?.name||'Arkadaş'} ile · {p.subject}</div>
                          <div style={{fontSize:12,color:'var(--text2)',marginTop:4}}><Clock size={13} style={{verticalAlign:'middle',flexShrink:0}}/> {d}.{String(m).padStart(2,'0')}.{y} · {hrs.map(h=>`${h}:00`).join(', ')} ({hrs.length||1} saat)</div>
                        </div>
                        {st==='done'?<span style={{fontSize:10,background:'#1c3d33',color:'#86d0b0',padding:'2px 6px'}}>Tamamlandı</span>
                        :st==='running'?<span style={{fontSize:10,background:'#1b3b45',color:'#8fcfc8',padding:'2px 6px'}}>Devam ediyor</span>
                        :<span style={{fontSize:10,background:'#433a1f',color:'#d9b36a',padding:'2px 6px'}}>{isToday?'Bugün':'Yaklaşıyor'}</span>}
                      </div>
                      {st==='running'&&(
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:28,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--purple)'}}>{fmtClock(remaining)}</div>
                          <div style={{height:4,background:'var(--bg3)',marginTop:6}}><div style={{height:'100%',width:`${Math.min(100,Math.max(0,(1-remaining/durMs(p))*100))}%`,background:'var(--purple)',transition:'width 1s linear'}}/></div>
                          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Kalan süre</div>
                          <button onClick={async()=>{if(!confirm('Oturumu şimdi bitirmek istiyor musun? Bu iki taraf için de oturumu sonlandırır.'))return;completing.current.add(p.id);const {error}=await sb.from('study_proposals').update({completed_at:new Date().toISOString()}).eq('id',p.id);if(error)alert('Oturum bitirilemedi: '+error.message);loadProposals()}} style={{marginTop:10,padding:'8px 16px',fontSize:12,fontWeight:600,background:'#B42318',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}>Oturumu Bitir</button>
                        </div>
                      )}
                      {st==='idle'&&(()=>{
                        const startAt=new Date(y,m-1,d,hrs[0]??firstHour(p),0,0).getTime()
                        const diff=startAt-now
                        const days=Math.floor(diff/86400000)
                        return diff>0?(
                          <div style={{marginTop:10,fontSize:12,color:'var(--text2)'}}>Başlamasına: <b style={{fontVariantNumeric:'tabular-nums',color:'var(--text)'}}>{days>0?`${days}g `:''}{fmtClock(diff%86400000)}</b></div>
                        ):<div style={{marginTop:10,fontSize:12,color:'#d9b36a'}}>Oturum saati geldi</div>
                      })()}
                      {st==='idle'&&(()=>{
                        const tot=totalMin(p)
                        const opts=Array.from(new Set([...[25,45,60,90].filter(x=>x<tot),tot]))
                        const sel=p.duration_min||pickDur[p.id]||tot
                        const locked=!!p.duration_min||!!myReady
                        return(
                          <div style={{marginTop:10}}>
                            <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>Çalışma süresi{p.duration_min?' (ilk başlatan seçti)':''}</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                              {opts.map(o=>(
                                <button key={o} disabled={locked||!isToday} onClick={()=>setPickDur(s=>({...s,[p.id]:o}))} style={{padding:'4px 10px',fontSize:11,border:'1px solid var(--border)',cursor:(locked||!isToday)?'default':'pointer',background:sel===o?'var(--purple)':'var(--bg)',color:sel===o?'#fff':'var(--text)',opacity:locked&&sel!==o?0.4:1}}>{o===tot?`Tamamı (${tot>=60&&tot%60===0?tot/60+' sa':tot+' dk'})`:`${o} dk`}</button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                      {st==='idle'&&(
                        <div style={{marginTop:10,display:'flex',alignItems:'center',gap:10}}>
                          <button onClick={()=>startSession(p)} disabled={!isToday||!!myReady} style={{padding:'8px 16px',fontSize:12,fontWeight:600,background:(!isToday||myReady)?'var(--bg3)':'var(--purple)',color:(!isToday||myReady)?'var(--text3)':'#fff',border:'none',borderRadius:'var(--radius)',cursor:(!isToday||myReady)?'default':'pointer'}}>{myReady?'Başlattın':'Başlat'}</button>
                          <span style={{fontSize:11,color:'var(--text3)'}}>
                            {!isToday?'Oturum günü başlatılabilir':myReady?(otherReady?'Başlıyor...':`${other?.name||'Arkadaşın'} bekleniyor`):otherReady?`${other?.name||'Arkadaşın'} hazır, sen de başlat`:'İki taraf da başlatınca oturum başlar'}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showMatch&&<MatchPanel inline currentUser={currentUser} onStartChat={startChat} onClose={()=>{setShowMatch(false);loadPending()}}/>}
      {/* WORK PLANS PANEL */}
      {isHome&&(
        <div style={{flex:1,minWidth:0,maxWidth:760,width:'100%',margin:'0 auto',alignSelf:'center',maxHeight:'min(100%, 860px)',background:'var(--bg)',border:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideIn .2s ease'}}>
          <div style={{padding:'0 16px',height:72,boxSizing:'border-box',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}><CalendarDays size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Çalışma Planım</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Takvimden gün seçerek filtreleyebilirsiniz</div>
            </div>
          </div>
          
          {/* Mini Calendar Filter */}
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
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
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:8}}><Users size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Saatleri Uyuşan Arkadaşlar</div>
              {matchedFriends.length===0?(
                <div style={{fontSize:12,color:'var(--text3)',padding:'10px 12px',border:'1px dashed var(--border)'}}>Ortak müsait saati olan arkadaş yok. "Kendi Programım"dan müsait saatlerini işaretle.</div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {matchedFriends.map((u:any)=>(
                    <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg2)',border:'1px solid var(--border)'}}>
                      <Avatar name={u.name} size={32}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.name}</div>
                        <div style={{fontSize:11,color:'var(--text3)'}}><Clock size={12} style={{verticalAlign:'middle',flexShrink:0}}/> {u.commonSlots} ortak saat · %{u.matchPercent} uyum</div>
                      </div>
                      <button onClick={()=>setProposalTarget(u)} style={{padding:'7px 12px',fontSize:12,fontWeight:500,background:'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer',whiteSpace:'nowrap'}}>Birlikte Çalış</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}><CalendarDays size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Tekliflerim</div>
            {proposals.length === 0 ? (
               <div style={{textAlign:'center',color:'var(--text3)',paddingTop:40}}>
                 <div style={{marginBottom:8,color:'var(--text3)'}}><Inbox size={36} style={{verticalAlign:'middle',flexShrink:0}}/></div>
                 <p style={{fontSize:13}}>Henüz teklif yok</p>
               </div>
            ) : sortedProposals.filter(p => !selectedPlanDate || p.date === selectedPlanDate).map(p => {
              const isMine = p.sender_id === currentUser.id
              const otherUser = allUsers.find(u => u.id === (isMine ? p.receiver_id : p.sender_id))
              if (!otherUser) return null
              
              // Tarihi formatla
              const pDate = new Date(p.date)
              const pDayIdx = (pDate.getDay() + 6) % 7
              const dateDisplay = `${pDate.getDate()} ${['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][pDate.getMonth()]} ${DAYS[pDayIdx]}`

              return (
                <div key={p.id} style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'12px',fontSize:'13px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                    <div style={{fontWeight:600}}>{otherUser.name} ile</div>
                    {p.status === 'pending' ? (
                      <span style={{fontSize:'10px',background:'#433a1f',color:'#d9b36a',padding:'2px 6px',borderRadius: 2}}>Bekliyor</span>
                    ) : p.status === 'accepted' ? (
                      <span style={{fontSize:'10px',background:'#1c3d33',color:'#86d0b0',padding:'2px 6px',borderRadius: 2}}>Onaylandı</span>
                    ) : p.status === 'cancelled' ? (
                      <span style={{fontSize:'10px',background:'var(--bg3)',color:'var(--text3)',padding:'2px 6px',borderRadius: 2}}>Geri çekildi</span>
                    ) : (
                      <span style={{fontSize:'10px',background:'#452428',color:'#e89aa0',padding:'2px 6px',borderRadius: 2}}>Reddedildi</span>
                    )}
                  </div>
                  <div style={{color:'var(--text2)',fontSize:'12px',marginBottom:'8px'}}>
                    <BookOpen size={14} style={{verticalAlign:'middle',flexShrink:0}}/> {p.subject} <br/>
                    <Clock size={14} style={{verticalAlign:'middle',flexShrink:0}}/> {dateDisplay} - {(p.hours ? p.hours : ((p as any).hour ? [(p as any).hour] : [])).map(h => `${h}:00`).join(', ')}
                  </div>
                  {p.message && (
                    <div style={{fontSize:'12px',background:'var(--bg)',padding:'6px',borderRadius: 0,fontStyle:'italic',marginBottom:'8px',color:'var(--text2)'}}>"{p.message}"</div>
                  )}
                  {p.status === 'pending' && !isMine && (
                    <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
                      <button onClick={async ()=>{await sb.from('study_proposals').update({status:'rejected'}).eq('id',p.id);loadProposals()}} style={{flex:1,padding:'6px',fontSize:'12px',background:'none',border:'1px solid var(--border)',borderRadius:'var(--radius)',cursor:'pointer'}}>Reddet</button>
                      <button onClick={async ()=>{await sb.from('study_proposals').update({status:'accepted'}).eq('id',p.id);loadProposals()}} style={{flex:1,padding:'6px',fontSize:'12px',background:'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}>Kabul Et</button>
                    </div>
                  )}
                  {(p.status === 'pending' && isMine || p.status === 'accepted' && !p.started_at) && p.date >= todayStr && (
                    <div style={{marginTop:'8px'}}>
                      <button onClick={async ()=>{if(!confirm(p.status==='accepted'?'Onaylanmış çalışmadan geri çekilmek istiyor musun?':'Teklifi geri çekmek istiyor musun?'))return;await sb.from('study_proposals').update({status:'cancelled'}).eq('id',p.id);loadProposals()}} style={{width:'100%',padding:'6px',fontSize:'12px',background:'none',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:'var(--radius)',cursor:'pointer'}}>{p.status==='accepted'?'Geri çekil':'Teklifi geri çek'}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CENTER FEED */}
      <div style={{flex:1,display:'none',flexDirection:'column',overflow:'hidden',background:'var(--bg2)',border:'1px solid var(--border)'}}>
        <div style={{padding:'0 20px',height:72,boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:'center',background:'var(--bg)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:700}}><Target size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Çalışma Arkadaşları</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>Ortak ders ve saate göre sıralı</div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {loadingFeed?(
            <div style={{textAlign:'center',color:'var(--text3)',paddingTop:60,fontSize:13}}>Yükleniyor...</div>
          ):feed.length===0?(
            <div style={{textAlign:'center',color:'var(--text3)',paddingTop:60}}>
              <div style={{marginBottom:12,color:'var(--text3)'}}><ClipboardList size={36} style={{verticalAlign:'middle',flexShrink:0}}/></div>
              <p style={{fontSize:14,fontWeight:500}}>Henüz arkadaş yok</p>
              <p style={{fontSize:12,marginTop:6}}>Sol menüden Kendi Programım'ı doldur!</p>
            </div>
          ):feed.map((u:any)=>{
            const isExp=expandedUser===u.id
            const mySlotSet=new Set(myAllSlots)
            return(
            <div key={u.id} style={{background:'var(--bg)',borderRadius:'var(--radius-lg)',border:isExp?'1px solid var(--purple)':'1px solid var(--border)',marginBottom:14,transition:'all .2s',overflow:'hidden',opacity:u.userSubjects.length===0&&!isExp?0.65:1}}>
              {/* Compact card - always visible */}
              <div onClick={()=>setExpandedUser(isExp?null:u.id)} style={{padding:'14px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:12}} onMouseEnter={e=>{if(!isExp)(e.currentTarget.parentElement as HTMLDivElement).style.borderColor='var(--purple)'}} onMouseLeave={e=>{if(!isExp)(e.currentTarget.parentElement as HTMLDivElement).style.borderColor='var(--border)'}}>
                <Avatar name={u.name} size={40}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.name}</div>
                  <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,marginBottom:4}}>
                    <span style={{fontSize:11,padding:'2px 8px',whiteSpace:'nowrap',background:'var(--purple-light)',color:'var(--purple-dark)',border:'1px solid var(--border)'}}>{u.year}. Sınıf</span>
                    {u.matchPercent>0&&<span style={{fontSize:11,padding:'2px 8px',whiteSpace:'nowrap',background:'#1b3b45',color:'#8fcfc8',border:'1px solid rgba(143,207,200,.3)'}}>%{u.matchPercent} uyum</span>}
                  </div>
                  <div style={{fontSize:12,color:'var(--text3)'}}>
                    {u.userSubjects.length>0?u.userSubjects.slice(0,3).join(', ')+(u.userSubjects.length>3?` +${u.userSubjects.length-3}`:''):'Ders belirtilmemiş'}
                    {u.commonSlots>0&&<span> · <Clock size={14} style={{verticalAlign:'middle',flexShrink:0}}/> {u.commonSlots} ortak saat</span>}
                  </div>
                </div>
                <div style={{fontSize:16,color:'var(--text3)',transition:'transform .2s',transform:isExp?'rotate(180deg)':'rotate(0)'}}>▼</div>
              </div>

              {/* Expanded detail */}
              {isExp&&(
                <div style={{padding:'0 16px 16px',borderTop:'1px solid var(--border)',animation:'fadeIn .2s ease'}}>
                  {/* Bio */}
                  {u.bio&&<p style={{fontSize:13,color:'var(--text2)',padding:'12px 0 8px',lineHeight:1.5}}>{u.bio}</p>}

                  {/* All subjects */}
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}><BookOpen size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Çalıştığı Dersler</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {u.userSubjects.map((s:string)=>{
                        const isCommon=u.common.includes(s)
                        return <span key={s} style={{fontSize:11,padding:'4px 10px',borderRadius: 0,background:isCommon?'var(--purple-light)':'var(--bg2)',color:isCommon?'var(--purple-dark)':'var(--text2)',border:isCommon?'1px solid var(--border)':'1px solid var(--border)',fontWeight:isCommon?500:400}}>{isCommon?'✓ ':''}{s}</span>
                      })}
                    </div>
                    {u.common.length>0&&<div style={{fontSize:11,color:'var(--purple)',marginTop:6}}>✓ {u.common.length} ortak ders</div>}
                  </div>

                  {/* Availability mini-table */}
                  {u.userSlots.length>0&&(
                    <div style={{marginTop:16}}>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:8}}><Clock size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Müsaitlik Programı</div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{borderCollapse:'collapse',fontSize:10,width:'100%'}}>
                          <thead><tr><th style={{width:30,color:'var(--text3)',fontWeight:400}}/>{DAYS.map(d=><th key={d} style={{padding:'2px 3px',color:'var(--text2)',fontWeight:500,textAlign:'center',fontSize:10}}>{d}</th>)}</tr></thead>
                          <tbody>{HOURS.map(h=>{
                            const hasAnyInRow=DAYS.some((_,d)=>u.userSlots.includes(`${weeks[0]}|${d}-${h}`))
                            if(!hasAnyInRow)return null
                            return(
                            <tr key={h}>
                              <td style={{padding:'1px 4px 1px 0',color:'var(--text3)',whiteSpace:'nowrap'}}>{h}:00</td>
                              {DAYS.map((_,d)=>{
                                const slotKey=`${weeks[0]}|${d}-${h}`
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
                        <span><span style={{display:'inline-block',width:10,height:10,borderRadius:0,background:'var(--purple)',verticalAlign:'middle',marginRight:4}}/>Müsait</span>
                        <span><span style={{display:'inline-block',width:10,height:10,borderRadius:0,background:'var(--purple-dark)',verticalAlign:'middle',marginRight:4}}/>Ortak</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{marginTop:16,display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button onClick={(e)=>{e.stopPropagation();setProposalTarget(u)}} style={{padding:'8px 16px',fontSize:12,fontWeight:500,background:'var(--bg3)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:'var(--radius)',cursor:'pointer'}}><BookOpen size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Birlikte Çalış</button>
                    {u.rs==='none'&&<button onClick={(e)=>{e.stopPropagation();sendReq(u.id)}} style={{padding:'8px 16px',fontSize:12,fontWeight:500,background:'var(--purple)',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}>İstek Gönder</button>}
                    {u.rs==='pending_sent'&&<span style={{fontSize:12,color:'var(--text3)',padding:'8px 0'}}><Clock size={14} style={{verticalAlign:'middle'}}/> İstek gönderildi</span>}
                    {u.rs==='pending_received'&&<span style={{fontSize:12,color:'#E24B4A',padding:'8px 0'}}><Mail size={14} style={{verticalAlign:'middle',flexShrink:0}}/> İstek bekliyor</span>}
                    {u.rs==='accepted'&&<button onClick={(e)=>{e.stopPropagation();startChat(u.id)}} style={{padding:'8px 16px',fontSize:12,fontWeight:500,background:'#1D9E75',color:'#fff',border:'none',borderRadius:'var(--radius)',cursor:'pointer'}}><MessageCircle size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Mesaj At</button>}
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>
      </div>

      {/* RIGHT: MESSAGES */}
      <div style={{flex:1,minWidth:0,maxWidth:760,width:'100%',margin:'0 auto',alignSelf:'center',maxHeight:'min(100%, 860px)',border:'1px solid var(--border)',display:showMsgs?'flex':'none',flexDirection:'column',background:'var(--bg)',overflow:'hidden',animation:'slideIn .2s ease'}}>
        {!activeConv?(
          <>
            <div style={{padding:'0 16px',height:72,boxSizing:'border-box',display:'flex',alignItems:'center',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{fontSize:14,fontWeight:700}}><MessageCircle size={14} style={{verticalAlign:'middle',flexShrink:0}}/> Mesajlarım</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
              {convsU.length===0?(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,color:'var(--text3)'}}>
                  <span style={{color:'var(--text3)'}}><MessageCircle size={36} style={{verticalAlign:'middle',flexShrink:0}}/></span>
                  <p style={{fontSize:13}}>Henüz sohbet yok</p>
                </div>
              ):convsU.map(c=>(
                <div key={c.id} onClick={()=>setActiveConv(c.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 10px',borderRadius:'var(--radius)',cursor:'pointer',marginBottom:6,border:'1px solid var(--border)',transition:'border-color .15s'}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--purple)'} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--border)'}>
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
            <div style={{padding:'0 14px',height:72,boxSizing:'border-box',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <button onClick={()=>{setActiveConv(null);setMsgs([])}} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text2)',padding:'0 4px 0 0'}}>←</button>
              {oth&&<Avatar name={oth.name} size={30}/>}
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{oth?.name}</div>
                <div style={{fontSize:11,color:online.has(othId??'')?'#1D9E75':'var(--text3)'}}>{online.has(othId??'')?'● Çevrimiçi':'Çevrimdışı'}</div>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:8}}>
              {msgs.length===0&&<p style={{textAlign:'center',color:'var(--text3)',fontSize:12,marginTop:16}}>İlk mesajı sen gönder!</p>}
              {msgs.map(m=>{const mine=m.sender_id===currentUser.id;return(
                <div key={m.id} style={{display:'flex',justifyContent:mine?'flex-end':'flex-start',gap:6,alignItems:'flex-end'}}>
                  {!mine&&oth&&<Avatar name={oth.name} size={24}/>}
                  <div>
                    <div style={{padding:'8px 12px',borderRadius:0,background:mine?'var(--purple)':'var(--bg2)',color:mine?'#fff':'var(--text)',border:mine?'none':'1px solid var(--border)',fontSize:13,maxWidth:220,wordBreak:'break-word'}}>{m.content}</div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2,textAlign:mine?'right':'left'}}>{fmt(m.created_at)}</div>
                  </div>
                </div>
              )})}
              <div ref={endRef}/>
            </div>
            <div style={{padding:'0 12px',minHeight:96,boxSizing:'border-box',borderTop:'1px solid var(--border)',display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
              <textarea value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,100)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}}} placeholder="Mesaj yaz..." rows={1} style={{flex:1,padding:'8px 12px',fontSize:13,border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg2)',color:'var(--text)',outline:'none',resize:'none',minHeight:38,maxHeight:100,overflow:'hidden'}}/>
              <button onClick={sendMsg} disabled={!input.trim()} style={{padding:'8px 14px',fontSize:13,fontWeight:500,background:input.trim()?'var(--purple)':'var(--bg3)',color:input.trim()?'#fff':'var(--text3)',border:'none',borderRadius:'var(--radius)',cursor:input.trim()?'pointer':'default',flexShrink:0}}><ArrowRight size={16}/></button>
            </div>
          </>
        )}
      </div>

      {showProfile&&<ProfilePanel currentUser={currentUser} onClose={()=>setShowProfile(false)} onSave={()=>setShowProfile(false)}/>}
      {proposalTarget&&<StudyProposalModal currentUser={currentUser} targetUser={proposalTarget} mySlots={myAllSlots} onClose={()=>setProposalTarget(null)} onSuccess={()=>{setProposalTarget(null);loadProposals();setShowPlans(true)}}/>}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

function SideBtn({children,onClick,active,title,badge,id,label,collapsed}:{children:any,onClick:()=>void,active?:boolean,title:string,badge?:number,id?:string,label?:string,collapsed?:boolean}){
  return(
    <div className={'side-wrap'+(collapsed?' collapsed':'')} style={{flex:1,minHeight:40,position:'relative'}}>
    <button id={id} title={title} onClick={onClick} className={'side-btn'+(active?' active':'')} style={{padding:'0 14px',borderRadius:'var(--radius)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',gap:10,color:active?'var(--purple)':'inherit'}}>
      <span style={{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',width:24,height:24}}>{children}</span>
      {label&&<span style={{fontSize:13,fontWeight:active?600:500,color:active?'var(--purple)':'var(--text2)',whiteSpace:'nowrap'}}>{label}</span>}
      {(badge??0)>0&&<span style={{marginLeft:'auto',background:'#E24B4A',color:'#fff',fontSize:9,borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{badge}</span>}
    </button>
    </div>
  )
}

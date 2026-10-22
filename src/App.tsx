import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Aperture, ArrowDownLeft, ArrowUpRight, Bell, CheckCheck,
  CircleHelp, LogOut, MessageCircle, Mic, MicOff, MoreHorizontal, Phone,
  PhoneCall, Plus, Search, Send, Settings, ShieldCheck, Sparkles,
  Video, VideoOff, X
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null }
type Chat = { id: string; title: string; subtitle: string; avatar: string; color: string; online: boolean; unread: number; last: string; time: string; otherId?: string }
type Message = { id: string; chat_id: string; sender_id: string; content: string; created_at: string }

const demoChats: Chat[] = [
  { id:'demo-1', title:'Александр', subtitle:'был недавно', avatar:'А', color:'violet', online:true, unread:2, last:'Давай созвонимся вечером?', time:'12:42' },
  { id:'demo-2', title:'Мама ❤️', subtitle:'в сети', avatar:'М', color:'pink', online:true, unread:0, last:'Спасибо, родной ❤️', time:'12:18' },
  { id:'demo-3', title:'Команда', subtitle:'5 участников', avatar:'К', color:'blue', online:false, unread:0, last:'Крутая идея, погнали', time:'Вчера' },
  { id:'demo-4', title:'Денис', subtitle:'был 10 минут назад', avatar:'Д', color:'orange', online:false, unread:0, last:'Фото отправил', time:'Вчера' },
  { id:'demo-5', title:'Избранное', subtitle:'Личные заметки', avatar:'✦', color:'green', online:false, unread:0, last:'Не забыть идеи для Orbit', time:'Пн' },
]
const demoMessages: Message[] = [
  { id:'m1', chat_id:'demo-1', sender_id:'other', content:'Йоу! Как тебе новый мессенджер?', created_at:new Date(Date.now()-3600000).toISOString() },
  { id:'m2', chat_id:'demo-1', sender_id:'me', content:'Бро, делаем своё приложение 🔥', created_at:new Date(Date.now()-3500000).toISOString() },
  { id:'m3', chat_id:'demo-1', sender_id:'other', content:'Давай созвонимся вечером?', created_at:new Date(Date.now()-120000).toISOString() },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [authMode, setAuthMode] = useState<'login'|'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chats, setChats] = useState<Chat[]>(demoChats)
  const [selectedId, setSelectedId] = useState('demo-1')
  const [messages, setMessages] = useState<Message[]>(demoMessages)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [mobileChat, setMobileChat] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [callVideo, setCallVideo] = useState(true)
  const [callStatus, setCallStatus] = useState('Подготовка соединения…')
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const selected = chats.find(c => c.id === selectedId) ?? chats[0]
  const visibleChats = useMemo(() => chats.filter(c => (c.title + ' ' + c.last).toLowerCase().includes(search.toLowerCase())), [chats, search])
  const activeMessages = messages.filter(m => m.chat_id === selectedId)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user) return
    const uid = session.user.id
    supabase.from('profiles').select('id,username,display_name,avatar_url').eq('id', uid).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data as Profile) })
    const loadChats = async () => {
      const { data: memberships } = await supabase!.from('chat_members').select('chat_id, chats(id,title,created_at)').eq('user_id', uid)
      if (!memberships?.length) return
      const ids = memberships.map((m: any) => m.chat_id)
      const { data: rows } = await supabase!.from('messages').select('id,chat_id,sender_id,content,created_at').in('chat_id', ids).order('created_at', { ascending: true }).limit(500)
      if (rows) setMessages(rows as Message[])
      setChats(memberships.map((m: any) => ({ id:m.chat_id, title:m.chats?.title || 'Личный чат', subtitle:'Личный чат', avatar:(m.chats?.title || 'О').slice(0,1).toUpperCase(), color:'violet', online:false, unread:0, last:rows?.filter((r:any)=>r.chat_id===m.chat_id).slice(-1)[0]?.content || 'Начните общение', time:'' })))
    }
    void loadChats()
  }, [session])

  useEffect(() => {
    if (!supabase || !session?.user || selectedId.startsWith('demo-')) return
    const channel = supabase.channel('messages:' + selectedId).on('postgres_changes', {
      event:'INSERT', schema:'public', table:'messages', filter:'chat_id=eq.' + selectedId,
    }, payload => {
      const row = payload.new as Message
      setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
      setChats(prev => prev.map(c => c.id === selectedId ? { ...c, last:row.content, time:new Date(row.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) } : c))
    }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [session, selectedId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [activeMessages.length, selectedId])

  async function authenticate(e: FormEvent) {
    e.preventDefault(); setAuthError(''); setAuthBusy(true)
    try {
      if (!supabase) throw new Error('Сначала подключи Supabase: добавь ключи в .env.local.')
      const result = authMode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
      if (result.error) throw result.error
      if (authMode === 'signup' && !result.data.session) setAuthError('Проверь почту, если в Supabase включено подтверждение email.')
    } catch (err) { setAuthError(err instanceof Error ? err.message : 'Не удалось войти') }
    finally { setAuthBusy(false) }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !selected) return
    setDraft('')
    if (supabase && session && !selectedId.startsWith('demo-')) {
      const { error } = await supabase.from('messages').insert({ chat_id:selectedId, sender_id:session.user.id, content })
      if (error) { setNotice('Не удалось отправить: ' + error.message); setDraft(content) }
    } else {
      const msg: Message = { id:crypto.randomUUID(), chat_id:selectedId, sender_id:'me', content, created_at:new Date().toISOString() }
      setMessages(prev => [...prev, msg])
      setChats(prev => prev.map(c => c.id===selectedId ? {...c,last:content,time:'сейчас'} : c))
    }
  }

  async function startCall(video: boolean) {
    setCallVideo(video); setShowCall(true); setCallStatus('Запрашиваем доступ к микрофону и камере…')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не поддерживает звонки или страница открыта без HTTPS.')
      const media = await navigator.mediaDevices.getUserMedia({ audio:true, video:video })
      stream.current = media
      if (localVideo.current) localVideo.current.srcObject = media
      const connection = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] })
      pc.current = connection
      media.getTracks().forEach(track => connection.addTrack(track, media))
      connection.ontrack = event => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0] }
      connection.onconnectionstatechange = () => setCallStatus(connection.connectionState === 'connected' ? 'Соединение установлено' : 'Состояние: ' + connection.connectionState)
      setCallStatus('Медиа готовы. Для звонка другому пользователю нужен сигналинг и доступный собеседник.')
    } catch (err) { setCallStatus(err instanceof Error ? err.message : 'Не удалось запустить звонок') }
  }
  function endCall() {
    pc.current?.close(); pc.current = null
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
    setShowCall(false); setMicOn(true); setCameraOn(true)
  }
  function toggleMic() {
    const next = !micOn; setMicOn(next)
    stream.current?.getAudioTracks().forEach(track => { track.enabled = next })
  }
  function toggleCamera() {
    const next = !cameraOn; setCameraOn(next)
    stream.current?.getVideoTracks().forEach(track => { track.enabled = next })
  }

  if (isSupabaseConfigured && !authReady) return <div className="loading-screen"><Aperture size={34}/><span>Открываем Orbit…</span></div>
  if (isSupabaseConfigured && !session) return <main className="auth-screen"><div className="auth-glow"/><div className="auth-brand"><span className="brand-icon"><Aperture/></span><span>orbit<span className="brand-dot">.</span></span></div><section className="auth-card"><div className="eyebrow"><ShieldCheck size={14}/> ТВОЁ ПРОСТРАНСТВО</div><h1>{authMode==='login'?'С возвращением.':'Создай свой Orbit.'}</h1><p className="muted">Личные сообщения и звонки — всё в одном месте.</p><form onSubmit={authenticate} className="auth-form"><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label><label>Пароль<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Минимум 6 символов" autoComplete={authMode==='login'?'current-password':'new-password'}/></label>{authError&&<div className="auth-error">{authError}</div>}<button className="primary-btn wide" disabled={authBusy}>{authBusy?'Подождите…':authMode==='login'?'Войти в Orbit':'Создать аккаунт'} <ArrowUpRight size={17}/></button></form><p className="auth-switch">{authMode==='login'?'Впервые здесь?':'Уже есть аккаунт?'} <button onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('')}}>{authMode==='login'?'Создать аккаунт':'Войти'}</button></p><p className="tiny-note">Ваши данные хранятся в вашем проекте Supabase.</p></section></main>

  return <main className="app-shell">
    <aside className={'sidebar '+(mobileChat?'mobile-hidden':'')}>
      <div className="sidebar-top"><div className="brand"><span className="brand-icon"><Aperture size={20}/></span><span>orbit<span className="brand-dot">.</span></span><span className="beta">BETA</span></div><button className="icon-btn" aria-label="Меню" onClick={()=>setMenuOpen(!menuOpen)}><MoreHorizontal/></button>{menuOpen&&<div className="dropdown"><button onClick={()=>setNotice('Настройки аккаунта появятся в следующем обновлении.') }><Settings size={15}/> Настройки</button><button onClick={()=>supabase?.auth.signOut()}><LogOut size={15}/> Выйти</button></div>}</div>
      <div className="profile-strip"><div className="profile-avatar">{(profile?.display_name||profile?.username||session?.user.email||'Я').slice(0,1).toUpperCase()}</div><div className="profile-copy"><strong>{profile?.display_name||profile?.username||session?.user.email?.split('@')[0]||'Гость'}</strong><span><i/> в Orbit</span></div><button className="icon-btn small" title="Уведомления" onClick={()=>setNotice('Пока новых уведомлений нет.')}><Bell size={17}/></button></div>
      <div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск сообщений"/><kbd>⌘ K</kbd></div>
      <div className="list-heading"><span>СООБЩЕНИЯ</span><button className="icon-btn small" onClick={()=>setNotice('Создание чатов добавим следующим шагом.')} aria-label="Новый чат"><Plus size={17}/></button></div>
      <div className="chat-list">{visibleChats.map(chat=><button key={chat.id} className={'chat-item '+(chat.id===selectedId?'selected':'')} onClick={()=>{setSelectedId(chat.id);setMobileChat(true)}}><span className={'chat-avatar '+chat.color}>{chat.avatar}{chat.online&&<i/>}</span><span className="chat-preview"><span className="chat-line"><strong>{chat.title}</strong><time>{chat.time}</time></span><span className="chat-line"><span className="last-message">{chat.last}</span>{chat.unread>0&&<b className="unread">{chat.unread}</b>}</span></span></button>)}</div>
      <div className="sidebar-footer"><div className="secure-pill"><ShieldCheck size={15}/><span>Твои чаты — только твои</span><span className="secure-dot"/></div><div className="footer-links"><span>ORBIT MESSENGER</span><button onClick={()=>setNotice('Orbit — твой личный мессенджер.') }><CircleHelp size={15}/></button></div></div>
    </aside>
    <section className={'conversation '+(!mobileChat?'mobile-hidden':'')}>
      <header className="conversation-header"><button className="icon-btn back-btn" onClick={()=>setMobileChat(false)} aria-label="Назад"><ArrowDownLeft/></button><span className={'chat-avatar header-avatar '+(selected?.color||'violet')}>{selected?.avatar||'О'}{selected?.online&&<i/>}</span><div className="header-person"><strong>{selected?.title||'Выберите чат'}</strong><span><i className={selected?.online?'online':''}/>{selected?.online?'в сети':selected?.subtitle||'Личный чат'}</span></div><div className="header-actions"><button className="icon-btn" title="Голосовой звонок" onClick={()=>void startCall(false)}><Phone size={18}/></button><button className="icon-btn video-action" title="Видеозвонок" onClick={()=>void startCall(true)}><Video size={19}/></button><span className="header-divider"/><button className="icon-btn" title="Информация" onClick={()=>setNotice('Информация о чате появится позже.')}><MoreHorizontal size={20}/></button></div></header>
      <div className="chat-backdrop"><div className="date-divider"><span>СЕГОДНЯ</span></div><div className="messages">{activeMessages.length===0&&<div className="empty-chat"><span className="empty-icon"><MessageCircle/></span><strong>Начните разговор</strong><p>Напишите первое сообщение — всё начинается здесь.</p></div>}{activeMessages.map(msg=>{const mine=msg.sender_id==='me'||msg.sender_id===session?.user.id;return <div key={msg.id} className={'message-row '+(mine?'mine':'')}><div className="message-bubble">{!mine&&<span className="sender-name">{selected?.title}</span>}<p>{msg.content}</p><span className="message-meta">{new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}{mine&&<CheckCheck size={14} className="read-icon"/>}</span></div></div>})}<div ref={bottomRef}/></div></div>
      <form className="composer" onSubmit={sendMessage}><button type="button" className="composer-add" onClick={()=>setNotice('Вложения добавим следующим шагом.')}><Plus size={20}/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Написать сообщение…" aria-label="Сообщение"/><button type="button" className="composer-emoji" onClick={()=>setDraft(v=>v+' 😊')} aria-label="Добавить эмодзи"><Sparkles size={19}/></button><button className="send-btn" disabled={!draft.trim()} aria-label="Отправить"><Send size={18}/></button></form><div className="conversation-foot"><ShieldCheck size={12}/> Личные разговоры. Твоё пространство.</div>
    </section>
    {showCall&&<div className="call-overlay"><div className="call-top"><span className="brand-icon"><Aperture size={18}/></span><span>ORBIT CALL</span><button className="icon-btn" onClick={endCall}><X size={19}/></button></div><div className="call-main"><div className="call-avatar">{selected?.avatar||'О'}<span className="call-pulse"/></div><h2>{selected?.title||'Звонок'}</h2><p>{callStatus}</p><div className="video-grid"><div className="video-tile"><video ref={remoteVideo} autoPlay playsInline/><span>Собеседник</span></div><div className="video-tile self-tile"><video ref={localVideo} autoPlay muted playsInline/><span>Вы</span></div></div></div><div className="call-controls"><button className={'call-control '+(!micOn?'off':'')} onClick={toggleMic}>{micOn?<Mic/>:<MicOff/>}</button>{callVideo&&<button className={'call-control '+(!cameraOn?'off':'')} onClick={toggleCamera}>{cameraOn?<Video/>:<VideoOff/>}</button>}<button className="call-control hangup" onClick={endCall}><PhoneCall/></button></div><div className="call-disclaimer">Для соединения двух пользователей потребуется сервер сигналинга.</div></div>}
    {!isSupabaseConfigured&&<div className="demo-banner"><span><Sparkles size={14}/> Демо-режим</span><span>Подключи Supabase, чтобы включить аккаунты и облачные чаты.</span><button onClick={()=>setNotice('Инструкция подключения находится в README.md на GitHub.')}>Как включить <ArrowUpRight size={13}/></button></div>}
    {notice&&<div className="toast"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </main>
}
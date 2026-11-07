import { useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Summary, Tasks, Shopping, Debtors } from './modules'
import { AdminAgents, AgentApp, AgentEarnings, ClaimAgent } from './agentes'
const CATS = ['Alimentación','Hogar','Transporte','Salud','Ocio','Compras','Otros']
const eur = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n)
type Profile = { id: string; name: string; space_id: string | null }
type Expense = { id: string; description: string; amount: number; category: string; spent_on: string; paid_by: string; notes: string | null }

function Auth() {
  const [mode, setMode] = useState<'in'|'up'|'rec'>('in'); const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [name, setName] = useState(''); const [msg, setMsg] = useState('')
  async function go() {
    setMsg('')
    if (mode === 'rec') { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin }); return setMsg(error ? error.message : 'Te hemos enviado un correo para restablecer la contraseña.') }
    if (pw.length < 8) return setMsg('La contraseña debe tener al menos 8 caracteres.')
    const { error, data } = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { data: { name } } })
    if (error) setMsg(error.message); else if (mode === 'up' && !data.session) setMsg('Revisa tu correo para confirmar la cuenta.')
  }
  return <div className="card"><h1>NUESTRA CUENTA</h1>
    {mode === 'up' && <input placeholder="Tu nombre (Luis / Yelifer)" value={name} onChange={e => setName(e.target.value)} />}
    <input type="email" placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} />
    {mode !== 'rec' && <input type="password" placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} />}
    <button onClick={go}>{mode === 'in' ? 'Entrar' : mode === 'up' ? 'Crear cuenta' : 'Enviar enlace'}</button>
    <button className="sec" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Crear cuenta nueva' : 'Ya tengo cuenta'}</button>
    {mode === 'in' && <button className="sec" onClick={() => setMode('rec')}>Olvidé mi contraseña</button>}
    {msg && <p className="err">{msg}</p>}</div>
}

function SpaceSetup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [mine, setMine] = useState(''); const [msg, setMsg] = useState('')
  async function create() { const { data, error } = await supabase.rpc('create_space', { space_name: 'Nuestra Cuenta' }); if (error) setMsg(error.message); else setMine(data as string) }
  async function join() { const { error } = await supabase.rpc('join_space', { code }); if (error) setMsg(error.message); else onDone() }
  if (mine) return <div className="card"><h1>Código de invitación</h1><p style={{ fontSize: '2rem', letterSpacing: 4, color: 'var(--azul)' }}><b>{mine}</b></p>
    <p className="muted">Pásaselo a la otra persona para que se una.</p><button onClick={onDone}>Continuar</button></div>
  return <div className="card"><h1>Espacio compartido</h1><button onClick={create}>Crear espacio nuevo</button>
    <p className="muted">o únete con el código de invitación:</p><input placeholder="Código" value={code} onChange={e => setCode(e.target.value)} />
    <button className="sec" onClick={join}>Unirme</button>{msg && <p className="err">{msg}</p>}</div>
}

function Expenses({ me, people }: { me: Profile; people: Profile[] }) {
  const [list, setList] = useState<Expense[]>([]); const [edit, setEdit] = useState<string | null>(null); const [msg, setMsg] = useState('')
  const blank = { description: '', amount: '', category: CATS[0], spent_on: new Date().toISOString().slice(0, 10), paid_by: me.id, notes: '' }
  const [f, setF] = useState(blank)
  const load = useCallback(async () => { const { data } = await supabase.from('expenses').select('*').order('spent_on', { ascending: false }).order('created_at', { ascending: false }); setList((data ?? []) as Expense[]) }, [])
  useEffect(() => { load(); const ch = supabase.channel('expenses-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load])
  async function save() {
    const amount = Number(f.amount.replace(',', '.'))
    if (!f.description.trim() || !(amount > 0)) return setMsg('Indica una descripción y un importe mayor que 0.')
    const row = { description: f.description.trim(), amount, category: f.category, spent_on: f.spent_on, paid_by: f.paid_by, notes: f.notes || null }
    const { error } = edit ? await supabase.from('expenses').update(row).eq('id', edit) : await supabase.from('expenses').insert(row)
    if (error) return setMsg(error.message); setMsg(''); setEdit(null); setF(blank); load()
  }
  async function del(id: string) { if (confirm('¿Eliminar este gasto?')) { await supabase.from('expenses').delete().eq('id', id); load() } }
  const nm = (id: string) => people.find(p => p.id === id)?.name ?? '—'
  return <><div className="card"><h1>{edit ? 'Editar gasto' : 'Nuevo gasto'}</h1>
    <input placeholder="Descripción" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
    <input inputMode="decimal" placeholder="Importe (€)" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />
    <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
    <input type="date" value={f.spent_on} onChange={e => setF({ ...f, spent_on: e.target.value })} />
    <select value={f.paid_by} onChange={e => setF({ ...f, paid_by: e.target.value })}>{people.map(p => <option key={p.id} value={p.id}>Pagó {p.name}</option>)}</select>
    <textarea placeholder="Observaciones (opcional)" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
    <button onClick={save}>{edit ? 'Guardar cambios' : 'Añadir gasto'}</button>
    {edit && <button className="sec" onClick={() => { setEdit(null); setF(blank) }}>Cancelar</button>}{msg && <p className="err">{msg}</p>}</div>
    {list.map(e => <div className="card" key={e.id}><div className="row"><b>{e.description}</b><span className="neg">{eur(Number(e.amount))}</span></div>
      <p className="muted">{e.category} · {e.spent_on} · {nm(e.paid_by)}{e.notes ? ' · ' + e.notes : ''}</p>
      <div className="row"><button className="sec" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => { setEdit(e.id); setF({ description: e.description, amount: String(e.amount), category: e.category, spent_on: e.spent_on, paid_by: e.paid_by, notes: e.notes ?? '' }); scrollTo(0, 0) }}>Editar</button>
        <button className="del" onClick={() => del(e.id)}>Eliminar</button></div></div>)}</>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false)
  const [me, setMe] = useState<Profile | null>(null); const [people, setPeople] = useState<Profile[]>([]); const [tab, setTab] = useState('gastos'); const [agent, setAgent] = useState<any>(null); const [loaded, setLoaded] = useState(false); const [from, setFrom] = useState('gastos')
  useEffect(() => { Promise.race([supabase.auth.getSession(), new Promise<{ data: { session: null } }>(r => setTimeout(() => r({ data: { session: null } }), 8000))]).then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: s } = supabase.auth.onAuthStateChange((_e, ses) => setSession(ses)); return () => s.subscription.unsubscribe() }, [])
  const loadProfiles = useCallback(async () => {
    if (!session) return setMe(null)
    let { data } = await supabase.from('profiles').select('*')
    if (!(data ?? []).some((p: Profile) => p.id === session.user.id)) { await supabase.rpc('ensure_profile'); data = (await supabase.from('profiles').select('*')).data }
    const all = (data ?? []) as Profile[]; setPeople(all); setMe(all.find(p => p.id === session.user.id) ?? null)
    const { data: ag } = await supabase.from('agents').select('*').eq('user_id', session.user.id).maybeSingle(); setAgent(ag); setLoaded(true) }, [session])
  useEffect(() => { loadProfiles() }, [loadProfiles])
  const tabs = [['gastos', '💶', 'Gastos'], ['resumen', '📊', 'Resumen'], ['tareas', '✅', 'Tareas'], ['compras', '🛒', 'Compras'], ['deudores', '🔒', 'Deudores'], ['agentes', '🤝', 'Agentes']]
  if (!ready) return <div className="app"><p className="muted">Cargando…</p></div>
  if (!session) return <div className="app"><Auth /></div>
  if (!me) return <div className="app">{loaded ? <div className="card"><h1>No encontramos tu perfil</h1><p className="muted">Cierra sesión y vuelve a entrar. Si sigue igual, avisa a Luis.</p><button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div> : <p className="muted">Cargando perfil…</p>}</div>
  if (agent) return <div className="app"><AgentApp agent={agent} /></div>
  if (!me.space_id) return <div className="app"><SpaceSetup onDone={loadProfiles} /><ClaimAgent onDone={loadProfiles} /></div>
  const isLuis = me.name.toLowerCase().startsWith('luis'); const special = tab === 'agentes' || tab === 'ganancias'; const open = (t: string) => { setFrom(tab); setTab(t) }
  const sm = { width: 'auto', padding: '8px 12px' } as const
  return <div className="app">{special
    ? <div className="row" style={{ marginBottom: 12 }}><button className="sec" style={{ ...sm, fontSize: 20, margin: 0 }} onClick={() => setTab(from)}>←</button><h1 style={{ margin: 0 }}>{tab === 'agentes' ? 'Agentes' : 'Ganancias de agentes'}</h1>
      {tab === 'agentes' ? <button className="sec" style={{ ...sm, margin: 0 }} onClick={() => open('ganancias')}>💰</button> : <span style={{ width: 48 }} />}</div>
    : <div className="row"><h1>Hola, {me.name}</h1><div>{isLuis && <button className="sec" style={sm} onClick={() => open('ganancias')}>💰 Ganancias</button>}{' '}<button className="sec" style={sm} onClick={() => supabase.auth.signOut()}>Salir</button></div></div>}
    {tab === 'gastos' && <Expenses me={me} people={people} />}{tab === 'resumen' && <Summary people={people} />}{tab === 'tareas' && <Tasks people={people} />}
    {tab === 'compras' && <Shopping people={people} />}{tab === 'deudores' && <Debtors />}{tab === 'agentes' && <AdminAgents />}{tab === 'ganancias' && <AgentEarnings />}
    {!special && <nav>{tabs.filter(t => !['deudores', 'agentes'].includes(t[0]) || me.name.toLowerCase().startsWith('luis')).map(([k, i, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => k === 'agentes' ? open(k) : setTab(k)}><span>{i}</span>{l}</button>)}</nav>}</div>
}

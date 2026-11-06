import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const fmt = (s: string) => s.split('-').reverse().join('/')
const small = { width: 'auto', padding: '8px 12px', fontSize: 14 } as const
const sum = (l: R[], k: string) => l.reduce((a: number, x: R) => a + Number(x[k] || 0), 0)

export function ClaimAgent({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('')
  async function go() { const { error } = await supabase.rpc('claim_agent', { agent_code: code }); if (error) setMsg(error.message); else onDone() }
  return <div className="card"><h1>¿Eres agente?</h1><p className="muted">Escribe el código que te dio Luis.</p>
    <input placeholder="Código de agente" value={code} onChange={e => setCode(e.target.value)} /><button className="sec" onClick={go}>Entrar como agente</button>{msg && <p className="err">{msg}</p>}</div>
}

export function AgentApp({ agent }: { agent: R }) {
  const [rows, setRows] = useState<R[]>([]); const [client, setClient] = useState(''); const [amount, setAmount] = useState(''); const [msg, setMsg] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.from('agent_shipments').select('*').order('created_at', { ascending: false }); setRows(data ?? []) }, [])
  useEffect(() => { load(); const ch = supabase.channel('agent-self').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_shipments' }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load])
  const a = Number(amount.replace(',', '.'))
  async function add() {
    if (!client.trim() || !(a > 0)) return setMsg('Indica el cliente y un importe mayor que 0.')
    const { error } = await supabase.from('agent_shipments').insert({ agent_id: agent.id, client_name: client.trim(), amount: a })
    if (error) return setMsg(error.message); setMsg(''); setClient(''); setAmount(''); load()
  }
  const pend = rows.filter(r => !r.paid)
  return <><div className="row"><h1>Hola, {agent.name}</h1><button className="sec" style={small} onClick={() => supabase.auth.signOut()}>Salir</button></div>
    <div className="card"><p className="muted">Tu comisión: <b>{Number(agent.commission_pct)}%</b> por envío</p>
      <div className="row"><span>Pendiente de cobro</span><b className="neg">{eur(sum(pend, 'commission'))}</b></div>
      <div className="row"><span>Ya cobrado</span><b style={{ color: 'var(--verde)' }}>{eur(sum(rows.filter(r => r.paid), 'commission'))}</b></div></div>
    <div className="card"><h1>Registrar envío</h1><input placeholder="Nombre del cliente" value={client} onChange={e => setClient(e.target.value)} />
      <input inputMode="decimal" placeholder="Importe del envío (€)" value={amount} onChange={e => setAmount(e.target.value)} />
      {a > 0 && <p className="muted">Comisión estimada: <b>{eur(Math.round(a * Number(agent.commission_pct)) / 100)}</b></p>}
      <button onClick={add}>Registrar envío</button>{msg && <p className="err">{msg}</p>}</div>
    {rows.map(r => <div className="card" key={r.id}><div className="row"><b>{r.client_name}</b><span>{eur(Number(r.amount))}</span></div>
      <p className="muted">{fmt(r.sent_on)} · comisión {eur(Number(r.commission))} · {r.paid ? '✅ pagada ' + fmt(r.paid_on) : '⏳ pendiente'}</p>
      {!r.paid && <button className="del" onClick={async () => { if (confirm('¿Eliminar este envío?')) { await supabase.from('agent_shipments').delete().eq('id', r.id); load() } }}>Eliminar</button>}</div>)}</>
}

export function AdminAgents() {
  const [ags, setAgs] = useState<R[]>([]); const [sh, setSh] = useState<R[]>([]); const [name, setName] = useState(''); const [pct, setPct] = useState('3'); const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const a = await supabase.from('agents').select('*').order('created_at'); const s = await supabase.from('agent_shipments').select('*').order('sent_on', { ascending: false }); setAgs(a.data ?? []); setSh(s.data ?? []) }, [])
  useEffect(() => { load(); const ch = supabase.channel('agents-admin').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_shipments' }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load])
  async function add() {
    const p = Number(pct.replace(',', '.')); if (!name.trim() || !(p >= 0 && p <= 100)) return setMsg('Indica nombre y un % entre 0 y 100.')
    const { error } = await supabase.from('agents').insert({ name: name.trim(), commission_pct: p }); if (error) return setMsg(error.message); setMsg(''); setName(''); load()
  }
  const paidOn = new Date().toISOString().slice(0, 10)
  return <><div className="card"><h1>🤝 Agentes</h1><p className="muted">Crea el agente, fija su % y pásale el código para que se registre.</p>
    <input placeholder="Nombre (ej. Yoiber)" value={name} onChange={e => setName(e.target.value)} />
    <input inputMode="decimal" placeholder="% de comisión (ej. 3)" value={pct} onChange={e => setPct(e.target.value)} /><button onClick={add}>Crear agente</button>{msg && <p className="err">{msg}</p>}</div>
    <div className="card"><div className="row"><span>Comisiones pendientes (todos)</span><b className="neg">{eur(sum(sh.filter(x => !x.paid), 'commission'))}</b></div></div>
    {ags.map(a => { const mine = sh.filter(x => x.agent_id === a.id); const pend = mine.filter(x => !x.paid); const owed = sum(pend, 'commission')
      return <div className="card" key={a.id}><div className="row"><b>{a.name} · {Number(a.commission_pct)}%</b><button className="sec" style={small} onClick={async () => {
        const v = prompt('Nuevo % para los próximos envíos', String(a.commission_pct)); if (!v) return; const p = Number(v.replace(',', '.')); if (!(p >= 0 && p <= 100)) return alert('% no válido')
        await supabase.from('agents').update({ commission_pct: p }).eq('id', a.id); load() }}>Cambiar %</button></div>
        <p className="muted">{a.user_id ? '✅ Conectado' : <>Código para que se una: <b style={{ fontSize: '1.1rem', color: 'var(--azul)' }}>{a.code}</b></>}</p>
        <div className="row"><span>Enviado en total</span><b>{eur(sum(mine, 'amount'))}</b></div>
        <div className="row"><span>Comisión pendiente</span><b className="neg">{eur(owed)}</b></div>
        <div className="row"><span>Comisión ya pagada</span><b style={{ color: 'var(--verde)' }}>{eur(sum(mine.filter(x => x.paid), 'commission'))}</b></div>
        {owed > 0 && <button onClick={async () => { if (confirm(`¿Marcar como pagados ${eur(owed)} a ${a.name}?`)) { await supabase.from('agent_shipments').update({ paid: true, paid_on: paidOn }).eq('agent_id', a.id).eq('paid', false); load() } }}>Pagar todo ({eur(owed)})</button>}
        <details><summary className="muted" style={{ marginTop: 8 }}>Envíos ({mine.length})</summary>
          {mine.map(x => <div className="row" key={x.id} style={{ padding: '6px 0', borderTop: '1px solid #eef1f7' }}><span className="muted">{fmt(x.sent_on)} · {x.client_name}<br />{eur(Number(x.amount))} → {eur(Number(x.commission))}</span>
            <button style={small} className={x.paid ? 'sec' : ''} onClick={async () => { await supabase.from('agent_shipments').update({ paid: !x.paid, paid_on: x.paid ? null : paidOn }).eq('id', x.id); load() }}>{x.paid ? 'Pagado ✓' : 'Pagar'}</button></div>)}</details>
        <button className="del" style={{ marginTop: 8 }} onClick={async () => { if (confirm(`¿Eliminar a ${a.name} y todos sus envíos?`)) { await supabase.from('agents').delete().eq('id', a.id); load() } }}>Eliminar agente</button></div> })}</>
}

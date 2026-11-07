import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any
const money = (n: number, c: string) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: c }).format(n)
const fmt = (s: string) => s.split('-').reverse().join('/')
const small = { width: 'auto', padding: '8px 12px', fontSize: 14 } as const
const sum = (l: R[], f: (x: R) => number) => l.reduce((a: number, x: R) => a + f(x), 0)
const com = (x: R) => Number(x.commission || 0)
function stats(l: R[]) {
  const ok = l.filter(x => x.status === 'aceptado'); const un = ok.filter(x => !x.paid); const paid = ok.filter(x => x.paid)
  const conv = (x: R) => x.currency === 'USD' && x.paid_eur != null
  return { pe: sum(un.filter(x => x.currency === 'EUR'), com) + sum(un.filter(conv), x => Number(x.paid_eur)), pu: sum(un.filter(x => x.currency === 'USD' && x.paid_eur == null), com),
    ge: sum(paid.filter(x => x.currency === 'EUR'), com) + sum(paid.filter(conv), x => Number(x.paid_eur)), gu: sum(paid.filter(x => x.currency === 'USD' && x.paid_eur == null), com),
    cu: sum(un.filter(conv), com), ce: sum(un.filter(conv), x => Number(x.paid_eur)), review: l.filter(x => x.status === 'pendiente').length }
}
const month = () => new Date().toISOString().slice(0, 7)
const earned = (l: R[], c: string) => sum(l.filter(x => x.status === 'aceptado' && x.currency === c && String(x.sent_on).startsWith(month())), com)
const Goal = ({ v, goal, c }: { v: number; goal: number; c: string }) => goal > 0 ? <div><div className="row"><span className="muted">Meta del mes ({c === 'EUR' ? '€' : '$'})</span><b>{money(v, c)} / {money(goal, c)}</b></div>
  <div style={{ background: '#e8edf7', borderRadius: 8 }}><div style={{ width: Math.min(100, (v / goal) * 100) + '%', height: 10, background: v >= goal ? 'var(--verde)' : 'var(--azul)', borderRadius: 8 }} /></div>{v >= goal && <p className="muted">🎉 ¡Meta cumplida!</p>}</div> : null

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const wk = (k: string) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d) }
function Registros({ rows }: { rows: R[] }) {
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<'d' | 'w' | 'm'>('d')
  const key = (x: R) => mode === 'd' ? String(x.sent_on) : mode === 'w' ? wk(x.sent_on) : String(x.sent_on).slice(0, 7)
  const groups: Record<string, R[]> = {}; rows.forEach(x => { const k = key(x); (groups[k] = groups[k] || []).push(x) })
  const label = (k: string) => mode === 'd' ? fmt(k) : mode === 'w' ? 'Semana del ' + fmt(k).slice(0, 5) : k.split('-').reverse().join('/')
  const t = (g: R[], c: string, f: (x: R) => number, acc = false) => sum(g.filter(x => x.currency === c && (!acc || x.status === 'aceptado')), f)
  return <><button className="sec" onClick={() => setOpen(!open)}>📚 Registros {open ? '▲' : '▼'}</button>
    {open && <div style={{ marginTop: 8 }}><div className="row">{([['d', 'Día'], ['w', 'Semana'], ['m', 'Mes']] as const).map(([k, l]) => <button key={k} style={{ ...small, flex: 1 }} className={mode === k ? '' : 'sec'} onClick={() => setMode(k)}>{l}</button>)}</div>
      {rows.length === 0 && <p className="muted">Aún no hay registros.</p>}
      {Object.keys(groups).sort().reverse().map(k => { const g = groups[k]; return <div key={k} style={{ borderTop: '1px solid #eef1f7', padding: '8px 0' }}>
        <div className="row"><b>{label(k)}</b><span className="muted">{g.length} envío(s)</span></div>
        <p className="muted" style={{ margin: 0 }}>Enviado: {money(t(g, 'EUR', x => Number(x.amount)), 'EUR')} · {money(t(g, 'USD', x => Number(x.amount)), 'USD')}<br />Comisión: {money(t(g, 'EUR', com, true), 'EUR')} · {money(t(g, 'USD', com, true), 'USD')}</p></div> })}</div>}</>
}

export function ClaimAgent({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('')
  async function go() { const { error } = await supabase.rpc('claim_agent', { agent_code: code }); if (error) setMsg(error.message); else onDone() }
  return <div className="card"><h1>¿Eres agente?</h1><p className="muted">Escribe el código que te dio Luis.</p>
    <input placeholder="Código de agente" value={code} onChange={e => setCode(e.target.value)} /><button className="sec" onClick={go}>Entrar como agente</button>{msg && <p className="err">{msg}</p>}</div>
}

export function AgentApp({ agent }: { agent: R }) {
  const [rows, setRows] = useState<R[]>([]); const [client, setClient] = useState(''); const [amount, setAmount] = useState(''); const [cur, setCur] = useState('EUR'); const [msg, setMsg] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.from('agent_shipments').select('*').order('created_at', { ascending: false }); setRows(data ?? []) }, [])
  useEffect(() => { load(); const ch = supabase.channel('agent-self').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_shipments' }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load])
  const a = Number(amount.replace(',', '.')); const act = rows.filter(r => !r.archived); const st = stats(act)
  async function add() {
    if (!client.trim() || !(a > 0)) return setMsg('Indica el cliente y un importe mayor que 0.')
    const { error } = await supabase.from('agent_shipments').insert({ agent_id: agent.id, client_name: client.trim(), amount: a, currency: cur })
    if (error) return setMsg(error.message); setMsg(''); setClient(''); setAmount(''); load()
  }
  const state = (r: R) => r.status === 'pendiente' ? '🕒 En revisión (Luis debe aceptarlo)' : r.paid ? `✅ Pagada ${fmt(r.paid_on)}${r.paid_eur != null ? ` · convertida a ${money(Number(r.paid_eur), 'EUR')} (tasa ${Number(r.paid_rate)})` : ''}` : r.paid_eur != null ? `⏳ Aceptada · convertida a ${money(Number(r.paid_eur), 'EUR')} (tasa ${Number(r.paid_rate)}) · pendiente de pago` : '⏳ Aceptada, pendiente de pago'
  return <><div className="row"><h1>Hola, {agent.name}</h1><button className="sec" style={small} onClick={() => supabase.auth.signOut()}>Salir</button></div>
    <div className="card"><div className="row"><span>Pendiente de cobro</span><b className="neg">{money(st.pe, 'EUR')} · {money(st.pu, 'USD')}</b></div>
      <div className="row"><span>Ya cobrado</span><b style={{ color: 'var(--verde)' }}>{money(st.ge, 'EUR')}{st.gu > 0 ? ' · ' + money(st.gu, 'USD') : ''}</b></div>
      {st.review > 0 && <p className="muted">🕒 {st.review} envío(s) esperando que Luis los acepte</p>}
      <Goal v={earned(act, 'EUR')} goal={Number(agent.goal_eur)} c="EUR" /><Goal v={earned(act, 'USD')} goal={Number(agent.goal_usd)} c="USD" /></div>
    <div className="card"><h1>Registrar envío</h1><input placeholder="Nombre del cliente" value={client} onChange={e => setClient(e.target.value)} />
      <input inputMode="decimal" placeholder="Importe del envío" value={amount} onChange={e => setAmount(e.target.value)} />
      <select value={cur} onChange={e => setCur(e.target.value)}><option value="EUR">Euros (€)</option><option value="USD">Dólares ($)</option></select>
      <p className="muted">Luis fijará el % de comisión al aceptarlo.</p><button onClick={add}>Registrar envío</button>{msg && <p className="err">{msg}</p>}</div>
    {act.map(r => <div className="card" key={r.id}><div className="row"><b>{r.client_name}</b><span>{money(Number(r.amount), r.currency)}</span></div>
      <p className="muted">{fmt(r.sent_on)}{r.status === 'aceptado' ? ` · comisión ${money(com(r), r.currency)} (${Number(r.commission_pct)}%)` : ''} · {state(r)}</p>
      {r.status === 'pendiente' && <button className="del" onClick={async () => { if (confirm('¿Eliminar este envío?')) { await supabase.from('agent_shipments').delete().eq('id', r.id); load() } }}>Eliminar</button>}</div>)}<div className="card"><Registros rows={rows} /></div></>
}

export function AdminAgents() {
  const [ags, setAgs] = useState<R[]>([]); const [sh, setSh] = useState<R[]>([]); const [name, setName] = useState(''); const [pct, setPct] = useState('3'); const [msg, setMsg] = useState('')
  const [pcts, setPcts] = useState<Record<string, string>>({}); const [rates, setRates] = useState<Record<string, string>>({}); const [myp, setMyp] = useState<Record<string, string>>({}); const [gains, setGains] = useState<Record<string, R>>({})
  const load = useCallback(async () => {
    const a = await supabase.from('agents').select('*').order('created_at'); const s = await supabase.from('agent_shipments').select('*').order('sent_on', { ascending: false }); const g = await supabase.from('shipment_gains').select('*'); const m: Record<string, R> = {}; (g.data ?? []).forEach((r: R) => { m[r.shipment_id] = r }); setAgs(a.data ?? []); setSh(s.data ?? []); setGains(m) }, [])
  useEffect(() => { load(); const ch = supabase.channel('agents-admin').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_shipments' }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load])
  async function add() {
    const p = Number(pct.replace(',', '.')); if (!name.trim() || !(p >= 0 && p <= 100)) return setMsg('Indica nombre y un % entre 0 y 100.')
    const { error } = await supabase.from('agents').insert({ name: name.trim(), commission_pct: p }); if (error) return setMsg(error.message); setMsg(''); setName(''); load()
  }
  const num = (v: string) => Number((v || '0').replace(',', '.'))
  const lastMy = (a: R) => { try { return localStorage.getItem('mypct_' + a.id) || '0' } catch { return '0' } }
  const pctA = (x: R, a: R) => num(pcts[x.id] ?? String(a.commission_pct)); const pctM = (x: R, a: R) => num(myp[x.id] ?? lastMy(a))
  const cents = (amt: number, p: number) => Math.round(amt * p) / 100
  async function accept(x: R, a: R) {
    const p = pctA(x, a), m = pctM(x, a); if (!(p >= 0 && p <= 100) || !(m >= 0 && m <= 100)) return alert('% no válido')
    await supabase.from('agent_shipments').update({ commission_pct: p, commission: cents(Number(x.amount), p), status: 'aceptado' }).eq('id', x.id)
    await supabase.from('shipment_gains').upsert({ shipment_id: x.id, pct: m, amount: cents(Number(x.amount), m) })
    try { localStorage.setItem('mypct_' + a.id, String(m)) } catch { /* sin almacenamiento */ }
    load()
  }
  async function delShipment(x: R) { if (confirm('¿Borrar este registro de envío? No se puede deshacer.')) { await supabase.from('agent_shipments').delete().eq('id', x.id); load() } }
  async function delAll(a: R) {
    const n = sh.filter(x => x.agent_id === a.id).length; if (!n) return alert('No hay registros.')
    if (!confirm(`Se borrarán los ${n} registros de envíos de ${a.name}, incluidos los archivados. No se puede deshacer. ¿Continuar?`)) return
    if (!confirm('¿Seguro? También se perderá el historial de ganancias de este agente.')) return
    await supabase.from('agent_shipments').delete().eq('agent_id', a.id); load() }
  const today = () => new Date().toISOString().slice(0, 10)
  const unpaid = (a: R, patch: R) => supabase.from('agent_shipments').update(patch).eq('agent_id', a.id).eq('status', 'aceptado').eq('paid', false)
  async function payEur(a: R) { const b = { paid: true, paid_on: today() }; await unpaid(a, b).eq('currency', 'EUR'); await unpaid(a, b).eq('currency', 'USD').not('paid_eur', 'is', null); load() }
  async function payUsd(a: R) { await unpaid(a, { paid: true, paid_on: today() }).eq('currency', 'USD').is('paid_eur', null); load() }
  async function convert(a: R, rate: number) {
    await Promise.all(sh.filter(x => x.agent_id === a.id && x.status === 'aceptado' && !x.paid && x.currency === 'USD' && x.paid_eur == null).map(x => supabase.from('agent_shipments').update({ paid_rate: rate, paid_eur: Math.round(com(x) * rate * 100) / 100 }).eq('id', x.id))); load() }
  async function archive(a: R) { await supabase.from('agent_shipments').update({ archived: true }).eq('agent_id', a.id).eq('paid', true).eq('archived', false); load() }
  const tot = stats(sh.filter(x => !x.archived))
  return <><div className="card"><h1>🤝 Agentes</h1><p className="muted">Crea el agente, fija su % habitual y pásale el código para que se registre.</p>
    <input placeholder="Nombre (ej. Yoiber)" value={name} onChange={e => setName(e.target.value)} />
    <input inputMode="decimal" placeholder="% habitual (ej. 3)" value={pct} onChange={e => setPct(e.target.value)} /><button onClick={add}>Crear agente</button>{msg && <p className="err">{msg}</p>}</div>
    <div className="card"><div className="row"><span>Envíos por aceptar</span><b>{tot.review}</b></div><div className="row"><span>Pendiente de pago (todos)</span><b className="neg">{money(tot.pe, 'EUR')} · {money(tot.pu, 'USD')}</b></div></div>
    {ags.map(a => { const mine = sh.filter(x => x.agent_id === a.id); const act = mine.filter(x => !x.archived); const st = stats(act); const rate = Number((rates[a.id] || '').replace(',', '.')); const review = act.filter(x => x.status === 'pendiente')
      return <div className="card" key={a.id}><div className="row"><b>{a.name} · {Number(a.commission_pct)}% habitual</b><div><button className="sec" style={small} onClick={async () => {
        const v = prompt('Nuevo % habitual (se propone al aceptar cada envío)', String(a.commission_pct)); if (!v) return; const p = Number(v.replace(',', '.')); if (!(p >= 0 && p <= 100)) return alert('% no válido')
        await supabase.from('agents').update({ commission_pct: p }).eq('id', a.id); load() }}>% habitual</button>{' '}<button className="sec" style={small} onClick={async () => {
          const e = prompt('Meta mensual de comisión en € (0 = sin meta)', String(a.goal_eur)); if (e === null) return; const u = prompt('Meta mensual de comisión en $ (0 = sin meta)', String(a.goal_usd)); if (u === null) return
          const ge = Number(e.replace(',', '.')), gu = Number(u.replace(',', '.')); if (!(ge >= 0 && gu >= 0)) return alert('Importes no válidos')
          await supabase.from('agents').update({ goal_eur: ge, goal_usd: gu }).eq('id', a.id); load() }}>🎯 Meta</button></div></div>
        <p className="muted">{a.user_id ? '✅ Conectado' : <>Código para que se una: <b style={{ fontSize: '1.1rem', color: 'var(--azul)' }}>{a.code}</b></>}</p>
        <Goal v={earned(act, 'EUR')} goal={Number(a.goal_eur)} c="EUR" /><Goal v={earned(act, 'USD')} goal={Number(a.goal_usd)} c="USD" />
              {review.length > 0 && <><b style={{ display: 'block', marginTop: 10 }}>Por aceptar ({review.length})</b>{review.map(x => <div key={x.id} style={{ padding: '8px 0', borderTop: '1px solid #eef1f7' }}>
          <div className="row"><span>{x.client_name} · {fmt(x.sent_on)}</span><b>{money(Number(x.amount), x.currency)}</b></div>
          <div className="row" style={{ gap: 8 }}><div style={{ flex: 1 }}><span className="muted">% agente</span><input inputMode="decimal" value={pcts[x.id] ?? String(a.commission_pct)} onChange={e => setPcts({ ...pcts, [x.id]: e.target.value })} /></div><div style={{ flex: 1 }}><span className="muted">% mío</span><input inputMode="decimal" value={myp[x.id] ?? lastMy(a)} onChange={e => setMyp({ ...myp, [x.id]: e.target.value })} /></div></div>
          <p className="muted" style={{ margin: 0 }}>Agente: <b>{money(cents(Number(x.amount), pctA(x, a)), x.currency)}</b> · Yo: <b>{money(cents(Number(x.amount), pctM(x, a)), x.currency)}</b></p>
          <div className="row"><button style={small} onClick={() => accept(x, a)}>✓ Aceptar</button><button className="del" onClick={async () => { if (confirm('¿Rechazar y eliminar este envío?')) { await supabase.from('agent_shipments').delete().eq('id', x.id); load() } }}>Rechazar</button></div></div>)}</>}
        <div className="row" style={{ marginTop: 10 }}><span>Pendiente de pago</span><b className="neg">{money(st.pe, 'EUR')} · {money(st.pu, 'USD')}</b></div>
        {st.cu > 0 && <p className="muted" style={{ margin: 0 }}>El pendiente en € incluye {money(st.ce, 'EUR')} convertidos de {money(st.cu, 'USD')}</p>}
        <div className="row"><span>Ya pagado (€ incluye lo convertido)</span><b style={{ color: 'var(--verde)' }}>{money(st.ge, 'EUR')}{st.gu > 0 ? ' · ' + money(st.gu, 'USD') : ''}</b></div>
        {st.pe > 0 && <button onClick={() => { if (confirm(`¿Marcar como pagados ${money(st.pe, 'EUR')} a ${a.name}?`)) payEur(a) }}>Pagar € ({money(st.pe, 'EUR')})</button>}
        {st.pu > 0 && <><input inputMode="decimal" placeholder="Tipo de cambio: € por cada 1 $ (ej. 0,92)" value={rates[a.id] || ''} onChange={e => setRates({ ...rates, [a.id]: e.target.value })} />
          {rate > 0 && <p className="muted">{money(st.pu, 'USD')} → <b>{money(Math.round(st.pu * rate * 100) / 100, 'EUR')}</b> que se sumarán al pendiente en €</p>}
          <button disabled={!(rate > 0)} style={{ opacity: rate > 0 ? 1 : 0.5 }} onClick={() => { if (confirm(`¿Convertir ${money(st.pu, 'USD')} a € con tasa ${rate} y sumarlo al pendiente en €?`)) convert(a, rate) }}>Convertir a € y sumar al pendiente</button>
          <button className="sec" onClick={() => { if (confirm(`¿Pagar ${money(st.pu, 'USD')} en dólares a ${a.name}?`)) payUsd(a) }}>Pagar en $ ({money(st.pu, 'USD')})</button></>}
        {act.some(x => x.paid) && <button className="sec" style={{ marginTop: 10 }} onClick={() => { if (confirm(`Se guardarán en Registros los envíos ya pagados de ${a.name} y sus totales y su meta empezarán de cero. Los pendientes de pago se mantienen. ¿Restaurar el mes?`)) archive(a) }}>🔄 Restaurar mes (queda guardado en Registros)</button>}
        <details><summary className="muted" style={{ marginTop: 8 }}>Envíos actuales ({act.length})</summary>
          {act.map(x => <div className="row" key={x.id} style={{ borderTop: '1px solid #eef1f7', padding: '6px 0' }}><span className="muted">{fmt(x.sent_on)} · {x.client_name} · {money(Number(x.amount), x.currency)}{x.status === 'aceptado' ? ` → ${money(com(x), x.currency)} (${Number(x.commission_pct)}%)${x.paid_eur != null ? ' ≈ ' + money(Number(x.paid_eur), 'EUR') : ''}${x.paid ? ' ✅' : ' ⏳'}${gains[x.id] ? ' · yo ' + money(Number(gains[x.id].amount), x.currency) : ''}` : ' · 🕒 por aceptar'}</span><button className="del" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => delShipment(x)}>🗑</button></div>)}</details>
        <div style={{ marginTop: 8 }}><Registros rows={mine} /></div>
        <button className="del" style={{ marginTop: 8, marginRight: 8 }} onClick={() => delAll(a)}>🗑 Borrar registros</button><button className="del" style={{ marginTop: 8 }} onClick={async () => { if (confirm(`¿Eliminar a ${a.name} y todos sus envíos?`)) { await supabase.from('agents').delete().eq('id', a.id); load() } }}>Eliminar agente</button></div> })}</>
}

export function AgentEarnings() {
  const [ags, setAgs] = useState<R[]>([]); const [sh, setSh] = useState<R[]>([]); const [gn, setGn] = useState<R[]>([]); const [per, setPer] = useState<'d' | 'w' | 'm' | 't'>('m')
  const load = useCallback(async () => { const a = await supabase.from('agents').select('*').order('created_at'); const s = await supabase.from('agent_shipments').select('*'); const g = await supabase.from('shipment_gains').select('*'); setAgs(a.data ?? []); setSh(s.data ?? []); setGn(g.data ?? []) }, [])
  useEffect(() => { load(); const ch = supabase.channel('agents-earn').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_shipments' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'shipment_gains' }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load])
  const t = ymd(new Date()); const byId = new Map(sh.map(x => [x.id, x] as [string, R]))
  const inP = (x: R) => per === 't' || (per === 'd' ? x.sent_on === t : per === 'w' ? wk(x.sent_on) === wk(t) : String(x.sent_on).startsWith(t.slice(0, 7)))
  const rows = gn.map(g => ({ g, s: byId.get(g.shipment_id) })).filter(r => r.s && inP(r.s)) as { g: R; s: R }[]
  const block = (l: { g: R; s: R }[]) => { const tt = (c: string) => sum(l.filter(r => r.s.currency === c), r => Number(r.g.amount))
    return <><div className="row"><span>Mi ganancia</span><b style={{ color: 'var(--verde)' }}>{money(tt('EUR'), 'EUR')} · {money(tt('USD'), 'USD')}</b></div><p className="muted" style={{ margin: 0 }}>{l.length} envío(s)</p></> }
  return <><div className="card"><div className="row">{([['d', 'Hoy'], ['w', 'Semana'], ['m', 'Mes'], ['t', 'Total']] as const).map(([k, l]) => <button key={k} style={{ ...small, flex: 1 }} className={per === k ? '' : 'sec'} onClick={() => setPer(k)}>{l}</button>)}</div>
    <p className="muted">Solo tu ganancia en cada envío; no incluye la comisión de los agentes. Incluye registros archivados.</p></div>
    <div className="card"><b>Total de todos los agentes</b>{block(rows)}</div>
    {ags.map(a => <div className="card" key={a.id}><b>{a.name}</b>{block(rows.filter(r => r.s.agent_id === a.id))}</div>)}</>
}

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
type P = { id: string; name: string; space_id: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const today = () => new Date().toISOString().slice(0, 10)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (s: string) => s.split('-').reverse().join('/')
const small = { width: 'auto', padding: '8px 12px', fontSize: 14 } as const

function useRows(table: string, rt: boolean) {
  const [rows, setRows] = useState<R[]>([])
  const load = useCallback(async () => { const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false }); setRows(data ?? []) }, [table])
  useEffect(() => { load(); if (!rt) return; const ch = supabase.channel(table + '-rt2').on('postgres_changes', { event: '*', schema: 'public', table }, load).subscribe(); return () => { supabase.removeChannel(ch) } }, [load, rt, table])
  return [rows, load] as const
}
const Bar = ({ pct, color = 'var(--azul)' }: { pct: number; color?: string }) =>
  <div style={{ background: '#e8edf7', borderRadius: 8 }}><div style={{ width: Math.min(100, pct) + '%', height: 10, background: color, borderRadius: 8 }} /></div>

function range(mode: 'w' | 'm', off: number): [Date, Date] {
  const t = new Date(); t.setHours(12)
  if (mode === 'w') { const s = new Date(t); s.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 7 * off); const e = new Date(s); e.setDate(s.getDate() + 6); return [s, e] }
  return [new Date(t.getFullYear(), t.getMonth() + off, 1, 12), new Date(t.getFullYear(), t.getMonth() + off + 1, 0, 12)]
}

export function Summary({ people }: { people: P[] }) {
  const [rows] = useRows('expenses', true); const [mode, setMode] = useState<'w' | 'm'>('w'); const [off, setOff] = useState(0)
  const sum = (m: 'w' | 'm', o: number, who?: string) => { const [s, e] = range(m, o); return rows.filter((x: R) => x.spent_on >= iso(s) && x.spent_on <= iso(e) && (!who || x.paid_by === who)) }
  const tot = (l: R[]) => l.reduce((a: number, x: R) => a + Number(x.amount), 0)
  const cur = sum(mode, off); const total = tot(cur); const prev = tot(sum(mode, off - 1))
  const [s, e] = range(mode, off); const days = off === 0 ? Math.max(1, Math.round((Date.now() - s.getTime()) / 864e5)) : Math.round((e.getTime() - s.getTime()) / 864e5) + 1
  const cats: Record<string, number> = {}; cur.forEach((x: R) => { cats[x.category] = (cats[x.category] || 0) + Number(x.amount) })
  const hist = Array.from({ length: 8 }, (_, i) => { const o = off - i; return { o, label: fmt(iso(range(mode, o)[0])).slice(0, 5), v: tot(sum(mode, o)) } })
  const hmax = Math.max(1, ...hist.map(h => h.v)); const diff = prev ? ((total - prev) / prev) * 100 : null
  return <>
    <div className="card"><div className="row"><button className="sec" style={small} onClick={() => setOff(off - 1)}>◀</button>
      <b>{fmt(iso(s))} – {fmt(iso(e))}</b><button className="sec" style={small} disabled={off >= 0} onClick={() => setOff(off + 1)}>▶</button></div>
      <div className="row"><button className={mode === 'w' ? '' : 'sec'} onClick={() => { setMode('w'); setOff(0) }}>Semana</button><button className={mode === 'm' ? '' : 'sec'} onClick={() => { setMode('m'); setOff(0) }}>Mes</button></div></div>
    <div className="card"><p className="muted">Total gastado</p><h1 style={{ fontSize: '2rem' }}>{eur(total)}</h1>
      <p className="muted">Promedio diario: <b>{eur(total / days)}</b></p>
      <p className="muted">{diff === null ? 'Sin datos del periodo anterior' : <>vs. periodo anterior ({eur(prev)}): <b className={diff > 0 ? 'neg' : ''} style={diff <= 0 ? { color: 'var(--verde)' } : {}}>{diff > 0 ? '+' : ''}{diff.toFixed(0)}%</b></>}</p></div>
    <div className="card"><b>Por persona</b>{people.map(p => { const v = tot(sum(mode, off, p.id)); return <div key={p.id}><div className="row"><span>{p.name}</span><b>{eur(v)}</b></div><Bar pct={total ? (v / total) * 100 : 0} /></div> })}</div>
    <div className="card"><b>Por categoría</b>{Object.keys(cats).length === 0 && <p className="muted">Sin gastos en este periodo.</p>}
      {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => <div key={c}><div className="row"><span>{c}</span><b>{eur(v)}</b></div><Bar pct={(v / total) * 100} color="var(--verde)" /></div>)}</div>
    <div className="card"><b>Historial ({mode === 'w' ? 'semanas' : 'meses'} anteriores)</b>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, marginTop: 8 }}>{[...hist].reverse().map(h =>
        <div key={h.o} style={{ flex: 1, textAlign: 'center', fontSize: 10 }}><div style={{ height: (h.v / hmax) * 80, background: h.o === off ? 'var(--azul)' : '#9fb0d3', borderRadius: 6, minHeight: 2 }} />{h.label}</div>)}</div></div></>
}

export function Tasks({ people }: { people: P[] }) {
  const [rows, load] = useRows('tasks', true); const [edit, setEdit] = useState<string | null>(null); const [done, setDone] = useState(false)
  const blank = { title: '', assigned_to: 'ambos', due_on: '' }; const [f, setF] = useState(blank); const [msg, setMsg] = useState('')
  async function save() {
    if (!f.title.trim()) return setMsg('Escribe la tarea.')
    const row = { title: f.title.trim(), assigned_to: f.assigned_to, due_on: f.due_on || null }
    const { error } = edit ? await supabase.from('tasks').update(row).eq('id', edit) : await supabase.from('tasks').insert(row)
    if (error) return setMsg(error.message); setMsg(''); setEdit(null); setF(blank); load()
  }
  const who = (a: string) => a === 'ambos' ? 'Ambos' : a === 'luis' ? 'Luis' : 'Yelifer'
  const list = rows.filter((t: R) => t.done === done).sort((a: R, b: R) => (a.due_on || '9').localeCompare(b.due_on || '9'))
  return <><div className="card"><h1>{edit ? 'Editar tarea' : 'Nueva tarea'}</h1>
    <input placeholder="Tarea" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
    <select value={f.assigned_to} onChange={e => setF({ ...f, assigned_to: e.target.value })}><option value="luis">Luis</option><option value="yelifer">Yelifer</option><option value="ambos">Ambos</option></select>
    <input type="date" value={f.due_on} onChange={e => setF({ ...f, due_on: e.target.value })} />
    <button onClick={save}>{edit ? 'Guardar' : 'Añadir tarea'}</button>{edit && <button className="sec" onClick={() => { setEdit(null); setF(blank) }}>Cancelar</button>}{msg && <p className="err">{msg}</p>}</div>
    <div className="row"><button className={done ? 'sec' : ''} onClick={() => setDone(false)}>Pendientes</button><button className={done ? '' : 'sec'} onClick={() => setDone(true)}>Completadas</button></div>
    {list.length === 0 && <p className="muted">No hay tareas aquí.</p>}
    {list.map((t: R) => <div className="card" key={t.id}><div className="row"><b style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</b>
      <button style={small} className={t.done ? 'sec' : ''} onClick={async () => { await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id); load() }}>{t.done ? 'Reabrir' : '✓ Hecha'}</button></div>
      <p className="muted">{who(t.assigned_to)}{t.due_on ? ' · vence ' + fmt(t.due_on) : ''}{t.due_on && !t.done && t.due_on < today() ? ' · ⚠️ vencida' : ''}</p>
      <div className="row"><button className="sec" style={small} onClick={() => { setEdit(t.id); setF({ title: t.title, assigned_to: t.assigned_to, due_on: t.due_on || '' }); scrollTo(0, 0) }}>Editar</button>
        <button className="del" onClick={async () => { if (confirm('¿Eliminar tarea?')) { await supabase.from('tasks').delete().eq('id', t.id); load() } }}>Eliminar</button></div></div>)}
    <span hidden>{people.length}</span></>
}

export function Shopping({ people }: { people: P[] }) {
  const [rows, load] = useRows('shopping_items', true); const [name, setName] = useState(''); const [q, setQ] = useState('1')
  async function add() { if (!name.trim()) return; await supabase.from('shopping_items').insert({ name: name.trim(), quantity: q || '1' }); setName(''); setQ('1'); load() }
  const nm = (id: string) => people.find(p => p.id === id)?.name ?? ''
  const item = (t: R) => <div className="card" key={t.id}><div className="row"><div><b style={{ textDecoration: t.bought ? 'line-through' : 'none' }}>{t.name}</b> <span className="muted">× {t.quantity}</span><p className="muted" style={{ margin: 0 }}>Añadido por {nm(t.added_by)}</p></div>
    <div><button style={small} className={t.bought ? 'sec' : ''} onClick={async () => { await supabase.from('shopping_items').update({ bought: !t.bought }).eq('id', t.id); load() }}>{t.bought ? 'Deshacer' : '✓ Comprado'}</button>
      <button className="del" onClick={async () => { await supabase.from('shopping_items').delete().eq('id', t.id); load() }}>🗑</button></div></div></div>
  return <><div className="card"><h1>Añadir producto</h1><input placeholder="Producto" value={name} onChange={e => setName(e.target.value)} />
    <input placeholder="Cantidad" value={q} onChange={e => setQ(e.target.value)} /><button onClick={add}>Añadir a la lista</button></div>
    <b>Pendientes</b>{rows.filter((t: R) => !t.bought).map(item)}{rows.every((t: R) => t.bought) && <p className="muted">Todo comprado 🎉</p>}
    {rows.some((t: R) => t.bought) && <><b>Comprados</b>{rows.filter((t: R) => t.bought).map(item)}</>}</>
}

export function Debtors() {
  const [rows, load] = useRows('debtor_balances', false); const [pays, loadP] = useRows('debt_payments', false)
  const [edit, setEdit] = useState<string | null>(null); const blank = { name: '', initial_amount: '', lent_on: today(), concept: '', phone: '' }
  const [f, setF] = useState(blank); const [msg, setMsg] = useState(''); const both = () => { load(); loadP() }
  async function save() {
    const amt = Number(f.initial_amount.replace(',', '.')); if (!f.name.trim() || !(amt > 0)) return setMsg('Indica nombre e importe mayor que 0.')
    const row = { name: f.name.trim(), initial_amount: amt, lent_on: f.lent_on, concept: f.concept || null, phone: f.phone || null }
    const { error } = edit ? await supabase.from('debtors').update(row).eq('id', edit) : await supabase.from('debtors').insert(row)
    if (error) return setMsg(error.message); setMsg(''); setEdit(null); setF(blank); both()
  }
  async function pay(id: string, bal: number) {
    const v = prompt(`Importe del abono (pendiente: ${eur(bal)})`); if (!v) return; const a = Number(v.replace(',', '.'))
    if (!(a > 0) || a > bal + 0.001) return alert('Importe no válido.')
    await supabase.from('debt_payments').insert({ debtor_id: id, amount: a }); if (a >= bal - 0.001) await supabase.from('debtors').update({ paid: true }).eq('id', id); both()
  }
  const lent = rows.reduce((a: number, d: R) => a + Number(d.initial_amount), 0); const pend = rows.filter((d: R) => !d.paid).reduce((a: number, d: R) => a + Number(d.balance), 0)
  const people = rows.filter((d: R) => !d.paid && Number(d.balance) > 0).length
  return <><div className="card"><h1>🔒 Deudores (privado)</h1><div className="row"><span>Total prestado</span><b>{eur(lent)}</b></div>
    <div className="row"><span>Recuperado</span><b style={{ color: 'var(--verde)' }}>{eur(lent - rows.reduce((a: number, d: R) => a + Number(d.balance), 0))}</b></div>
    <div className="row"><span>Pendiente de cobro</span><b className="neg">{eur(pend)}</b></div><div className="row"><span>Personas que deben</span><b>{people}</b></div></div>
    <div className="card"><b>{edit ? 'Editar deuda' : 'Nueva deuda'}</b><input placeholder="Nombre del deudor" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input inputMode="decimal" placeholder="Importe inicial (€)" value={f.initial_amount} onChange={e => setF({ ...f, initial_amount: e.target.value })} />
      <input type="date" value={f.lent_on} onChange={e => setF({ ...f, lent_on: e.target.value })} /><input placeholder="Concepto" value={f.concept} onChange={e => setF({ ...f, concept: e.target.value })} />
      <input type="tel" placeholder="Teléfono (opcional)" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      <button onClick={save}>{edit ? 'Guardar' : 'Añadir deuda'}</button>{edit && <button className="sec" onClick={() => { setEdit(null); setF(blank) }}>Cancelar</button>}{msg && <p className="err">{msg}</p>}</div>
    {rows.map((d: R) => <div className="card" key={d.id}><div className="row"><b>{d.name}</b><b className={d.paid ? '' : 'neg'} style={d.paid ? { color: 'var(--verde)' } : {}}>{d.paid ? 'Pagada' : eur(Number(d.balance))}</b></div>
      <p className="muted">{eur(Number(d.initial_amount))} · {fmt(d.lent_on)}{d.concept ? ' · ' + d.concept : ''}{d.phone ? ' · ' + d.phone : ''}</p>
      {pays.filter((p: R) => p.debtor_id === d.id).map((p: R) => <p className="muted" key={p.id} style={{ margin: 0 }}>Abono {fmt(p.paid_on)}: {eur(Number(p.amount))}</p>)}
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>{!d.paid && <button style={small} onClick={() => pay(d.id, Number(d.balance))}>+ Abono</button>}
        {!d.paid && <button className="sec" style={small} onClick={async () => { if (confirm('¿Marcar como pagada?')) { await supabase.from('debtors').update({ paid: true }).eq('id', d.id); both() } }}>Pagada</button>}
        <button className="sec" style={small} onClick={() => { setEdit(d.id); setF({ name: d.name, initial_amount: String(d.initial_amount), lent_on: d.lent_on, concept: d.concept || '', phone: d.phone || '' }); scrollTo(0, 0) }}>Editar</button>
        <button className="del" onClick={async () => { if (confirm('¿Eliminar esta deuda y sus abonos?')) { await supabase.from('debtors').delete().eq('id', d.id); both() } }}>Eliminar</button></div></div>)}</>
}

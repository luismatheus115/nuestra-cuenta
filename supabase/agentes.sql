-- NUESTRA CUENTA · módulo AGENTES. Ejecutar entero en Supabase > SQL Editor (después de schema.sql).
create table agents(id uuid primary key default gen_random_uuid(), admin_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, commission_pct numeric(5,2) not null check(commission_pct>=0 and commission_pct<=100),
  code text unique not null default substr(md5(random()::text||clock_timestamp()::text),1,8),
  user_id uuid unique references auth.users on delete set null, created_at timestamptz default now());
create table agent_shipments(id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents(id) on delete cascade,
  client_name text not null, amount numeric(12,2) not null check(amount>0), sent_on date not null default current_date, notes text,
  commission_pct numeric(5,2), commission numeric(12,2), paid boolean not null default false, paid_on date, created_at timestamptz default now());
-- El % y la comisión los fija SIEMPRE el servidor al insertar; el agente no puede alterarlos ni marcar pagado.
create function public.shipment_defaults() returns trigger language plpgsql security definer set search_path=public as $$
begin select commission_pct into new.commission_pct from agents where id=new.agent_id;
  new.commission:=round(new.amount*new.commission_pct/100,2); new.paid:=false; new.paid_on:=null; return new; end $$;
create trigger shipment_defaults before insert on agent_shipments for each row execute function shipment_defaults();
create function public.claim_agent(agent_code text) returns void language plpgsql security definer set search_path=public as $$
declare a agents; begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into a from agents where code=lower(trim(agent_code)) and user_id is null;
  if a.id is null then raise exception 'Código no válido o ya usado'; end if;
  if a.admin_id=auth.uid() then raise exception 'No puedes ser tu propio agente'; end if;
  if exists(select 1 from agents where user_id=auth.uid()) then raise exception 'Ya eres agente'; end if;
  update agents set user_id=auth.uid() where id=a.id; end $$;
alter table agents enable row level security; alter table agent_shipments enable row level security;
create policy ag_admin on agents for all using(admin_id=auth.uid()) with check(admin_id=auth.uid());
create policy ag_self on agents for select using(user_id=auth.uid());
create policy sh_admin on agent_shipments for all using(agent_id in (select id from agents where admin_id=auth.uid()))
  with check(agent_id in (select id from agents where admin_id=auth.uid()));
create policy sh_sel on agent_shipments for select using(agent_id in (select id from agents where user_id=auth.uid()));
create policy sh_ins on agent_shipments for insert with check(agent_id in (select id from agents where user_id=auth.uid()));
create policy sh_del on agent_shipments for delete using(not paid and agent_id in (select id from agents where user_id=auth.uid()));
revoke all on agents, agent_shipments from anon;
alter publication supabase_realtime add table agent_shipments;

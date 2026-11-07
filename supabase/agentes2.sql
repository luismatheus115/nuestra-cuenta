-- NUESTRA CUENTA · agentes v2: aprobación de envíos, % por envío, dólares, conversión y metas. Ejecutar entero en Supabase > SQL Editor.
alter table agents add column if not exists goal_eur numeric(12,2) not null default 0, add column if not exists goal_usd numeric(12,2) not null default 0;
alter table agent_shipments add column if not exists currency text not null default 'EUR' check(currency in ('EUR','USD')),
  add column if not exists status text not null default 'pendiente' check(status in ('pendiente','aceptado')),
  add column if not exists paid_rate numeric(12,6), add column if not exists paid_eur numeric(12,2);
update agent_shipments set status='aceptado' where commission is not null and status='pendiente';
create or replace function public.shipment_defaults() returns trigger language plpgsql security definer set search_path=public as $$
begin new.commission_pct:=null; new.commission:=null; new.status:='pendiente'; new.paid:=false; new.paid_on:=null; new.paid_rate:=null; new.paid_eur:=null; return new; end $$;
drop policy if exists sh_del on agent_shipments;
create policy sh_del on agent_shipments for delete using(status='pendiente' and not paid and agent_id in (select id from agents where user_id=auth.uid()));

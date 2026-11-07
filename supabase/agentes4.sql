-- NUESTRA CUENTA · agentes v4: ganancia propia del administrador por envío (invisible para los agentes). Ejecutar entero en Supabase > SQL Editor.
create table if not exists shipment_gains(shipment_id uuid primary key references agent_shipments(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  pct numeric(5,2) not null check(pct>=0 and pct<=100), amount numeric(12,2) not null check(amount>=0));
alter table shipment_gains enable row level security;
drop policy if exists gains_owner on shipment_gains;
create policy gains_owner on shipment_gains for all using(owner_id=auth.uid())
  with check(owner_id=auth.uid() and shipment_id in (select s.id from agent_shipments s join agents a on a.id=s.agent_id where a.admin_id=auth.uid()));
revoke all on shipment_gains from anon;
do $$ begin alter publication supabase_realtime add table shipment_gains; exception when duplicate_object then null; end $$;

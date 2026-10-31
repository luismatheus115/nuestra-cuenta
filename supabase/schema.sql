-- NUESTRA CUENTA · esquema + RLS. Ejecutar entero en Supabase > SQL Editor.
create table spaces(id uuid primary key default gen_random_uuid(), name text not null,
  invite_code text unique not null default substr(md5(random()::text||clock_timestamp()::text),1,8),
  created_by uuid default auth.uid(), created_at timestamptz default now());
create table profiles(id uuid primary key references auth.users on delete cascade,
  name text not null, space_id uuid references spaces(id));
create function public.my_space() returns uuid language sql stable security definer set search_path=public
as $$ select space_id from profiles where id=auth.uid() $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public
as $$ begin insert into profiles(id,name) values(new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1))); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function public.create_space(space_name text) returns text language plpgsql security definer set search_path=public as $$
declare s spaces; begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if my_space() is not null then raise exception 'Ya perteneces a un espacio'; end if;
  insert into spaces(name) values(space_name) returning * into s;
  update profiles set space_id=s.id where id=auth.uid(); return s.invite_code; end $$;
create function public.join_space(code text) returns void language plpgsql security definer set search_path=public as $$
declare s uuid; n int; begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if my_space() is not null then raise exception 'Ya perteneces a un espacio'; end if;
  select id into s from spaces where invite_code=lower(trim(code));
  if s is null then raise exception 'Código no válido'; end if;
  select count(*) into n from profiles where space_id=s;
  if n>=2 then raise exception 'El espacio ya tiene dos personas'; end if;
  update profiles set space_id=s where id=auth.uid(); end $$;

create table expenses(id uuid primary key default gen_random_uuid(), space_id uuid not null default my_space() references spaces(id),
  description text not null check(length(trim(description))>0), amount numeric(10,2) not null check(amount>0 and amount<1000000),
  category text not null check(category in ('Alimentación','Hogar','Transporte','Salud','Ocio','Compras','Otros')),
  spent_on date not null default current_date, paid_by uuid not null references profiles(id), notes text, created_at timestamptz default now());
create table tasks(id uuid primary key default gen_random_uuid(), space_id uuid not null default my_space() references spaces(id),
  title text not null, assigned_to text not null default 'ambos' check(assigned_to in ('luis','yelifer','ambos')),
  due_on date, done boolean not null default false, created_at timestamptz default now());
create table shopping_items(id uuid primary key default gen_random_uuid(), space_id uuid not null default my_space() references spaces(id),
  name text not null, quantity text default '1', added_by uuid not null default auth.uid() references profiles(id),
  bought boolean not null default false, created_at timestamptz default now());
-- PRIVADO: solo el propietario (auth.uid()) ve y modifica estas filas
create table debtors(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, initial_amount numeric(10,2) not null check(initial_amount>0), lent_on date not null default current_date,
  concept text, phone text, paid boolean not null default false, created_at timestamptz default now());
create table debt_payments(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  debtor_id uuid not null references debtors(id) on delete cascade, amount numeric(10,2) not null check(amount>0), paid_on date not null default current_date);
create view debtor_balances with (security_invoker=true) as
  select d.*, d.initial_amount - coalesce((select sum(amount) from debt_payments p where p.debtor_id=d.id),0) as balance from debtors d;

alter table spaces enable row level security; alter table profiles enable row level security;
alter table expenses enable row level security; alter table tasks enable row level security;
alter table shopping_items enable row level security; alter table debtors enable row level security; alter table debt_payments enable row level security;
create policy spaces_sel on spaces for select using(id=my_space());
create policy prof_sel on profiles for select using(id=auth.uid() or space_id=my_space());
create policy prof_upd on profiles for update using(id=auth.uid()) with check(id=auth.uid() and space_id is not distinct from my_space());
create policy exp_all on expenses for all using(space_id=my_space()) with check(space_id=my_space() and paid_by in (select id from profiles where space_id=my_space()));
create policy task_all on tasks for all using(space_id=my_space()) with check(space_id=my_space());
create policy shop_all on shopping_items for all using(space_id=my_space()) with check(space_id=my_space());
create policy debt_all on debtors for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy pay_all on debt_payments for all using(owner_id=auth.uid())
  with check(owner_id=auth.uid() and debtor_id in (select id from debtors where owner_id=auth.uid()));
revoke all on debtors, debt_payments, debtor_balances from anon;
alter publication supabase_realtime add table expenses, tasks, shopping_items;

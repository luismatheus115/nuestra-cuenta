-- Arreglo de perfiles. Ejecutar entero en Supabase > SQL Editor.
insert into profiles(id,name)
select id, coalesce(raw_user_meta_data->>'name', split_part(email,'@',1)) from auth.users
on conflict (id) do nothing;
create or replace function public.ensure_profile() returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  insert into profiles(id,name) select id, coalesce(raw_user_meta_data->>'name', split_part(email,'@',1)) from auth.users where id=auth.uid() on conflict (id) do nothing;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- NUESTRA CUENTA · agentes v3: archivo de registros (restaurar mes). Ejecutar entero en Supabase > SQL Editor.
alter table agent_shipments add column if not exists archived boolean not null default false;

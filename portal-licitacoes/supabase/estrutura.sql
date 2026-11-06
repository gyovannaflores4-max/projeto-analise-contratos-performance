-- Equipe Comercial | estrutura do banco no Supabase (projeto "Pregão em Dia" no Supabase, sa-east-1).
-- Já aplicada no projeto. Fica aqui como registro e para recriar o banco se precisar.

-- E-mails autorizados a criar conta (sem acesso pela API: só o gatilho lê)
create table public.portal_permitidos (
  email text primary key
);
alter table public.portal_permitidos enable row level security;
insert into public.portal_permitidos (email) values ('gyovannaflores4@gmail.com');

-- Dados do portal de cada pessoa (editais, chats, recursos, documentos, portais, ajustes)
create table public.portal_estado (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.portal_estado enable row level security;
create policy "Cada pessoa lê só os próprios dados" on public.portal_estado
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Cada pessoa cria só os próprios dados" on public.portal_estado
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Cada pessoa altera só os próprios dados" on public.portal_estado
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.portal_marca_atualizacao()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger portal_estado_atualizado before update on public.portal_estado
  for each row execute function public.portal_marca_atualizacao();

-- Só e-mails autorizados criam conta; esses já entram confirmados.
create or replace function public.portal_controla_cadastro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.portal_permitidos p where lower(p.email) = lower(new.email)) then
    raise exception 'Cadastro não autorizado para este e-mail';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;
revoke execute on function public.portal_controla_cadastro() from public, anon, authenticated;
create trigger portal_controla_cadastro before insert on auth.users
  for each row execute function public.portal_controla_cadastro();

-- Para liberar outra pessoa no futuro:
--   insert into public.portal_permitidos (email) values ('nome@empresa.com.br');

-- Resumo diário por e-mail: chave do robô do GitHub (só o hash fica no banco).
-- A pessoa gera a chave no portal (Ajustes) e cadastra no GitHub como segredo PORTAL_CHAVE_ROBO.
create table public.portal_robo_chave (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hash text not null unique,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);
alter table public.portal_robo_chave enable row level security;
create policy "Cada pessoa vê a própria chave do robô" on public.portal_robo_chave
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Cada pessoa cria a própria chave do robô" on public.portal_robo_chave
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Cada pessoa troca a própria chave do robô" on public.portal_robo_chave
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Cada pessoa apaga a própria chave do robô" on public.portal_robo_chave
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.portal_gerar_chave_robo()
returns text language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  chave text;
begin
  if uid is null then raise exception 'Entre no portal para gerar a chave'; end if;
  chave := 'ped_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.portal_robo_chave (user_id, hash) values (uid, encode(sha256(convert_to(chave, 'UTF8')), 'hex'))
  on conflict (user_id) do update set hash = excluded.hash, criado_em = now(), usado_em = null;
  return chave;
end;
$$;
revoke execute on function public.portal_gerar_chave_robo() from public, anon;
grant execute on function public.portal_gerar_chave_robo() to authenticated;

create or replace function public.portal_situacao_chave_robo()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('criado_em', c.criado_em, 'usado_em', c.usado_em)
  from public.portal_robo_chave c where c.user_id = auth.uid();
$$;
revoke execute on function public.portal_situacao_chave_robo() from public, anon;
grant execute on function public.portal_situacao_chave_robo() to authenticated;

create or replace function public.portal_apagar_chave_robo()
returns void language sql security invoker set search_path = '' as $$
  delete from public.portal_robo_chave where user_id = auth.uid();
$$;
revoke execute on function public.portal_apagar_chave_robo() from public, anon;
grant execute on function public.portal_apagar_chave_robo() to authenticated;

-- Usada pelo robô (chave pública do projeto + chave do robô). Sem a chave certa, devolve null.
create or replace function public.portal_estado_robo(chave text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  resultado jsonb;
begin
  if chave is null or length(chave) < 40 then return null; end if;
  update public.portal_robo_chave set usado_em = now()
   where hash = encode(sha256(convert_to(chave, 'UTF8')), 'hex')
  returning user_id into uid;
  if uid is null then return null; end if;
  select jsonb_build_object('dados', e.dados, 'atualizado_em', e.atualizado_em) into resultado
    from public.portal_estado e where e.user_id = uid;
  return resultado;
end;
$$;
revoke execute on function public.portal_estado_robo(text) from public, authenticated;
grant execute on function public.portal_estado_robo(text) to anon;
-- Garimpo: editais abertos achados pelo robô no PNCP, por pessoa
create table public.portal_garimpo (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  dados jsonb not null,
  nota integer not null default 0,
  achado_em timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.portal_garimpo enable row level security;
create policy "Cada pessoa lê só o próprio garimpo" on public.portal_garimpo
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Cada pessoa apaga só o próprio garimpo" on public.portal_garimpo
  for delete to authenticated using ((select auth.uid()) = user_id);

-- O robô grava com a chave do portal (a mesma do resumo diário). Devolve quantos são novos.
create or replace function public.portal_garimpo_robo(chave text, itens jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  novos integer;
begin
  if chave is null or length(chave) < 40 or jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 2000 then return null; end if;
  select c.user_id into uid from public.portal_robo_chave c where c.hash = encode(sha256(convert_to(chave, 'UTF8')), 'hex');
  if uid is null then return null; end if;
  select count(*) into novos from jsonb_array_elements(itens) x
   where not exists (select 1 from public.portal_garimpo g where g.user_id = uid and g.id = x->>'id');
  insert into public.portal_garimpo (user_id, id, dados, nota)
  select uid, x->>'id', x->'dados', coalesce((x->>'nota')::int, 0) from jsonb_array_elements(itens) x where coalesce(x->>'id', '') <> ''
  on conflict (user_id, id) do update set dados = excluded.dados, nota = excluded.nota;
  -- tira o que já encerrou há mais de 2 dias
  delete from public.portal_garimpo g where g.user_id = uid and (g.dados->>'encerramento') < to_char(now() - interval '2 days', 'YYYY-MM-DD');
  return novos;
end;
$$;
revoke all on function public.portal_garimpo_robo(text, jsonb) from public;
grant execute on function public.portal_garimpo_robo(text, jsonb) to anon, authenticated;

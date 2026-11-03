-- Pregão em Dia | estrutura do banco no Supabase (projeto "Pregão em Dia", sa-east-1).
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

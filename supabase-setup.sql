create extension if not exists pgcrypto;

create table if not exists public.public_polls (
  id text primary key default gen_random_uuid()::text,
  question text not null,
  poll_type text not null default 'mc' check (poll_type in ('mc', 'oe', 'wc')),
  options jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id text not null references public.public_polls(id) on delete cascade,
  voter_id text not null,
  option_index integer,
  response_text text,
  created_at timestamptz not null default now(),
  constraint poll_votes_one_per_voter unique (poll_id, voter_id),
  constraint poll_votes_answer_check check (
    (option_index is not null and response_text is null)
    or (option_index is null and response_text is not null)
  )
);

create table if not exists public.poll_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.public_polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_admins enable row level security;

grant select, insert, update, delete on public.public_polls to anon, authenticated;
grant select, insert, delete on public.poll_votes to anon, authenticated;

create or replace function public.is_poll_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.poll_admins where user_id = auth.uid());
$$;
revoke all on function public.is_poll_admin() from public;
grant execute on function public.is_poll_admin() to anon, authenticated;

drop policy if exists "Public can read active polls; admins can read all" on public.public_polls;
create policy "Public can read active polls; admins can read all"
  on public.public_polls for select to anon, authenticated
  using (is_active or public.is_poll_admin());

drop policy if exists "Admins manage polls" on public.public_polls;
create policy "Admins manage polls"
  on public.public_polls for all to authenticated
  using (public.is_poll_admin())
  with check (public.is_poll_admin());

drop policy if exists "Public can read poll results" on public.poll_votes;
create policy "Public can read poll results"
  on public.poll_votes for select to anon, authenticated
  using (true);

drop policy if exists "Public can submit one answer to an active poll" on public.poll_votes;
create policy "Public can submit one answer to an active poll"
  on public.poll_votes for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.public_polls
      where public_polls.id = poll_votes.poll_id
        and public_polls.is_active = true
    )
  );

drop policy if exists "Admins delete poll responses" on public.poll_votes;
create policy "Admins delete poll responses"
  on public.poll_votes for delete to authenticated
  using (public.is_poll_admin());

revoke all on public.poll_admins from anon, authenticated;

-- After creating your admin user in Authentication > Users, allowlist it:
-- insert into public.poll_admins (user_id) values ('YOUR_AUTH_USER_UUID');

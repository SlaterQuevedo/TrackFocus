-- ===========================================================
-- TrackFocus · Esquema PostgreSQL para Supabase
-- 100% idempotente: puedes ejecutarlo entero, a trozos, o repetido
-- y nunca fallará.  PostgreSQL no soporta "CREATE POLICY IF NOT EXISTS",
-- así que usamos el patrón equivalente: DROP IF EXISTS + CREATE.
-- ===========================================================

-- ---------- TABLAS ----------

create table if not exists public.users (
  id                 text primary key,                            -- email
  auth_id            uuid unique references auth.users(id) on delete cascade,
  email              text unique not null,
  name               text not null,
  avatar_url         text,
  role               text not null default 'student'
                       check (role in ('student', 'teacher', 'super_admin')),
  school_id          text,
  classroom_id       text,
  institution_type   text,
  approval_status    text check (approval_status in ('pending','approved','rejected') or approval_status is null),
  xp                 integer not null default 0,
  level              integer not null default 1,
  streak             integer not null default 0,
  last_study_date    date,
  badges             text[]  not null default '{}',
  challenge_progress jsonb   not null default '{}'::jsonb,
  classroom_ids      text[]  not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.schools (
  id          text primary key,
  name        text not null,
  code        text unique not null,
  admin_ids   text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists public.classrooms (
  id           text primary key,
  school_id    text not null references public.schools(id) on delete cascade,
  name         text not null,
  grade        text,
  section      text,
  teacher_ids  text[] not null default '{}',
  student_ids  text[] not null default '{}',
  invite_code  text unique not null,
  created_at   timestamptz not null default now()
);

-- FKs diferidos para users (idempotente vía DO block)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_school_fk') then
    alter table public.users add constraint users_school_fk
      foreign key (school_id) references public.schools(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_classroom_fk') then
    alter table public.users add constraint users_classroom_fk
      foreign key (classroom_id) references public.classrooms(id) on delete set null;
  end if;
end $$;

create table if not exists public.study_sessions (
  id                       text primary key,
  email                    text not null references public.users(id) on delete cascade,
  datetime                 timestamptz not null,
  institution_type         text,
  subject                  text not null,
  concentration            smallint not null check (concentration between 1 and 5),
  duration_min             integer  not null check (duration_min > 0),
  previous_activity        text,
  previous_activity_other  text default '',
  comment                  text default '',
  classroom_id             text references public.classrooms(id) on delete set null,
  metrics                  jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);
create index if not exists study_sessions_email_idx    on public.study_sessions(email);
create index if not exists study_sessions_datetime_idx on public.study_sessions(datetime desc);

create table if not exists public.uploaded_files (
  id                 text primary key,
  user_id            text not null references public.users(id) on delete cascade,
  file_name          text not null,
  file_type          text not null,
  file_size          integer not null,
  storage_path       text not null,
  uploaded_at        timestamptz not null default now(),
  session_id         text references public.study_sessions(id) on delete set null,
  classroom_id       text references public.classrooms(id) on delete set null,
  metadata           jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists uploaded_files_user_id_idx on public.uploaded_files(user_id);
create index if not exists uploaded_files_session_id_idx on public.uploaded_files(session_id);

create table if not exists public.custom_subjects (
  email      text not null references public.users(id) on delete cascade,
  subject    text not null,
  created_at timestamptz not null default now(),
  primary key (email, subject)
);

create table if not exists public.classroom_requests (
  id                 text primary key,
  student_id         text not null references public.users(id) on delete cascade,
  student_name       text not null,
  student_email      text not null,
  school_id          text not null references public.schools(id) on delete cascade,
  classroom_id       text references public.classrooms(id) on delete set null,
  type               text not null check (type in ('join','change')),
  from_classroom_id  text references public.classrooms(id) on delete set null,
  status             text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        text
);

create table if not exists public.user_roles (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null references public.users(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('student','teacher','super_admin')),
  school_id    text,
  classroom_id text,
  created_at   timestamptz not null default now(),
  unique(email, role, school_id, classroom_id)
);
create index if not exists user_roles_email_idx on public.user_roles(email);
create index if not exists user_roles_role_idx on public.user_roles(role);

-- ---------- TRIGGER: auto-crear perfil al hacer login con Google ----------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_email text := lower(new.email);
  user_name  text := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(user_email, '@', 1)
  );
  user_avatar text := new.raw_user_meta_data->>'avatar_url';
begin
  insert into public.users (id, auth_id, email, name, avatar_url, role)
  values (user_email, new.id, user_email, user_name, user_avatar, 'student')
  on conflict (id) do update
    set auth_id   = excluded.auth_id,
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
        name       = case when public.users.name = public.users.email
                          then excluded.name
                          else public.users.name end,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------- BACKFILL: Populate user_roles from existing users (one-time, idempotent) ----------

do $$
begin
  insert into public.user_roles (user_id, email, role, school_id, classroom_id)
  select id, email, role, school_id, classroom_id
  from public.users
  on conflict (email, role, school_id, classroom_id) do nothing;
exception when others then null;
end $$;

-- ---------- INSERT OFFICIAL SUPER ADMINS (idempotent) ----------

do $$
declare
  admin1_email text := 'trackfocus.owner@gmail.com';
  admin2_email text := 'trackfocus.support@gmail.com';
begin
  -- Insert admin1 user, force super_admin even if already exists as student
  insert into public.users (id, email, name, role)
  values (admin1_email, admin1_email, 'TrackFocus Owner', 'super_admin')
  on conflict (id) do update set role = 'super_admin';

  -- Insert admin2 user, force super_admin even if already exists as student
  insert into public.users (id, email, name, role)
  values (admin2_email, admin2_email, 'TrackFocus Support', 'super_admin')
  on conflict (id) do update set role = 'super_admin';

  -- Remove student role from admin emails (in case trigger created it first)
  delete from public.user_roles where email = admin1_email and role = 'student';
  delete from public.user_roles where email = admin2_email and role = 'student';

  -- Add admin1 to user_roles if doesn't exist
  insert into public.user_roles (user_id, email, role)
  values (admin1_email, admin1_email, 'super_admin')
  on conflict (email, role, school_id, classroom_id) do nothing;

  -- Add admin2 to user_roles if doesn't exist
  insert into public.user_roles (user_id, email, role)
  values (admin2_email, admin2_email, 'super_admin')
  on conflict (email, role, school_id, classroom_id) do nothing;

exception when others then null;
end $$;

-- ---------- ROW-LEVEL SECURITY ----------

alter table public.users              enable row level security;
alter table public.schools            enable row level security;
alter table public.classrooms         enable row level security;
alter table public.study_sessions     enable row level security;
alter table public.uploaded_files     enable row level security;
alter table public.custom_subjects    enable row level security;
alter table public.classroom_requests enable row level security;
alter table public.user_roles         enable row level security;

-- ---- Helpers (security definer para evitar recursión RLS) ----

create or replace function public.current_email() returns text
language sql stable as $$
  select lower(auth.jwt() ->> 'email')
$$;

create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where id = lower(auth.jwt() ->> 'email')
$$;

create or replace function public.current_school() returns text
language sql stable security definer set search_path = public as $$
  select school_id from public.users where id = lower(auth.jwt() ->> 'email')
$$;

create or replace function public.current_classroom() returns text
language sql stable security definer set search_path = public as $$
  select classroom_id from public.users where id = lower(auth.jwt() ->> 'email')
$$;

create or replace function public.current_teacher_classrooms() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(classroom_ids, '{}') from public.users where id = lower(auth.jwt() ->> 'email')
$$;

-- ===========================================================
-- POLÍTICAS RLS — cada bloque drop+create es autónomo e idempotente.
-- ===========================================================

-- Borrar también las políticas MVP antiguas, por si quedaron de versiones previas.
drop policy if exists "rw_authenticated" on public.users;
drop policy if exists "rw_authenticated" on public.schools;
drop policy if exists "rw_authenticated" on public.classrooms;
drop policy if exists "rw_authenticated" on public.study_sessions;
drop policy if exists "rw_authenticated" on public.custom_subjects;
drop policy if exists "rw_authenticated" on public.classroom_requests;

-- ---- USERS ----

drop policy if exists "users_select" on public.users;
create policy "users_select" on public.users for select to authenticated
  using (
    id = public.current_email()
    or public.current_role() = 'super_admin'
    or (classroom_id is not null and classroom_id = public.current_classroom())
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "users_insert" on public.users;
create policy "users_insert" on public.users for insert to authenticated
  with check (
    id = public.current_email()
    or public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "users_update" on public.users;
create policy "users_update" on public.users for update to authenticated
  using (
    id = public.current_email()
    or public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  )
  with check (
    id = public.current_email()
    or public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "users_delete" on public.users;
create policy "users_delete" on public.users for delete to authenticated
  using (public.current_role() = 'super_admin');

-- ---- SCHOOLS ----

drop policy if exists "schools_select" on public.schools;
create policy "schools_select" on public.schools for select to authenticated
  using (true);

drop policy if exists "schools_insert" on public.schools;
create policy "schools_insert" on public.schools for insert to authenticated
  with check (public.current_role() in ('teacher', 'super_admin'));

drop policy if exists "schools_update" on public.schools;
create policy "schools_update" on public.schools for update to authenticated
  using (public.current_role() in ('teacher', 'super_admin'))
  with check (public.current_role() in ('teacher', 'super_admin'));

drop policy if exists "schools_delete" on public.schools;
create policy "schools_delete" on public.schools for delete to authenticated
  using (public.current_role() = 'super_admin');

-- ---- CLASSROOMS ----

drop policy if exists "classrooms_select" on public.classrooms;
create policy "classrooms_select" on public.classrooms for select to authenticated
  using (true);

drop policy if exists "classrooms_insert" on public.classrooms;
create policy "classrooms_insert" on public.classrooms for insert to authenticated
  with check (
    public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "classrooms_update" on public.classrooms;
create policy "classrooms_update" on public.classrooms for update to authenticated
  using (
    public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  )
  with check (
    public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "classrooms_delete" on public.classrooms;
create policy "classrooms_delete" on public.classrooms for delete to authenticated
  using (
    public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

-- ---- STUDY_SESSIONS ----

drop policy if exists "sessions_select" on public.study_sessions;
create policy "sessions_select" on public.study_sessions for select to authenticated
  using (
    email = public.current_email()
    or public.current_role() = 'super_admin'
    or (
      public.current_role() = 'teacher'
      and classroom_id = any(public.current_teacher_classrooms())
    )
    or (
      public.current_role() = 'teacher'
      and email in (select id from public.users where school_id = public.current_school())
    )
  );

drop policy if exists "sessions_insert" on public.study_sessions;
create policy "sessions_insert" on public.study_sessions for insert to authenticated
  with check (email = public.current_email() or public.current_role() = 'super_admin');

drop policy if exists "sessions_update" on public.study_sessions;
create policy "sessions_update" on public.study_sessions for update to authenticated
  using (email = public.current_email() or public.current_role() = 'super_admin')
  with check (email = public.current_email() or public.current_role() = 'super_admin');

drop policy if exists "sessions_delete" on public.study_sessions;
create policy "sessions_delete" on public.study_sessions for delete to authenticated
  using (email = public.current_email() or public.current_role() = 'super_admin');

-- ---- UPLOADED_FILES ----

drop policy if exists "uploaded_files_select" on public.uploaded_files;
create policy "uploaded_files_select" on public.uploaded_files for select to authenticated
  using (
    user_id = public.current_email()
    or public.current_role() = 'super_admin'
    or (
      public.current_role() = 'teacher'
      and classroom_id = any(public.current_teacher_classrooms())
    )
  );

drop policy if exists "uploaded_files_insert" on public.uploaded_files;
create policy "uploaded_files_insert" on public.uploaded_files for insert to authenticated
  with check (user_id = public.current_email() or public.current_role() = 'super_admin');

drop policy if exists "uploaded_files_update" on public.uploaded_files;
create policy "uploaded_files_update" on public.uploaded_files for update to authenticated
  using (user_id = public.current_email() or public.current_role() = 'super_admin')
  with check (user_id = public.current_email() or public.current_role() = 'super_admin');

drop policy if exists "uploaded_files_delete" on public.uploaded_files;
create policy "uploaded_files_delete" on public.uploaded_files for delete to authenticated
  using (user_id = public.current_email() or public.current_role() = 'super_admin');

-- ---- CUSTOM_SUBJECTS ----

drop policy if exists "custom_subjects_all" on public.custom_subjects;
create policy "custom_subjects_all" on public.custom_subjects for all to authenticated
  using (email = public.current_email() or public.current_role() = 'super_admin')
  with check (email = public.current_email() or public.current_role() = 'super_admin');

-- ---- CLASSROOM_REQUESTS ----

drop policy if exists "requests_select" on public.classroom_requests;
create policy "requests_select" on public.classroom_requests for select to authenticated
  using (
    student_id = public.current_email()
    or public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "requests_insert" on public.classroom_requests;
create policy "requests_insert" on public.classroom_requests for insert to authenticated
  with check (student_id = public.current_email() or public.current_role() = 'super_admin');

drop policy if exists "requests_update" on public.classroom_requests;
create policy "requests_update" on public.classroom_requests for update to authenticated
  using (
    public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  )
  with check (
    public.current_role() = 'super_admin'
    or (public.current_role() = 'teacher' and school_id = public.current_school())
  );

drop policy if exists "requests_delete" on public.classroom_requests;
create policy "requests_delete" on public.classroom_requests for delete to authenticated
  using (public.current_role() = 'super_admin');

-- ---- USER_ROLES ----

drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select" on public.user_roles for select to authenticated
  using (
    email = public.current_email()
    or public.current_role() = 'super_admin'
  );

drop policy if exists "user_roles_insert" on public.user_roles;
create policy "user_roles_insert" on public.user_roles for insert to authenticated
  with check (public.current_role() = 'super_admin');

drop policy if exists "user_roles_update" on public.user_roles;
create policy "user_roles_update" on public.user_roles for update to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

drop policy if exists "user_roles_delete" on public.user_roles;
create policy "user_roles_delete" on public.user_roles for delete to authenticated
  using (public.current_role() = 'super_admin');

-- ---------- REALTIME (opcional, para sync entre dispositivos) ----------

-- Idempotente: solo agrega la tabla a la publicación si aún no está.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_sessions'
  ) then
    alter publication supabase_realtime add table public.study_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'uploaded_files'
  ) then
    alter publication supabase_realtime add table public.uploaded_files;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classroom_requests'
  ) then
    alter publication supabase_realtime add table public.classroom_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_roles'
  ) then
    alter publication supabase_realtime add table public.user_roles;
  end if;
end $$;

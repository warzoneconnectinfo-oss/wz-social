-- ============================================================
-- WZ SOCIAL — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Enable UUID helpers
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- PROFILES  (one row per auth user)
-- ────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  bio           text,
  platform      text check (platform in ('PC','PlayStation','Xbox','Cross-Play')),
  rank          text check (rank in ('Bronze','Silver','Gold','Platinum','Diamond','Crimson','Iridescent','Top 250')),
  timezone      text,
  loadout       jsonb default '{"primary":"","secondary":"","equipment":"","perk1":"","perk2":""}',
  kd_ratio      numeric(5,2) default 0,
  wins          integer default 0,
  clan_id       uuid,                     -- FK added after clans table
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- CLANS
-- ────────────────────────────────────────────────────────────
create table public.clans (
  id            uuid primary key default uuid_generate_v4(),
  name          text unique not null,
  tag           text unique not null check (char_length(tag) between 2 and 5),
  description   text,
  logo_url      text,
  owner_id      uuid references public.profiles(id) on delete set null,
  is_recruiting boolean default true,
  created_at    timestamptz default now()
);

-- Add the FK now that clans exists
alter table public.profiles
  add constraint profiles_clan_id_fkey
  foreign key (clan_id) references public.clans(id) on delete set null;

-- ────────────────────────────────────────────────────────────
-- FRIENDSHIPS
-- ────────────────────────────────────────────────────────────
create table public.friendships (
  id           uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text default 'pending' check (status in ('pending','accepted','blocked')),
  created_at   timestamptz default now(),
  unique (requester_id, addressee_id)
);

-- ────────────────────────────────────────────────────────────
-- CLAN MEMBERS
-- ────────────────────────────────────────────────────────────
create table public.clan_members (
  id         uuid primary key default uuid_generate_v4(),
  clan_id    uuid not null references public.clans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text default 'member' check (role in ('owner','officer','member')),
  joined_at  timestamptz default now(),
  unique (clan_id, profile_id)
);

-- ────────────────────────────────────────────────────────────
-- ROOMS  (public group chats)
-- ────────────────────────────────────────────────────────────
create table public.rooms (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  creator_id  uuid references public.profiles(id) on delete set null,
  is_public   boolean default true,
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- ROOM MEMBERS
-- ────────────────────────────────────────────────────────────
create table public.room_members (
  id         uuid primary key default uuid_generate_v4(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz default now(),
  unique (room_id, profile_id)
);

-- ────────────────────────────────────────────────────────────
-- MESSAGES  (DMs and room messages)
-- receiver_id set  → DM
-- room_id set      → room message
-- ────────────────────────────────────────────────────────────
create table public.messages (
  id          uuid primary key default uuid_generate_v4(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete set null,
  room_id     uuid references public.rooms(id) on delete cascade,
  content     text not null check (char_length(content) <= 1000),
  is_read     boolean default false,
  created_at  timestamptz default now(),
  constraint message_target check (
    (receiver_id is not null and room_id is null) or
    (receiver_id is null     and room_id is not null)
  )
);

-- ────────────────────────────────────────────────────────────
-- POSTS  (community feed)
-- ────────────────────────────────────────────────────────────
create table public.posts (
  id          uuid primary key default uuid_generate_v4(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) <= 500),
  image_url   text,
  likes_count integer default 0,
  is_pinned   boolean default false,
  is_removed  boolean default false,
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- POST LIKES  (junction)
-- ────────────────────────────────────────────────────────────
create table public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, profile_id)
);

-- ────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
create table public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('friend_request','friend_accepted','message','post_like','clan_invite','system')),
  from_id      uuid references public.profiles(id) on delete cascade,
  reference_id uuid,
  message      text not null,
  is_read      boolean default false,
  created_at   timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- REPORTS  (moderation)
-- ────────────────────────────────────────────────────────────
create table public.reports (
  id                  uuid primary key default uuid_generate_v4(),
  reporter_id         uuid not null references public.profiles(id) on delete cascade,
  reported_profile_id uuid references public.profiles(id) on delete set null,
  post_id             uuid references public.posts(id) on delete set null,
  message_id          uuid references public.messages(id) on delete set null,
  reason              text not null,
  details             text,
  status              text default 'pending' check (status in ('pending','reviewed','resolved','dismissed')),
  created_at          timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.friendships   enable row level security;
alter table public.clans         enable row level security;
alter table public.clan_members  enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.messages      enable row level security;
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.notifications enable row level security;
alter table public.reports       enable row level security;

-- PROFILES
create policy "profiles_read_all"   on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- FRIENDSHIPS
create policy "friendships_read"   on public.friendships for select using (auth.uid() in (requester_id, addressee_id));
create policy "friendships_insert" on public.friendships for insert with check (auth.uid() = requester_id);
create policy "friendships_update" on public.friendships for update using (auth.uid() in (requester_id, addressee_id));
create policy "friendships_delete" on public.friendships for delete using (auth.uid() in (requester_id, addressee_id));

-- CLANS
create policy "clans_read_all"     on public.clans for select using (true);
create policy "clans_insert_auth"  on public.clans for insert with check (auth.uid() is not null);
create policy "clans_update_owner" on public.clans for update using (auth.uid() = owner_id);
create policy "clans_delete_owner" on public.clans for delete using (auth.uid() = owner_id);

-- CLAN MEMBERS
create policy "clan_members_read_all"    on public.clan_members for select using (true);
create policy "clan_members_insert_self" on public.clan_members for insert with check (auth.uid() = profile_id);
-- Delete: self OR clan owner
create policy "clan_members_delete" on public.clan_members for delete using (
  auth.uid() = profile_id
  or exists (
    select 1 from public.clan_members o
    where o.clan_id = clan_members.clan_id and o.profile_id = auth.uid() and o.role = 'owner'
  )
);
-- Update: clan owner only (for role changes / transfer leadership)
create policy "clan_members_update_owner" on public.clan_members for update using (
  exists (
    select 1 from public.clan_members o
    where o.clan_id = clan_members.clan_id and o.profile_id = auth.uid() and o.role = 'owner'
  )
);

-- ROOMS
create policy "rooms_read_auth"    on public.rooms for select using (auth.uid() is not null);
create policy "rooms_insert_auth"  on public.rooms for insert with check (auth.uid() is not null);
create policy "rooms_update_creator" on public.rooms for update using (auth.uid() = creator_id);

-- ROOM MEMBERS
create policy "room_members_read_auth"   on public.room_members for select using (auth.uid() is not null);
create policy "room_members_insert_self" on public.room_members for insert with check (auth.uid() = profile_id);
create policy "room_members_delete_self" on public.room_members for delete using (auth.uid() = profile_id);

-- MESSAGES
create policy "messages_read" on public.messages for select using (
  auth.uid() = sender_id
  or auth.uid() = receiver_id
  or (room_id is not null and exists (
    select 1 from public.room_members rm
    where rm.room_id = messages.room_id and rm.profile_id = auth.uid()
  ))
);
create policy "messages_insert" on public.messages for insert with check (auth.uid() = sender_id);

-- POSTS
create policy "posts_read_auth"    on public.posts for select using (auth.uid() is not null and is_removed = false);
create policy "posts_insert_auth"  on public.posts for insert with check (auth.uid() = author_id);
create policy "posts_update_author" on public.posts for update using (auth.uid() = author_id);
create policy "posts_delete_author" on public.posts for delete using (auth.uid() = author_id);

-- POST LIKES
create policy "post_likes_read_auth"   on public.post_likes for select using (auth.uid() is not null);
create policy "post_likes_insert_self" on public.post_likes for insert with check (auth.uid() = profile_id);
create policy "post_likes_delete_self" on public.post_likes for delete using (auth.uid() = profile_id);

-- NOTIFICATIONS
create policy "notifs_read_own"   on public.notifications for select using (auth.uid() = user_id);
create policy "notifs_insert_any" on public.notifications for insert with check (auth.uid() is not null);
create policy "notifs_update_own" on public.notifications for update using (auth.uid() = user_id);

-- REPORTS
create policy "reports_insert_auth" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "reports_read_own"    on public.reports for select using (auth.uid() = reporter_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email,'@',1) || '_' || substr(new.id::text,1,4)
    ),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email,'@',1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-clear profiles.clan_id when a member is removed from clan_members
create or replace function public.on_clan_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set clan_id = null where id = old.profile_id;
  return old;
end;
$$;

create trigger clan_member_removed
  after delete on public.clan_members
  for each row execute procedure public.on_clan_member_removed();

-- Auto-update updated_at on profile changes
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Keep likes_count in sync automatically
create or replace function public.sync_likes_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_likes_sync
  after insert or delete on public.post_likes
  for each row execute procedure public.sync_likes_count();

-- =============================================
-- GaziÇArk — Supabase SQL Schema
-- Supabase Dashboard > SQL Editor'a yapıştır
-- =============================================

-- 1. Profiller
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null default 'Kullanıcı',
  subject text not null default 'Genel',
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Konuşmalar
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user1 uuid references profiles on delete cascade not null,
  user2 uuid references profiles on delete cascade not null,
  created_at timestamptz default now(),
  unique(user1, user2)
);

-- 3. Mesajlar
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade not null,
  sender_id uuid references profiles on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

-- Profiller: herkes okuyabilir, kendisi güncelleyebilir
create policy "Profilleri herkes okuyabilir"
  on profiles for select using (true);

create policy "Kendi profilini güncelleyebilir"
  on profiles for update using (auth.uid() = id);

create policy "Kendi profilini ekleyebilir"
  on profiles for insert with check (auth.uid() = id);

-- Konuşmalar: sadece dahil olduğun konuşmaları görebilirsin
create policy "Kendi konuşmalarını okuyabilir"
  on conversations for select
  using (auth.uid() = user1 or auth.uid() = user2);

create policy "Konuşma başlatabilir"
  on conversations for insert
  with check (auth.uid() = user1 or auth.uid() = user2);

-- Mesajlar: dahil olduğun konuşmaların mesajlarını görebilirsin
create policy "Konuşma mesajlarını okuyabilir"
  on messages for select
  using (
    exists (
      select 1 from conversations
      where id = messages.conversation_id
      and (user1 = auth.uid() or user2 = auth.uid())
    )
  );

create policy "Konuşmaya mesaj gönderebilir"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from conversations
      where id = messages.conversation_id
      and (user1 = auth.uid() or user2 = auth.uid())
    )
  );

-- =============================================
-- Realtime için tabloları etkinleştir
-- =============================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- =============================================
-- 4. Birlikte Çalışma Teklifleri
-- =============================================

create table if not exists study_proposals (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles on delete cascade not null,
  receiver_id uuid references profiles on delete cascade not null,
  subject text not null,
  date date not null,
  hours int[] not null,
  message text,
  status text not null default 'pending', -- 'pending', 'accepted', 'rejected'
  created_at timestamptz default now()
);

alter table study_proposals enable row level security;

create policy "Kullanıcı teklifleri görebilir"
  on study_proposals for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Kullanıcı teklif gönderebilir"
  on study_proposals for insert
  with check (auth.uid() = sender_id);

create policy "Kullanıcı aldığı teklifi güncelleyebilir"
  on study_proposals for update
  using (auth.uid() = receiver_id);

alter publication supabase_realtime add table study_proposals;

# Study Buddy 📚

Arkadaşlarınla gerçek zamanlı mesajlaşma platformu.

## Kurulum (30 dakika)

### 1. Supabase Projesi Oluştur
1. [supabase.com](https://supabase.com) → New Project
2. Dashboard > **SQL Editor** → `supabase_schema.sql` dosyasını yapıştır → Run
3. Dashboard > **Authentication > Providers > Email** → "Confirm email" kapat (magic link için)
4. Dashboard > **Project Settings > API** → URL ve anon key'i kopyala

### 2. Projeyi Kur
```bash
npm install
cp .env.local.example .env.local
# .env.local dosyasını aç, kopyaladığın değerleri yapıştır
npm run dev
```

### 3. Vercel'e Deploy Et
```bash
npx vercel
# Environment variables ekle:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Özellikler
- ✅ Magic link ile şifresiz giriş
- ✅ Gerçek zamanlı mesajlaşma (Supabase Realtime)
- ✅ Online/offline durumu (Presence)
- ✅ Profil düzenleme (isim, ders konusu)
- ✅ Dark mode desteği
- ✅ Row Level Security (güvenli veri erişimi)

## Stack
- **Frontend:** Next.js 14 (App Router)
- **Backend/DB:** Supabase (PostgreSQL + Realtime + Auth)
- **Deploy:** Vercel

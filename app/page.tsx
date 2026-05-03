import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Mevcut kullanıcının profili
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Tüm diğer kullanıcılar
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', user.id)
    .order('name')

  // Konuşmalar (son mesajlarıyla)
  const { data: conversations } = await supabase
    .from('conversations')
    .select(`*, messages(id, content, created_at, sender_id)`)
    .or(`user1.eq.${user.id},user2.eq.${user.id}`)
    .order('created_at', { ascending: false })

  // Kullanıcının seçtiği dersler
  const { data: mySubjects } = await supabase
    .from('user_subjects')
    .select('subject')
    .eq('user_id', user.id)

  // Kullanıcının müsaitlik programı
  const { data: myAvailability } = await supabase
    .from('availability')
    .select('day, hour')
    .eq('user_id', user.id)

  return (
    <Dashboard
      currentUser={profile}
      allUsers={allUsers ?? []}
      initialConversations={conversations ?? []}
      initialSubjects={(mySubjects ?? []).map((s: any) => s.subject)}
      initialAvailability={myAvailability ?? []}
    />
  )
}

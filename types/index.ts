export type Profile = {
  id: string
  name: string
  subject: string
  year: number
  bio: string
  avatar_url?: string
  created_at: string
}

export type Conversation = {
  id: string
  user1: string
  user2: string
  created_at: string
  other_user?: Profile
  last_message?: Message
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: Profile
}

export type Availability = {
  id: string
  user_id: string
  day: number
  hour: number
}

export type UserSubject = {
  id: string
  user_id: string
  subject: string
}

export type FriendRequest = {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export type MatchedUser = Profile & {
  matchScore: number
  commonSubjects: string[]
  commonSlots: number
  requestStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted'
}

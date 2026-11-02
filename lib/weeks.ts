export const WEEKS_AHEAD = 8
const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

export function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Verilen tarihin haftasının pazartesisi (YYYY-MM-DD)
export function mondayOf(d: Date | string) {
  const x = typeof d === 'string' ? parseDate(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return fmtDate(x)
}

export function addWeeks(week: string, n: number) {
  const x = parseDate(week)
  x.setDate(x.getDate() + n * 7)
  return fmtDate(x)
}

export function weekLabel(week: string) {
  const a = parseDate(week)
  const b = parseDate(addWeeks(week, 1))
  b.setDate(b.getDate() - 1)
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
}

// Bu haftadan başlayarak WEEKS_AHEAD hafta
export function upcomingWeeks() {
  const first = mondayOf(new Date())
  return Array.from({ length: WEEKS_AHEAD }, (_, i) => addWeeks(first, i))
}

// "hafta|gün-saat" anahtarları üretir
export function slotKeys(rows: any[], userId: string, weeks: string[]) {
  const set = new Set<string>()
  const allowed = new Set(weeks)
  rows.forEach(a => {
    if (a.user_id === userId && allowed.has(a.week_start)) set.add(`${a.week_start}|${a.day}-${a.hour}`)
  })
  return set
}

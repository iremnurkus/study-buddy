import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GaziÇArk',
  description: 'Arkadaşlarınla birlikte çalış',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  )
}

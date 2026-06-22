import type { ReactNode } from 'react'
import type { Metadata } from 'next'

import '@/app/globals.css'

export const metadata: Metadata = {
  title: 'DepScan — AI Dependency Analyzer',
  description:
    'Analyze your package.json dependencies: breaking changes, security risks, and upgrade ROI.',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full min-h-screen bg-zinc-950 text-zinc-50 antialiased">{children}</body>
    </html>
  )
}

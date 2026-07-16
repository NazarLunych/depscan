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

const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('depscan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="bg-bg text-fg h-full min-h-screen antialiased">{children}</body>
    </html>
  )
}

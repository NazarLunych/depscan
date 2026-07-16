import { Suspense } from 'react'

import { HomePageContent } from '@/components/HomePageContent'

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  )
}

import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link href="/" className="text-sm underline">
        Go home
      </Link>
    </div>
  )
}

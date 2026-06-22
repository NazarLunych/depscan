export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">DepScan</h1>
        <p className="mt-3 text-lg text-zinc-400">AI-powered dependency analyzer</p>
      </div>

      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-400">
        <p className="text-center text-sm">
          {/* FileUpload component — Week 5 */}
          Drop your package.json here (coming soon)
        </p>
      </div>
    </main>
  )
}

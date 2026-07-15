const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 10
// In-memory only — resets on cold start / redeploy. Good enough to stop a
// single visitor from burning through the paid Claude/Exa keys on a public
// demo; not a substitute for a real distributed limiter under real traffic.
const requestLog = new Map<string, number[]>()

export function isRateLimited(clientId: string, now: number = Date.now()): boolean {
  const timestamps = requestLog.get(clientId) ?? []

  const recent = timestamps.filter((ts) => now - ts < WINDOW_MS)

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(clientId, recent)

    return true
  }

  recent.push(now)
  requestLog.set(clientId, recent)

  return false
}

// Best-effort client identifier behind Vercel's proxy — 'x-forwarded-for' can
// carry a comma-separated chain, the first entry is the original client.
export function getClientId(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown'
  }

  return request.headers.get('x-real-ip') ?? 'unknown'
}

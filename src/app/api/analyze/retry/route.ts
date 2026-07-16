import { analyzePackage } from '@/lib/analyzer'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'
import { getClientId, isRateLimited } from '@/lib/rateLimiter'
import { RetryRequestSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(getClientId(request))) {
    return Response.json(
      { error: 'Too many analysis requests. Please try again later.' },
      { status: 429 },
    )
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Request body is not valid JSON.' }, { status: 400 })
  }

  const parsed = RetryRequestSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 })
  }

  const { name, versionRange } = parsed.data
  const advisories = await fetchBulkAdvisories({ [name]: versionRange }, request.signal)
  // Retrying reuses analyzePackage's own 60-minute Claude-verdict cache as-is —
  // a retry means "run the pipeline again," not "force a fresh Claude call";
  // if nothing about the facts changed since the last call, the cached
  // verdict is still the correct answer.
  const result = await analyzePackage(name, versionRange, advisories, request.signal)

  return Response.json(result)
}

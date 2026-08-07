import { analyzePackage } from '@/lib/analyzer'
import { fetchBulkAdvisories } from '@/lib/npmRegistry'
import { guardRequest } from '@/lib/requestGuard'
import { RetryRequestSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRequest(request, RetryRequestSchema)

  if (guard instanceof Response) {
    return guard
  }

  const { name, versionRange } = guard.data
  const advisories = await fetchBulkAdvisories({ [name]: versionRange }, request.signal)
  // Retrying reuses analyzePackage's own 60-minute Claude-verdict cache as-is —
  // a retry means "run the pipeline again," not "force a fresh Claude call";
  // if nothing about the facts changed since the last call, the cached
  // verdict is still the correct answer.
  const result = await analyzePackage(name, versionRange, advisories, request.signal)

  return Response.json(result)
}

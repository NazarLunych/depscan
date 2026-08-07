import type { z } from 'zod'

import { getClientId, isRateLimited } from '@/lib/rateLimiter'

// Shared entry guard for POST routes: rate-limits, then parses and validates
// the JSON body against the caller's schema. Returns an early-return Response
// on any failure, or the validated data — callers branch on `instanceof
// Response` to tell the two apart.
export async function guardRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<Response | { data: z.infer<Schema> }> {
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

  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 })
  }

  return { data: parsed.data }
}

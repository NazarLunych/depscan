import type { PackageJsonInput } from '@/types'

import { PackageJsonInputSchema } from '@/lib/schemas'

type ParseResult = { data: PackageJsonInput; error?: never } | { data?: never; error: string }

export function parsePackageJson(text: string): ParseResult {
  let json: unknown

  try {
    json = JSON.parse(text)
  } catch {
    return { error: 'This is not valid JSON.' }
  }

  const result = PackageJsonInputSchema.safeParse(json)

  if (!result.success) {
    return { error: 'This does not look like a package.json (missing/invalid dependency fields).' }
  }

  return { data: result.data }
}

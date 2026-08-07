import Exa, { ExaError } from 'exa-js'

import { awaitWithSignal, sleep } from '@/lib/httpClient'

const RETRY_DELAY_MS = 1_000

function isRateLimitError(err: unknown): boolean {
  return err instanceof ExaError && err.statusCode === 429
}

export async function searchChangelog(
  packageName: string,
  version: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!process.env.EXA_API_KEY) return null

  const exa = new Exa(process.env.EXA_API_KEY)
  const query = `${packageName} v${version} migration changelog`
  const searchOptions = { numResults: 3, contents: { text: { maxCharacters: 8_000 } } }

  try {
    let response

    try {
      response = await awaitWithSignal(exa.search(query, searchOptions), signal)
    } catch (err) {
      if (!isRateLimitError(err)) throw err

      await sleep(RETRY_DELAY_MS, signal)
      response = await awaitWithSignal(exa.search(query, searchOptions), signal)
    }

    const texts = response.results
      .map((r) => r.text)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)

    if (texts.length === 0) return null

    return texts.join('\n\n---\n\n')
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }

    return null
  }
}

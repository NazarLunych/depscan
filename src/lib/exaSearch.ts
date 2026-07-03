import Exa from 'exa-js'

export async function searchChangelog(
  packageName: string,
  version: string,
): Promise<string | null> {
  if (!process.env.EXA_API_KEY) return null

  try {
    const exa = new Exa(process.env.EXA_API_KEY)
    const query = `${packageName} v${version} migration changelog`
    const response = await exa.search(query, {
      numResults: 3,
      contents: {
        text: { maxCharacters: 8_000 },
      },
    })
    const texts = response.results
      .map((r) => r.text)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)

    if (texts.length === 0) return null

    return texts.join('\n\n---\n\n')
  } catch {
    return null
  }
}

// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { parsePackageJson } from '@/components/FileUpload/parsePackageJson'

describe('parsePackageJson', () => {
  it('parses a valid package.json with dependencies', () => {
    const result = parsePackageJson(
      JSON.stringify({ dependencies: { react: '^18.2.0' }, devDependencies: { vitest: '^3.0.0' } }),
    )

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({
      dependencies: { react: '^18.2.0' },
      devDependencies: { vitest: '^3.0.0' },
    })
  })

  it('accepts an object with no dependency fields at all', () => {
    const result = parsePackageJson(JSON.stringify({ name: 'my-app' }))

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({})
  })

  it('returns an error for invalid JSON text', () => {
    const result = parsePackageJson('{ not json')

    expect(result.data).toBeUndefined()
    expect(result.error).toBe('This is not valid JSON.')
  })

  it('returns an error when dependencies is not a string map', () => {
    const result = parsePackageJson(JSON.stringify({ dependencies: { react: 18 } }))

    expect(result.data).toBeUndefined()
    expect(result.error).toMatch(/package\.json/)
  })
})

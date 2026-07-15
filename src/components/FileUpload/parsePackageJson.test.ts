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

  it('rejects an object with no dependency fields at all', () => {
    const result = parsePackageJson(JSON.stringify({ name: 'my-app' }))

    expect(result.data).toBeUndefined()
    expect(result.error).toBe('No dependencies found in this package.json — nothing to analyze.')
  })

  it('rejects explicit empty dependency maps', () => {
    const result = parsePackageJson(JSON.stringify({ dependencies: {}, devDependencies: {} }))

    expect(result.data).toBeUndefined()
    expect(result.error).toBe('No dependencies found in this package.json — nothing to analyze.')
  })

  it('accepts dependencies alone, with no devDependencies key', () => {
    const result = parsePackageJson(JSON.stringify({ dependencies: { react: '^18.2.0' } }))

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({ dependencies: { react: '^18.2.0' } })
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

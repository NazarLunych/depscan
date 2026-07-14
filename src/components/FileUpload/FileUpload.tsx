'use client'

import React, { memo, useCallback, useState } from 'react'

import type { PackageJsonInput } from '@/types'

import { parsePackageJson } from '@/components/FileUpload/parsePackageJson'

interface FileUploadProps {
  onSubmit: (packageJson: PackageJsonInput, includeDevDependencies: boolean) => void
  disabled: boolean
}

export const FileUpload = memo(function FileUpload({ onSubmit, disabled }: FileUploadProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [includeDevDependencies, setIncludeDevDependencies] = useState(false)

  const submitText = useCallback(
    (value: string) => {
      const result = parsePackageJson(value)

      if (!result.data) {
        setError(result.error)

        return
      }

      setError(null)
      onSubmit(result.data, includeDevDependencies)
    },
    [includeDevDependencies, onSubmit],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)

      const file = event.dataTransfer.files[0]

      if (!file) {
        return
      }

      void file.text().then((value) => {
        setText(value)
        submitText(value)
      })
    },
    [submitText],
  )

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file) {
        return
      }

      void file.text().then((value) => {
        setText(value)
        submitText(value)
      })
    },
    [submitText],
  )

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver ? 'border-zinc-400 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50'
        }`}
      >
        <p className="text-sm text-zinc-400">Drag & drop your package.json here, or</p>
        <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-zinc-100 underline">
          browse a file{' '}
          <input
            type="file"
            accept="application/json"
            className="hidden"
            disabled={disabled}
            onChange={handleFileInput}
          />
        </label>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="…or paste your package.json contents here"
        disabled={disabled}
        rows={6}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-500"
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={includeDevDependencies}
            onChange={(event) => setIncludeDevDependencies(event.target.checked)}
            disabled={disabled}
          />{' '}
          Include devDependencies
        </label>

        <button
          type="button"
          disabled={disabled || text.trim().length === 0}
          onClick={() => submitText(text)}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
        >
          Analyze
        </button>
      </div>

      {error && <p className="text-sm break-words text-red-400">{error}</p>}
    </div>
  )
})

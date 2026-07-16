'use client'

import React, { memo, useCallback, useRef, useState } from 'react'

import type { PackageJsonInput } from '@/types'

import { parsePackageJson } from '@/components/FileUpload/parsePackageJson'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'

interface FileUploadProps {
  onSubmit: (packageJson: PackageJsonInput, includeDevDependencies: boolean) => void
  disabled: boolean
}

// A package.json big enough to exceed this is not a package.json — reading it
// into the textarea would only lock up the tab.
const MAX_FILE_BYTES = 1024 * 1024

export const FileUpload = memo(function FileUpload({ onSubmit, disabled }: FileUploadProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [includeDevDependencies, setIncludeDevDependencies] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFile = useCallback((file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is too large to be a package.json.')

      return
    }

    file
      .text()
      .then((value) => {
        setError(null)
        setText(value)
      })
      .catch(() => {
        setError('Could not read that file.')
      })
  }, [])

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

      if (file) {
        readFile(file)
      }
    },
    [readFile],
  )

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (file) {
        readFile(file)
      }
    },
    [readFile],
  )

  // The drop zone doubles as the keyboard path to the hidden file input, so
  // Enter/Space have to open the picker the way a real button would.
  const handleDropZoneKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload a package.json file: drag and drop it here, or activate to browse"
        aria-disabled={disabled}
        onKeyDown={handleDropZoneKeyDown}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`focus-visible:ring-fg rounded-xl border-2 border-dashed p-8 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none ${
          isDragOver ? 'border-muted bg-surface' : 'border-border bg-surface/50'
        }`}
      >
        <p className="text-muted text-sm">Drag & drop your package.json here, or</p>
        <label className="text-fg mt-2 inline-block cursor-pointer text-sm font-medium underline">
          browse a file{' '}
          <input
            ref={fileInputRef}
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
        aria-label="Paste your package.json contents"
        disabled={disabled}
        rows={6}
        className="border-border bg-surface text-fg placeholder:text-muted w-full rounded-lg border p-3 font-mono text-sm"
      />

      <div className="flex items-center justify-between">
        <Checkbox
          checked={includeDevDependencies}
          onChange={setIncludeDevDependencies}
          disabled={disabled}
          label="Include devDependencies"
        />

        <Button disabled={disabled || text.trim().length === 0} onClick={() => submitText(text)}>
          Analyze
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm break-words text-red-400">
          {error}
        </p>
      )}
    </div>
  )
})

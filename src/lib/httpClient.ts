// Shared retry-delay primitive: resolves after `ms`, or rejects immediately
// once `signal` fires so a cancelled request doesn't sleep through a retry
// delay it will never get to use.
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'))

      return
    }

    const timer = setTimeout(resolve, ms)

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      },
      { once: true },
    )
  })
}

// Combines the caller's cancellation signal (if any) with a fixed timeout so
// every external fetch is bounded even when nobody passes a signal in.
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

// Awaits a promise while also racing the caller's own cancellation signal —
// used when the underlying operation (a shared cache entry, an SDK call with
// no AbortSignal support) can't be cancelled directly, so a cancelled caller
// still stops waiting immediately instead of blocking on it.
export function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

const RETRY_DELAY_MS = 500

// Retries a fetch once, but only when the response itself reports a 429 —
// network errors, timeouts, and non-429 error statuses are returned/thrown
// as-is so callers keep their existing error handling. A cancellation signal
// short-circuits the retry delay instead of sleeping through it.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(url, init)

  if (res.status !== 429) {
    return res
  }

  if (signal?.aborted) {
    return res
  }

  try {
    await sleep(RETRY_DELAY_MS, signal)
  } catch {
    return res
  }

  return fetch(url, init)
}

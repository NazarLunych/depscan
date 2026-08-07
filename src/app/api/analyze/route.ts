import type { AnalyzerResult, SseEventType } from '@/types'

import { countDependencies, processBatch } from '@/lib/batchProcessor'
import { guardRequest } from '@/lib/requestGuard'
import {
  AnalyzeRequestSchema,
  SseDonePayloadSchema,
  SseErrorPayloadSchema,
  SsePackageDonePayloadSchema,
  SseStartedPayloadSchema,
} from '@/lib/schemas'

export const runtime = 'nodejs'

const HEARTBEAT_MS = 15_000
const textEncoder = new TextEncoder()

function encodeEvent(type: SseEventType, data: unknown): Uint8Array {
  return textEncoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
}

function encodeHeartbeat(): Uint8Array {
  return textEncoder.encode(': heartbeat\n\n')
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRequest(request, AnalyzeRequestSchema)

  if (guard instanceof Response) {
    return guard
  }

  const { packageJson, includeDevDependencies } = guard.data
  const total = countDependencies(packageJson, includeDevDependencies)
  let closed = false
  let heartbeatId: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(type: SseEventType, data: unknown): void {
        if (closed) {
          return
        }

        controller.enqueue(encodeEvent(type, data))
      }

      function stop(): void {
        if (closed) {
          return
        }

        closed = true

        if (heartbeatId !== undefined) {
          clearInterval(heartbeatId)
        }

        controller.close()
      }

      request.signal.addEventListener('abort', stop)

      heartbeatId = setInterval(() => {
        if (closed) {
          return
        }

        controller.enqueue(encodeHeartbeat())
      }, HEARTBEAT_MS)

      send('started', SseStartedPayloadSchema.parse({ total }))

      let failed = 0

      const onResult = (result: AnalyzerResult): void => {
        if (result.status === 'done') {
          send(
            'package-done',
            SsePackageDonePayloadSchema.parse({ name: result.name, analysis: result.analysis }),
          )
        } else {
          failed++
          send('error', SseErrorPayloadSchema.parse({ name: result.name, message: result.error }))
        }
      }

      processBatch(packageJson, includeDevDependencies, onResult, request.signal)
        .then(() => {
          send('done', SseDonePayloadSchema.parse({ total, failed }))
          stop()
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)

          send('error', SseErrorPayloadSchema.parse({ message }))
          stop()
        })
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
    },
  })
}

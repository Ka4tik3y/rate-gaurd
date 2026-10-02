// Minimal typed fetch wrapper used by the real (non-mock) API adapters.
// Centralises base URL, JSON handling and error shaping so components never call fetch directly.

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface HttpOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

export async function http<T>(baseUrl: string, path: string, opts: HttpOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, { method: opts.method ?? 'GET', headers, body, signal: opts.signal })
  } catch (e) {
    throw new ApiError(`network error: ${(e as Error).message}`, 0)
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : res.statusText
    throw new ApiError(detail, res.status)
  }
  return data as T
}

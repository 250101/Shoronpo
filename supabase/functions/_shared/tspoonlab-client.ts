const DEFAULT_BASE_URL = 'https://app.tspoonlab.com/recipes/api'
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

export type ConnectorCode =
  | 'AUTH_EXPIRED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'HTTP_ERROR'

export class TspoonlabError extends Error {
  readonly code: ConnectorCode
  readonly status?: number
  readonly retryable: boolean

  constructor(
    message: string,
    code: ConnectorCode,
    status?: number,
    retryable = false,
  ) {
    super(message)
    this.name = 'TspoonlabError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export class TspoonlabClient {
  #rememberme: string
  readonly options: {
    baseUrl?: string
    timezone?: string
    timeoutMs?: number
    maxRetries?: number
    baseDelayMs?: number
    fetchImpl?: typeof fetch
  }

  constructor(
    rememberme: string,
    options: {
      baseUrl?: string
      timezone?: string
      timeoutMs?: number
      maxRetries?: number
      baseDelayMs?: number
      fetchImpl?: typeof fetch
    } = {},
  ) {
    if (!rememberme) throw new Error('TSPOONLAB_REMEMBERME no esta configurado')
    this.#rememberme = rememberme
    this.options = options
  }

  async get(path: string, query: Record<string, unknown> = {}) {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    const url = new URL(`${baseUrl}/${path.replace(/^\//, '')}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }

    const fetchImpl = this.options.fetchImpl ?? fetch
    const maxRetries = this.options.maxRetries ?? 2
    const baseDelayMs = this.options.baseDelayMs ?? 500

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: {
            rememberme: this.#rememberme,
            accept: 'application/json',
            language: 'es',
            timezone: this.options.timezone ?? 'Europe/Madrid',
            source: 'tspoonback-web',
          },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        })
      } catch {
        if (attempt < maxRetries) {
          await sleep(baseDelayMs * (2 ** attempt))
          continue
        }
        throw new TspoonlabError('No se pudo conectar con tSpoonLab', 'NETWORK_ERROR', undefined, true)
      }

      const text = await response.text()
      if (response.ok) {
        try {
          return text ? JSON.parse(text) : null
        } catch {
          throw new TspoonlabError('Respuesta JSON invalida', 'INVALID_RESPONSE', response.status)
        }
      }

      const retryable = RETRYABLE_STATUS.has(response.status)
      if (retryable && attempt < maxRetries) {
        await sleep(baseDelayMs * (2 ** attempt))
        continue
      }

      if (response.status === 401) throw new TspoonlabError('Sesion vencida', 'AUTH_EXPIRED', 401)
      if (response.status === 403) throw new TspoonlabError('Permiso rechazado', 'FORBIDDEN', 403)
      if (response.status === 429) throw new TspoonlabError('Limite temporal', 'RATE_LIMITED', 429, true)
      if (response.status >= 500) throw new TspoonlabError('Servicio no disponible', 'UPSTREAM_ERROR', response.status, true)
      throw new TspoonlabError(`HTTP ${response.status}`, 'HTTP_ERROR', response.status)
    }
  }

  async healthCheck() {
    const products = await this.get('listIngredientsPaged', { rows: 1, start: 0, filter: '' })
    if (!Array.isArray(products)) {
      throw new TspoonlabError('Formato de productos inesperado', 'INVALID_RESPONSE')
    }
    return true
  }

  toJSON() {
    return { timezone: this.options.timezone ?? 'Europe/Madrid' }
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { TspoonlabClient, TspoonlabError } from './tspoonlab-client.ts'

const response = (status: number, body: unknown) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body),
  { status },
)

test('health check usa GET, Europe/Madrid y no serializa el token', async () => {
  let method = ''
  let timezone = ''
  const client = new TspoonlabClient('token-de-prueba', {
    fetchImpl: async (_url, options) => {
      method = options?.method ?? ''
      timezone = new Headers(options?.headers).get('timezone') ?? ''
      return response(200, [{ id: 1 }])
    },
  })
  assert.equal(await client.healthCheck(), true)
  assert.equal(method, 'GET')
  assert.equal(timezone, 'Europe/Madrid')
  assert.doesNotMatch(JSON.stringify(client), /token-de-prueba/)
})

for (const [status, code] of [[401, 'AUTH_EXPIRED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [503, 'UPSTREAM_ERROR']] as const) {
  test(`clasifica ${status} como ${code}`, async () => {
    const client = new TspoonlabClient('x', {
      maxRetries: 0,
      fetchImpl: async () => response(status, 'error'),
    })
    await assert.rejects(client.healthCheck(), error => error instanceof TspoonlabError && error.code === code)
  })
}

test('reintenta transitorios y se recupera', async () => {
  let calls = 0
  const client = new TspoonlabClient('x', {
    maxRetries: 2,
    baseDelayMs: 1,
    fetchImpl: async () => (++calls < 3 ? response(503, 'error') : response(200, [])),
  })
  assert.equal(await client.healthCheck(), true)
  assert.equal(calls, 3)
})

test('rechaza JSON invalido y forma inesperada', async () => {
  const invalidJson = new TspoonlabClient('x', { fetchImpl: async () => response(200, '<html>') })
  await assert.rejects(invalidJson.healthCheck(), (error: TspoonlabError) => error.code === 'INVALID_RESPONSE')

  const invalidShape = new TspoonlabClient('x', { fetchImpl: async () => response(200, {}) })
  await assert.rejects(invalidShape.healthCheck(), (error: TspoonlabError) => error.code === 'INVALID_RESPONSE')
})

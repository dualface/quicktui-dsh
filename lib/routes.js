// HTTP routes the setup page calls. dsh serves them only to its owner peer.
import { SetupError } from './setup.js'

export const ROUTE_PREFIX = '/api/quicktui-dsh'
const MAX_BODY_BYTES = 4096

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const readBody = async (request) => {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new SetupError('bad-request', 'request body too large')
  if (text === '') return {}
  try { return JSON.parse(text) } catch { throw new SetupError('bad-request', 'request body is not JSON') }
}

const handle = (action) => async (request) => {
  try {
    return json(await action(request))
  } catch (error) {
    const code = error instanceof SetupError ? error.code : 'internal'
    return json({ error: { code, message: String(error?.message ?? error) } }, code === 'internal' ? 500 : 400)
  }
}

/** The route table for a setup instance; register each with connection.fetch.register. */
export function setupRoutes(setup) {
  return [
    { path: `${ROUTE_PREFIX}/status`, methods: ['GET'], fetch: handle((request) => setup.status({ region: new URL(request.url).searchParams.get('region') })) },
    {
      path: `${ROUTE_PREFIX}/install`,
      methods: ['POST'],
      fetch: handle(async (request) => {
        const { source } = await readBody(request)
        await setup.startInstall(source)
        return setup.status()
      }),
    },
    { path: `${ROUTE_PREFIX}/start`, methods: ['POST'], fetch: handle(async () => { await setup.startServer(); return setup.status() }) },
    { path: `${ROUTE_PREFIX}/pairing`, methods: ['POST'], fetch: handle(() => setup.startPairing()) },
  ].map((route) => ({ ...route, requestBody: 'buffered' }))
}

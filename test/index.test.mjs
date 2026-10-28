import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply, name } from '../lib/index.js'

// Records what apply registers with the parts of Cordis it uses.
const fakeContext = () => {
  const effects = []
  const routes = []
  const listeners = []
  const ctx = {
    effects, routes, listeners,
    logger: { warn: () => {} },
    sessionQuery: { readSession: async () => ({ session: {}, events: [] }) },
    sessionController: { list: async () => ({ items: [] }) },
    on: (event) => listeners.push(event),
    get: () => undefined,
    effect: (setup) => effects.push(setup()),
    inject: (deps, callback) => {
      assert.deepEqual(deps, ['connection'])
      callback({
        get: () => ({ fetch: { register: (route) => { routes.push(route.path); return async () => routes.splice(routes.indexOf(route.path), 1) } } }),
        effect: (setup) => effects.push(setup()),
      })
    },
    dispose: () => Promise.all(effects.map((cleanup) => cleanup?.())),
  }
  return ctx
}

test('bridge: false keeps the bridge off; the setup routes are registered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quicktui-dsh-index-'))
  try {
    const ctx = fakeContext()
    apply(ctx, { bridge: false, sidecarDir: dir, serverPath: join(dir, 'missing', 'quicktui-server') })
    assert.equal(name, 'quicktui-dsh')
    assert.deepEqual(ctx.routes, ['/api/quicktui-dsh/status', '/api/quicktui-dsh/install', '/api/quicktui-dsh/start', '/api/quicktui-dsh/pairing', '/api/quicktui-dsh/app-screenshot'])
    assert.deepEqual(ctx.listeners, [])
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(existsSync(join(dir, 'owner.pid')), false)
    await ctx.dispose()
    assert.deepEqual(ctx.routes, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the bridge starts by default and owns the sidecar directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quicktui-dsh-index-'))
  try {
    const ctx = fakeContext()
    apply(ctx, { sidecarDir: dir, serverPath: join(dir, 'missing', 'quicktui-server') })
    assert.ok(ctx.listeners.includes('approval/request'))
    for (let i = 0; i < 100 && !existsSync(join(dir, 'owner.pid')); i++) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(readFileSync(join(dir, 'owner.pid'), 'utf8'), String(process.pid))
    await ctx.dispose()
    assert.equal(existsSync(join(dir, 'owner.pid')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

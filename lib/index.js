// quicktui-dsh host entry: the setup page's routes plus the AgentBridge2 bridge.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { startBridge } from './bridge.js'
import { claimOwner } from './owner.js'
import { setupRoutes } from './routes.js'
import { createSetup } from './setup.js'

export const name = 'quicktui-dsh'
export const inject = ['sessionQuery', 'sessionController']

// A server installed outside the setup page (a terminal, the Store) is found
// within this interval.
const DETECT_INTERVAL_MS = 60_000

/**
 * @param config.bridge - false turns the AgentBridge2 bridge off.
 * @param config.serverPath - absolute quicktui-server path; detected when absent.
 * @param config.root - passed to ab2hook as --root.
 * @param config.sidecarDir - default <DSH_HOME or ~/.dsh>/quicktui/sidecar.
 * @param config.backfillDays - default 30.
 */
export function apply(ctx, config = {}) {
  const sidecarDir = typeof config.sidecarDir === 'string' && config.sidecarDir !== ''
    ? config.sidecarDir
    : join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'quicktui', 'sidecar')
  const backfillDays = Number.isFinite(config.backfillDays) && config.backfillDays >= 0 ? config.backfillDays : 30
  const root = typeof config.root === 'string' ? config.root : ''

  let bridge
  const setup = createSetup({
    serverPath: config.serverPath,
    onServerChange: () => bridge?.hookChanged(),
  })
  const hook = () => {
    const path = setup.current()
    return path ? [path] : undefined
  }

  // Asked again while this process does not own the sidecar directory, so it
  // takes over once the owning dsh process exits.
  let release
  let claiming
  let disposed = false
  const owns = async () => {
    if (release) return true
    if (disposed) return false
    claiming ??= claimOwner(sidecarDir).catch(() => undefined)
    const claimed = await claiming
    claiming = undefined
    if (claimed && disposed) await claimed()
    else release ??= claimed
    return release !== undefined
  }
  if (config.bridge !== false) {
    bridge = startBridge(ctx, { hook, root, sidecarDir, backfillDays, owns })
  }
  void setup.refresh().catch(() => {})
  const timer = setInterval(() => { void setup.refresh().catch(() => {}) }, DETECT_INTERVAL_MS)
  timer.unref?.()

  ctx.effect(() => () => {
    clearInterval(timer)
    disposed = true
    return Promise.resolve(claiming).then(() => release?.())
  }, 'quicktui-dsh.setup')

  ctx.inject(['connection'], (inner) => {
    const connection = inner.get('connection')
    if (typeof connection?.fetch?.register !== 'function') return
    const disposers = setupRoutes(setup).map((route) => connection.fetch.register(route))
    inner.effect(() => () => Promise.all(disposers.map((dispose) => dispose())), 'quicktui-dsh.routes')
  })
}

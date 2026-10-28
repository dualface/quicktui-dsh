// quicktui-dsh host entry: the setup page's routes plus the optional AgentBridge2 bridge.
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
 * @param config.bridge - true starts the AgentBridge2 bridge. Off by default
 *   until QuickTUI server ships the dsh provider: an older server drops every
 *   `ab2hook --agent dsh` call, so the bridge would only spawn processes and
 *   copy transcripts that nothing reads.
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

  const owner = config.bridge === true ? claimOwner(sidecarDir).catch(() => undefined) : Promise.resolve(undefined)
  if (config.bridge === true) {
    bridge = startBridge(ctx, {
      hook, root, sidecarDir, backfillDays, backfillAtStart: owner.then((release) => release !== undefined),
    })
  }
  void setup.refresh().catch(() => {})
  const timer = setInterval(() => { void setup.refresh().catch(() => {}) }, DETECT_INTERVAL_MS)
  timer.unref?.()

  ctx.effect(() => () => {
    clearInterval(timer)
    return owner.then((release) => release?.())
  }, 'quicktui-dsh.setup')

  ctx.inject(['connection'], (inner) => {
    const connection = inner.get('connection')
    if (typeof connection?.fetch?.register !== 'function') return
    const disposers = setupRoutes(setup).map((route) => connection.fetch.register(route))
    inner.effect(() => () => Promise.all(disposers.map((dispose) => dispose())), 'quicktui-dsh.routes')
  })
}

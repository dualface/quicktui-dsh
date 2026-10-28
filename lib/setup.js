// Finds, installs, and pairs the QuickTUI server for the setup page. Every
// server command runs a known absolute executable with an argv array.
import { execFile, spawn } from 'node:child_process'
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { posix, win32 } from 'node:path'
import qrcode from './vendor/qrcode.cjs'

export const INSTALL_SCRIPTS = {
  global: 'https://quicktui.ai/q.sh',
  cn: 'https://dl.quicktui.cn/q.sh',
}
export const STORE_URL = 'https://apps.microsoft.com/detail/9P1SRCZ4CJ8Z'
export const APP_LINKS = {
  global: { ios: 'https://apps.apple.com/us/app/id6761338192', android: 'https://quicktui.ai/android/' },
  cn: { ios: 'https://apps.apple.com/cn/app/id6761338192', android: 'https://quicktui.ai/cn/android/' },
}
export const DEVICES_SCHEMA = 'quicktui.paired-devices.v1'
export const PAIRING_TEXT_PREFIX = 'qtpair:'
// The server issues one-time pairing codes valid for 15 minutes.
export const PAIRING_TTL_MS = 15 * 60_000

const DEFAULT_PORT = 8022
const COMMAND_TIMEOUT_MS = 20_000
const HEALTH_TIMEOUT_MS = 1500
const SCRIPT_TIMEOUT_MS = 30_000
const MAX_SCRIPT_BYTES = 1 << 20
const MAX_COMMAND_OUTPUT = 1 << 20
const MAX_LOG_CHARS = 16_384
const MAX_ERROR_CHARS = 600

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g

const tail = (text, limit) => (text.length > limit ? text.slice(text.length - limit) : text)
const lastLines = (text) => tail(text.replace(ANSI, '').trim(), MAX_ERROR_CHARS)

/**
 * Where an installation puts quicktui-server, most likely first.
 * @returns absolute paths for the platform.
 */
export function serverCandidates({ platform = process.platform, env = process.env, home = homedir(), uid = process.getuid?.() } = {}) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local')
    // The Microsoft Store package exposes an app execution alias whose path
    // survives Store updates, unlike its versioned package directory.
    return [win32.join(local, 'QuickTUI', 'quicktui-server.exe'), win32.join(local, 'Microsoft', 'WindowsApps', 'quicktui-server.exe')]
  }
  const user = posix.join(home, '.local', 'bin', 'quicktui-server')
  return uid === 0 ? ['/usr/local/bin/quicktui-server', user] : [user, '/usr/local/bin/quicktui-server']
}

export function configPath({ platform = process.platform, home = homedir() } = {}) {
  return (platform === 'win32' ? win32 : posix).join(home, '.config', 'quicktui-server-v2', 'config.toml')
}

/**
 * The AgentBridge2 root of the server that uses the default config. Hooks the
 * server installs pass it as --root; without it ab2hook looks in a legacy
 * root that the server never serves.
 */
export function ab2Root({ platform = process.platform, home = homedir() } = {}) {
  const path = platform === 'win32' ? win32 : posix
  return path.join(path.dirname(configPath({ platform, home })), 'agentbridge2')
}

/** The port in the config's `addr`, or the server default. */
export function listenPort(configText) {
  const match = /^\s*addr\s*=\s*["']([^"']*)["']/m.exec(configText ?? '')
  const port = match ? Number(/:(\d+)$/.exec(match[1])?.[1]) : NaN
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT
}

/** Decodes `qtpair:<base64url>` into the pairing JSON the QR code carries. */
export function decodePairingText(text) {
  if (typeof text !== 'string' || !text.startsWith(PAIRING_TEXT_PREFIX)) return undefined
  const encoded = text.slice(PAIRING_TEXT_PREFIX.length)
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return undefined
  const payload = Buffer.from(encoded, 'base64url').toString('utf8')
  let parsed
  try { parsed = JSON.parse(payload) } catch { return undefined }
  if (typeof parsed?.server_url !== 'string' || typeof parsed.pairing_code !== 'string') return undefined
  return { payload, serverUrl: parsed.server_url }
}

/** An SVG of payload as the server draws it: error correction M, a 4-module quiet zone. */
export function qrSvg(payload) {
  const qr = qrcode(0, 'M')
  qr.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']
  qr.addData(payload, 'Byte')
  qr.make()
  const count = qr.getModuleCount()
  const quiet = 4
  let path = ''
  for (let row = 0; row < count; row++) {
    let col = 0
    while (col < count) {
      if (!qr.isDark(row, col)) { col++; continue }
      const start = col
      while (col < count && qr.isDark(row, col)) col++
      path += `M${start + quiet} ${row + quiet}h${col - start}v1h-${col - start}z`
    }
  }
  const size = count + quiet * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}

const appCodes = new Map()
/** The app download links of a region, each with a QR code to scan with a phone. */
export function appLinks(region) {
  const links = APP_LINKS[region] ?? APP_LINKS.global
  return Object.entries(links).map(([id, url]) => {
    if (!appCodes.has(url)) appCodes.set(url, qrSvg(url))
    return { id, url, svg: appCodes.get(url) }
  })
}

export function parseDevices(stdout) {
  let parsed
  try { parsed = JSON.parse(stdout) } catch { return undefined }
  if (parsed?.schema_version !== DEVICES_SCHEMA || !Array.isArray(parsed.devices)) return undefined
  return parsed.devices
    .filter((device) => typeof device?.device_id === 'string')
    .map((device) => ({ id: device.device_id, label: typeof device.label === 'string' ? device.label : '' }))
}

const defaultRun = (file, args, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) => new Promise((resolve) => {
  execFile(file, args, { timeout: timeoutMs, maxBuffer: MAX_COMMAND_OUTPUT, windowsHide: true, encoding: 'utf8' },
    (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0
      resolve({ code, stdout: stdout ?? '', stderr: stderr || (error && typeof error.code !== 'number' ? String(error.message) : '') })
    })
})

const defaultExists = async (path) => {
  try {
    // lstat: the Store's execution alias is a reparse point stat cannot follow.
    await lstat(path)
    return true
  } catch {
    return false
  }
}

const defaultHealthy = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v3/healthz`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    return response.ok && (await response.json())?.status === 'ok'
  } catch {
    return false
  }
}

/**
 * The server-facing half of the setup page.
 * @param options.serverPath - an absolute path that overrides detection.
 * @param options.onServerChange - called when a detection finds a different path.
 * Other options replace the process, file, and network access in tests.
 */
export function createSetup({
  serverPath,
  onServerChange = () => {},
  platform = process.platform,
  env = process.env,
  home = homedir(),
  run = defaultRun,
  exists = defaultExists,
  readText = (path) => readFile(path, 'utf8'),
  healthy = defaultHealthy,
  fetchScript = (url) => fetch(url, { redirect: 'error', signal: AbortSignal.timeout(SCRIPT_TIMEOUT_MS) }),
  spawnInstaller = (script) => spawn('/bin/sh', [script, 'install', '-y'], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, NO_COLOR: '1' },
  }),
  now = Date.now,
} = {}) {
  let found
  let pairing
  const install = { phase: 'idle', source: undefined, log: '', error: undefined }

  const locate = async () => {
    const candidates = typeof serverPath === 'string' && (posix.isAbsolute(serverPath) || win32.isAbsolute(serverPath))
      ? [serverPath]
      : serverCandidates({ platform, env, home })
    for (const candidate of candidates) {
      if (await exists(candidate)) return candidate
    }
    return undefined
  }

  /** Re-detects the server; returns its path or undefined. */
  const refresh = async () => {
    const next = await locate()
    if (next !== found) {
      found = next
      onServerChange(next)
    }
    return found
  }

  const devices = async (path) => {
    const result = await run(path, ['pairing', 'devices', 'list', '--json'])
    if (result.code !== 0) return { supported: !/unknown flag/i.test(result.stderr), list: undefined }
    const list = parseDevices(result.stdout)
    return { supported: list !== undefined, list }
  }

  const status = async ({ region } = {}) => {
    const path = await refresh()
    const server = { found: path !== undefined, path, version: undefined, running: false }
    let paired = { supported: false, list: undefined }
    if (path) {
      const version = await run(path, ['version'])
      // `version` prints `quicktui <version>`.
      server.version = version.code === 0 ? version.stdout.trim().split('\n')[0].replace(/^quicktui\s+/, '') : undefined
      let port = DEFAULT_PORT
      try { port = listenPort(await readText(configPath({ platform, home }))) } catch {}
      server.port = port
      server.running = await healthy(port)
      if (server.running) paired = await devices(path)
    }
    let session
    if (pairing) {
      const expired = now() >= pairing.expiresAt
      const fresh = paired.list?.find((device) => !pairing.baseline.has(device.id))
      if (fresh && !pairing.paired) pairing.paired = fresh.label || fresh.id
      session = { expiresAt: pairing.expiresAt, expired, paired: pairing.paired }
    }
    return {
      platform,
      server,
      devices: paired.list === undefined ? undefined : paired.list.map((device) => device.label || device.id),
      devicesSupported: paired.supported,
      pairing: session,
      install: { ...install },
      installKind: platform === 'win32' ? 'store' : 'script',
      storeUrl: STORE_URL,
      installScripts: INSTALL_SCRIPTS,
      apps: appLinks(region),
    }
  }

  /** Issues a pairing code; the QR and the text carry the same one-time code. */
  const startPairing = async () => {
    const path = await refresh()
    if (!path) throw new SetupError('server-missing', 'QuickTUI server is not installed')
    const before = await devices(path)
    const result = await run(path, ['pairing', 'qrcode', '--text'])
    const decoded = result.code === 0 ? decodePairingText(result.stdout.trim()) : undefined
    if (!decoded) throw new SetupError('pairing-failed', lastLines(result.stderr || result.stdout) || 'pairing failed')
    pairing = {
      baseline: new Set((before.list ?? []).map((device) => device.id)),
      expiresAt: now() + PAIRING_TTL_MS,
      paired: undefined,
    }
    return { svg: qrSvg(decoded.payload), text: result.stdout.trim(), serverUrl: decoded.serverUrl, expiresAt: pairing.expiresAt }
  }

  const startServer = async () => {
    const path = await refresh()
    if (!path) throw new SetupError('server-missing', 'QuickTUI server is not installed')
    const result = await run(path, ['service', 'start'], { timeoutMs: 60_000 })
    if (result.code !== 0) throw new SetupError('start-failed', lastLines(result.stderr || result.stdout) || 'service start failed')
  }

  /**
   * Runs the official bootstrap with `install -y`. Resolves once it started;
   * progress shows in status().install.
   */
  const startInstall = async (source) => {
    if (platform === 'win32') throw new SetupError('unsupported', 'install QuickTUI from the Microsoft Store on Windows')
    const url = INSTALL_SCRIPTS[source]
    if (!url) throw new SetupError('bad-source', 'unknown install source')
    if (install.phase === 'running') throw new SetupError('busy', 'an installation is already running')
    Object.assign(install, { phase: 'running', source, log: '', error: undefined })
    let dir
    try {
      const response = await fetchScript(url)
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
      const script = await response.text()
      if (script.length > MAX_SCRIPT_BYTES || !script.startsWith('#!/bin/sh')) throw new Error(`${url} is not the QuickTUI bootstrap script`)
      dir = await mkdtemp(posix.join(tmpdir(), 'quicktui-dsh-'))
      const file = posix.join(dir, 'q.sh')
      await writeFile(file, script, { mode: 0o600 })
      const child = spawnInstaller(file)
      const append = (chunk) => { install.log = tail(install.log + String(chunk).replace(ANSI, ''), MAX_LOG_CHARS) }
      child.stdout?.on('data', append)
      child.stderr?.on('data', append)
      const finish = (error) => {
        if (install.phase !== 'running') return
        install.phase = error ? 'failed' : 'succeeded'
        install.error = error
        void rm(dir, { recursive: true, force: true }).catch(() => {})
        void refresh().catch(() => {})
      }
      child.once('error', (error) => finish(String(error?.message ?? error)))
      child.once('close', (code) => finish(code === 0 ? undefined : `installer exited with ${code}`))
    } catch (error) {
      install.phase = 'failed'
      install.error = String(error?.message ?? error)
      if (dir) void rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { refresh, current: () => found, status, startPairing, startServer, startInstall }
}

export class SetupError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { claimOwner } from '../lib/owner.js'
import { setupRoutes } from '../lib/routes.js'
import {
  APP_LINKS, INSTALL_SCRIPTS, MAX_LOG_CHARS, SCREENSHOT_ROUTE, ab2Root, PAIRING_TTL_MS, SetupError, createSetup,
  decodePairingText, listenPort, parseDevices, qrSvg, serverCandidates,
} from '../lib/setup.js'

const pairingText = (value) => 'qtpair:' + Buffer.from(JSON.stringify(value)).toString('base64url')
const devicesJson = (...ids) => JSON.stringify({
  schema_version: 'quicktui.paired-devices.v1',
  devices: ids.map((id) => ({ device_id: id, label: `${id} phone`, issued_at: '2026-10-01T00:00:00Z', last_seen_at: null, source: 'pairing' })),
})

// A fake quicktui-server: argv joined by spaces selects the reply.
const fakeServer = (replies) => {
  const calls = []
  const run = async (file, args) => {
    calls.push([file, ...args].join(' '))
    const reply = replies[args.join(' ')]
    return typeof reply === 'function' ? reply() : reply ?? { code: 1, stdout: '', stderr: 'unexpected' }
  }
  return { calls, run }
}

test('server candidates per platform', () => {
  assert.deepEqual(serverCandidates({ platform: 'linux', home: '/home/a', uid: 1000 }),
    ['/home/a/.local/bin/quicktui-server', '/usr/local/bin/quicktui-server'])
  assert.deepEqual(serverCandidates({ platform: 'linux', home: '/root', uid: 0 }),
    ['/usr/local/bin/quicktui-server', '/root/.local/bin/quicktui-server'])
  assert.deepEqual(serverCandidates({ platform: 'win32', home: 'C:\\Users\\a', env: { LOCALAPPDATA: 'D:\\Local' } }),
    ['D:\\Local\\QuickTUI\\quicktui-server.exe', 'D:\\Local\\Microsoft\\WindowsApps\\quicktui-server.exe'])
  assert.deepEqual(serverCandidates({ platform: 'win32', home: 'C:\\Users\\a', env: {} })[0],
    'C:\\Users\\a\\AppData\\Local\\QuickTUI\\quicktui-server.exe')
})

test('AgentBridge2 root next to the default config', () => {
  assert.equal(ab2Root({ platform: 'linux', home: '/home/a' }), '/home/a/.config/quicktui-server-v2/agentbridge2')
  assert.equal(ab2Root({ platform: 'win32', home: 'C:\\Users\\a' }), 'C:\\Users\\a\\.config\\quicktui-server-v2\\agentbridge2')
})

test('listen port from the config addr', () => {
  assert.equal(listenPort(''), 8022)
  assert.equal(listenPort('addr = "0.0.0.0:9100"\n'), 9100)
  assert.equal(listenPort('# addr = "0.0.0.0:1"\naddr = \'[::]:8123\''), 8123)
  assert.equal(listenPort('addr = "0.0.0.0:99999"'), 8022)
  assert.equal(listenPort('other_addr = "x"'), 8022)
})

test('pairing text decoding', () => {
  const value = { server_url: 'http://host.local:8022', pairing_code: 'code', server_fingerprint: 'f' }
  const decoded = decodePairingText(pairingText(value))
  assert.equal(decoded.serverUrl, value.server_url)
  assert.deepEqual(JSON.parse(decoded.payload), value)
  assert.equal(decodePairingText('qtpair:'), undefined)
  assert.equal(decodePairingText('qtpair:a+b'), undefined)
  assert.equal(decodePairingText(pairingText({ pairing_code: 'x' })), undefined)
  assert.equal(decodePairingText('other:' + pairingText(value).slice(7)), undefined)
})

test('QR SVG has a quiet zone and only dark-module paths', () => {
  const svg = qrSvg('https://quicktui.ai/android/')
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1])
  // 28 bytes need version 3 (29 modules); plus a 4-module quiet zone on each side.
  assert.equal(size, 37)
  assert.match(svg, /^<svg [^>]*><rect width="37" height="37" fill="#fff"\/><path d="(M\d+ \d+h\d+v1h-\d+z)+" fill="#000"\/><\/svg>$/)
  assert.doesNotMatch(svg, /M[0-3] /)
})

test('devices JSON parsing', () => {
  assert.deepEqual(parseDevices(devicesJson('a')), [{ id: 'a', label: 'a phone' }])
  assert.equal(parseDevices('{"schema_version":"other","devices":[]}'), undefined)
  assert.equal(parseDevices('not json'), undefined)
})

test('status without a server', async () => {
  const setup = createSetup({ platform: 'linux', home: '/h', exists: async () => false, run: async () => assert.fail('ran') })
  const status = await setup.status({ region: 'cn' })
  assert.equal(status.server.found, false)
  assert.equal(status.installKind, 'script')
  assert.deepEqual(status.installScripts, INSTALL_SCRIPTS)
  assert.equal(status.installArgs, 'install --channel server2 -y')
  assert.deepEqual(status.websites, { global: 'https://quicktui.ai/', cn: 'https://quicktui.cn/' })
  assert.deepEqual(status.guides, { global: 'https://quicktui.ai/guide/', cn: 'https://quicktui.cn/guide/' })
  assert.equal(status.screenshot, undefined)
  assert.equal(await setup.readScreenshot(), undefined)
  assert.deepEqual(status.apps.map((app) => app.url), [APP_LINKS.cn.ios, APP_LINKS.cn.android])
  assert.equal((await setup.status({ region: 'xx' })).apps[0].url, APP_LINKS.global.ios)
  assert.equal((await createSetup({ platform: 'win32', exists: async () => false }).status()).installKind, 'store')
})

test('status, pairing, and a new device', async () => {
  let devices = devicesJson('old')
  const server = fakeServer({
    version: { code: 0, stdout: 'quicktui server2-20261026-01\n' },
    'pairing devices list --json': () => ({ code: 0, stdout: devices }),
    'pairing qrcode --text': { code: 0, stdout: pairingText({ server_url: 'http://h:9100', pairing_code: 'c' }) + '\n' },
  })
  let clock = 1_000_000
  const ports = []
  const changes = []
  const setup = createSetup({
    platform: 'linux', home: '/h', uid: 1000,
    exists: async (path) => path === '/usr/local/bin/quicktui-server',
    readText: async () => 'addr = "0.0.0.0:9100"\n',
    healthy: async (port) => { ports.push(port); return true },
    run: server.run,
    now: () => clock,
    onServerChange: (path) => changes.push(path),
  })
  let status = await setup.status()
  assert.deepEqual(status.server, { found: true, path: '/usr/local/bin/quicktui-server', version: 'server2-20261026-01', running: true, port: 9100 })
  assert.deepEqual(ports, [9100])
  assert.deepEqual(status.devices, ['old phone'])
  assert.equal(status.pairing, undefined)
  assert.deepEqual(changes, ['/usr/local/bin/quicktui-server'])

  const code = await setup.startPairing()
  assert.equal(code.serverUrl, 'http://h:9100')
  assert.equal(code.expiresAt, clock + PAIRING_TTL_MS)
  assert.match(code.svg, /^<svg /)
  assert.match(code.text, /^qtpair:/)
  status = await setup.status()
  assert.deepEqual(status.pairing, { expiresAt: code.expiresAt, expired: false, paired: undefined })

  devices = devicesJson('old', 'new')
  status = await setup.status()
  assert.equal(status.pairing.paired, 'new phone')
  clock += PAIRING_TTL_MS
  assert.equal((await setup.status()).pairing.expired, true)
  assert.deepEqual(changes, ['/usr/local/bin/quicktui-server'])
})

test('a server without devices --json', async () => {
  const server = fakeServer({
    version: { code: 0, stdout: 'quicktui-server 2.3.0' },
    'pairing devices list --json': { code: 1, stdout: '', stderr: 'Error: unknown flag: --json' },
  })
  const setup = createSetup({ platform: 'darwin', home: '/h', exists: async () => true, readText: async () => '', healthy: async () => true, run: server.run })
  const status = await setup.status()
  assert.equal(status.devices, undefined)
  assert.equal(status.devicesSupported, false)
})

test('a stopped server is not asked for devices', async () => {
  const server = fakeServer({ version: { code: 0, stdout: 'v' } })
  const setup = createSetup({ platform: 'darwin', home: '/h', exists: async () => true, readText: async () => { throw new Error('none') }, healthy: async () => false, run: server.run })
  const status = await setup.status()
  assert.equal(status.server.running, false)
  assert.equal(status.server.port, 8022)
  assert.deepEqual(server.calls, ['/h/.local/bin/quicktui-server version'])
})

test('pairing failures', async () => {
  await assert.rejects(createSetup({ platform: 'linux', exists: async () => false }).startPairing(), { code: 'server-missing' })
  const server = fakeServer({
    'pairing devices list --json': { code: 0, stdout: devicesJson() },
    'pairing qrcode --text': { code: 1, stdout: '', stderr: '\x1b[31mError:\x1b[0m server is not running' },
  })
  const setup = createSetup({ platform: 'linux', home: '/h', exists: async () => true, run: server.run })
  await assert.rejects(setup.startPairing(), { code: 'pairing-failed', message: 'Error: server is not running' })
})

test('an explicit server path wins only when absolute', async () => {
  const seen = []
  const exists = async (path) => { seen.push(path); return false }
  await createSetup({ platform: 'linux', home: '/h', serverPath: '/opt/qt/quicktui-server', exists }).refresh()
  await createSetup({ platform: 'linux', home: '/h', serverPath: 'quicktui-server', exists }).refresh()
  assert.deepEqual(seen.slice(0, 2), ['/opt/qt/quicktui-server', '/h/.local/bin/quicktui-server'])
})

const fakeChild = () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}
const scriptResponse = (body, status = 200) => ({ ok: status === 200, status, text: async () => body })
const until = async (check) => {
  for (let i = 0; i < 200; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail('timed out')
}

test('install runs the downloaded script and finds the server', async () => {
  let installed = false
  let child
  let script
  let args
  const fetched = []
  const changes = []
  const setup = createSetup({
    platform: 'linux', home: '/h',
    exists: async () => installed,
    readText: async () => '', healthy: async () => false, run: async () => ({ code: 0, stdout: 'v' }),
    fetchScript: async (url) => { fetched.push(url); return scriptResponse('#!/bin/sh\necho hi\n') },
    spawnInstaller: (file, argv) => { script = readFileSync(file, 'utf8'); args = argv; child = fakeChild(); return child },
    onServerChange: (path) => changes.push(path),
  })
  await setup.startInstall('cn')
  assert.deepEqual(fetched, [INSTALL_SCRIPTS.cn])
  assert.equal(script, '#!/bin/sh\necho hi\n')
  assert.deepEqual(args, ['install', '--channel', 'server2', '-y'])
  assert.equal((await setup.status()).install.phase, 'running')
  await assert.rejects(setup.startInstall('global'), { code: 'busy' })
  child.stdout.emit('data', Buffer.from('\x1b[32mdownloading\x1b[0m\n'))
  child.stderr.emit('data', 'done\n')
  installed = true
  child.emit('close', 0)
  await until(() => changes.length === 1)
  const status = await setup.status()
  assert.equal(status.install.phase, 'succeeded')
  assert.equal(status.install.log, 'downloading\ndone\n')
  assert.equal(status.server.found, true)
})

// Starts an install with a fake child; the test ends it so the script's temp dir is removed.
const installing = async (t) => {
  let child
  let script
  const setup = createSetup({
    platform: 'linux', exists: async () => false, fetchScript: async () => scriptResponse('#!/bin/sh\n'),
    spawnInstaller: (file) => { script = file; return (child = fakeChild()) },
  })
  await setup.startInstall('global')
  t.after(async () => {
    child.emit('close', 0)
    await until(() => !existsSync(script))
  })
  return { child, log: async () => (await setup.status()).install.log }
}

test('install log follows terminal line rules', async (t) => {
  const { child, log } = await installing(t)
  child.stdout.emit('data', 'Server: 1 MiB\rServer: 2 MiB\r')
  assert.equal(await log(), 'Server: 2 MiB')
  // A CR LF split across chunks ends the line once and keeps its text.
  child.stdout.emit('data', '\nSetup\r')
  child.stdout.emit('data', '\ntail\r\n')
  child.stderr.emit('data', 'a\rb\n')
  assert.equal(await log(), 'Server: 2 MiB\nSetup\ntail\nb\n')
})

test('install log keeps the newest text and its line rules', async (t) => {
  const { child, log } = await installing(t)
  child.stdout.emit('data', 'x'.repeat(MAX_LOG_CHARS) + '\n')
  child.stdout.emit('data', 'p 1\rp 2\r')
  child.stdout.emit('data', '\nend\n')
  const text = await log()
  assert.equal(text.length, MAX_LOG_CHARS)
  assert.ok(text.endsWith('x\np 2\nend\n'))
})

test('install failures', async () => {
  await assert.rejects(createSetup({ platform: 'win32' }).startInstall('global'), { code: 'unsupported' })
  await assert.rejects(createSetup({ platform: 'linux' }).startInstall('elsewhere'), { code: 'bad-source' })

  const html = createSetup({ platform: 'linux', exists: async () => false, fetchScript: async () => scriptResponse('<html>'), spawnInstaller: () => assert.fail('spawned') })
  await html.startInstall('global')
  const failed = (await html.status()).install
  assert.equal(failed.phase, 'failed')
  assert.match(failed.error, /not the QuickTUI bootstrap script/)

  const http = createSetup({ platform: 'linux', exists: async () => false, fetchScript: async () => scriptResponse('', 503) })
  await http.startInstall('global')
  assert.match((await http.status()).install.error, /HTTP 503/)

  let child
  const exit = createSetup({ platform: 'linux', exists: async () => false, fetchScript: async () => scriptResponse('#!/bin/sh\n'), spawnInstaller: () => (child = fakeChild()) })
  await exit.startInstall('global')
  child.emit('close', 3)
  assert.deepEqual({ ...(await exit.status()).install, log: undefined }, { phase: 'failed', source: 'global', log: undefined, error: 'installer exited with 3' })
  // A failed run can be retried.
  await exit.startInstall('global')
  assert.equal((await exit.status()).install.phase, 'running')
})

const request = (method, path, body) => new Request(`http://dsh.local${path}`, { method, body })

test('screenshot route serves only the configured file', async () => {
  const route = (setup) => setupRoutes(setup).find((entry) => entry.path === SCREENSHOT_ROUTE)
  assert.equal(SCREENSHOT_ROUTE, '/api/quicktui-dsh/app-screenshot')

  const none = await route(createSetup({ platform: 'linux' })).fetch(request('GET', SCREENSHOT_ROUTE))
  assert.equal(none.status, 404)

  const dir = mkdtempSync(join(tmpdir(), 'quicktui-dsh-shot-'))
  try {
    const file = join(dir, 'phone.png')
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeFileSync(join(dir, 'other.png'), 'other')
    const setup = createSetup({ platform: 'linux', exists: async () => false, screenshot: file })
    assert.equal((await setup.status()).screenshot, SCREENSHOT_ROUTE)
    for (const path of [SCREENSHOT_ROUTE, `${SCREENSHOT_ROUTE}?file=other.png&path=../other.png`]) {
      const response = await route(setup).fetch(request('GET', path))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/png')
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47])
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('routes', async () => {
  const calls = []
  const setup = {
    status: async (options) => { calls.push(['status', options]); return { ok: true } },
    startInstall: async (source) => {
      calls.push(['install', source])
      if (source === 'bad') throw new SetupError('bad-source', 'unknown install source')
      if (source === 'boom') throw new Error('boom')
    },
    startServer: async () => calls.push(['start']),
    startPairing: async () => ({ svg: '<svg/>' }),
  }
  const routes = Object.fromEntries(setupRoutes(setup).map((route) => [route.path, route]))
  assert.deepEqual(Object.keys(routes), ['/api/quicktui-dsh/status', '/api/quicktui-dsh/install', '/api/quicktui-dsh/start', '/api/quicktui-dsh/pairing', SCREENSHOT_ROUTE])
  for (const route of Object.values(routes)) assert.equal(route.requestBody, 'buffered')

  let response = await routes['/api/quicktui-dsh/status'].fetch(request('GET', '/api/quicktui-dsh/status?region=cn'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(calls.pop(), ['status', { region: 'cn' }])

  response = await routes['/api/quicktui-dsh/install'].fetch(request('POST', '/api/quicktui-dsh/install', '{"source":"cn"}'))
  assert.equal(response.status, 200)
  assert.deepEqual(calls.splice(0), [['install', 'cn'], ['status', undefined]])

  response = await routes['/api/quicktui-dsh/install'].fetch(request('POST', '/api/quicktui-dsh/install', '{"source":"bad"}'))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: { code: 'bad-source', message: 'unknown install source' } })

  response = await routes['/api/quicktui-dsh/install'].fetch(request('POST', '/api/quicktui-dsh/install', '{"source":"boom"}'))
  assert.equal(response.status, 500)

  response = await routes['/api/quicktui-dsh/install'].fetch(request('POST', '/api/quicktui-dsh/install', 'x'.repeat(5000)))
  assert.equal((await response.json()).error.code, 'bad-request')

  response = await routes['/api/quicktui-dsh/pairing'].fetch(request('POST', '/api/quicktui-dsh/pairing'))
  assert.deepEqual(await response.json(), { svg: '<svg/>' })
})

test('owner lock', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quicktui-dsh-owner-'))
  try {
    const path = join(dir, 'owner.pid')
    const release = await claimOwner(dir)
    assert.equal(readFileSync(path, 'utf8'), String(process.pid))
    await release()
    assert.equal(existsSync(path), false)

    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
    try {
      writeFileSync(path, String(holder.pid))
      assert.equal(await claimOwner(dir), undefined)
      assert.equal(readFileSync(path, 'utf8'), String(holder.pid))
    } finally {
      holder.kill()
    }

    const exited = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' })
    writeFileSync(path, exited.stdout.trim())
    const again = await claimOwner(dir)
    assert.equal(readFileSync(path, 'utf8'), String(process.pid))
    // Another owner took over: release leaves its file alone.
    writeFileSync(path, '1')
    await again()
    assert.equal(readFileSync(path, 'utf8'), '1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

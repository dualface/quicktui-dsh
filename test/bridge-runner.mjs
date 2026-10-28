// Drives the bridge against a fake Cordis context and the fake ab2hook (run by
// bridge.test.mjs). Exits non-zero on the first failed assertion.
// Env: AB2_FAKE_DIR (fake hook state).
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startBridge } from '../lib/bridge.js'

const fakeDir = process.env.AB2_FAKE_DIR
const fakeHook = [process.execPath, join(dirname(fileURLToPath(import.meta.url)), 'fake-ab2hook.mjs')]
const config = { root: 'test-root', backfillDays: 30 }

const DAY = 86_400_000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const readLines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [])
const events = () => readLines(join(fakeDir, 'events.log')).map((line) => line.body)
const waits = () => readLines(join(fakeDir, 'waits.log'))
const until = async (what, check, ms = 10_000) => {
  const deadline = Date.now() + ms
  for (;;) {
    const value = check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(20)
  }
}
const eventWhere = (match) => events().find((event) => Object.entries(match).every(([key, value]) => event[key] === value))
const atomicWrite = (file, value) => {
  writeFileSync(`${file}.tmp`, JSON.stringify(value))
  renameSync(`${file}.tmp`, file)
}
const answer = (promptId, value) => {
  mkdirSync(join(fakeDir, 'answers'), { recursive: true })
  atomicWrite(join(fakeDir, 'answers', `${promptId}.json`), { schema_version: 'ab2.dsh-dialog-answer.v1', ...value })
}
let commandCounter = 0
const command = (value) => {
  mkdirSync(join(fakeDir, 'commands'), { recursive: true })
  atomicWrite(join(fakeDir, 'commands', `${String(++commandCounter).padStart(4, '0')}.json`), { schema_version: 'ab2.dsh-command.v1', ...value })
}
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const event = (seq, type, data = {}) => ({ seq, type, data, at: 1000 + seq })

// A Cordis context with the services and the event dispatch the plugin uses.
class FakeContext {
  constructor(store) {
    this.store = store
    this.listeners = new Map()
    this.cleanups = []
    this.prompts = []
    this.cancels = []
    this.logger = { warn: () => {}, info: () => {} }
    this.sessionQuery = {
      readSession: async (id) => {
        const session = store.get(id)
        if (!session) throw new Error(`no session ${id}`)
        return { session: session.header, events: session.events.slice() }
      },
    }
    this.sessionController = {
      list: async () => ({ items: [...store.values()].map((session) => session.summary) }),
      prompt: async (request) => {
        if (!store.has(request.sessionId)) throw new Error(`session not found: ${request.sessionId}`)
        this.prompts.push(request)
        return { accepted: true }
      },
      cancel: (request) => {
        this.cancels.push(request)
        return { accepted: true }
      },
    }
  }

  on(name, listener, options) {
    const list = this.listeners.get(name) ?? []
    if (options?.prepend) list.unshift(listener)
    else list.push(listener)
    this.listeners.set(name, list)
  }

  effect(setup) {
    this.cleanups.push(setup())
  }

  get(name) {
    return name === 'loader' ? { await: async () => {} } : undefined
  }

  emit(name, ...args) {
    for (const listener of this.listeners.get(name) ?? []) listener(...args)
  }

  // Waterfall dispatch: each listener gets next() for the rest; last answers.
  waterfall(name, request, last) {
    const list = this.listeners.get(name) ?? []
    const run = (index) => (index < list.length ? list[index](request, () => run(index + 1)) : last(request))
    return run(0)
  }

  dispose() {
    for (const cleanup of this.cleanups) cleanup?.()
  }
}

const now = Date.now()
const session = (id, { updatedAt = now - DAY, events: list = [], origin, blank = false } = {}) => [id, {
  header: { id, cwd: `/work/${id}`, createdAt: updatedAt - DAY },
  summary: { sessionId: id, updatedAt, blank, ...(origin ? { origin } : {}) },
  events: list,
}]
const store = new Map([
  session('s-recent', { events: [event(0, 'session/start'), event(1, 'user/message', { text: 'hi' }), event(2, 'assistant/message', { text: 'hello' })] }),
  session('s-old', { updatedAt: now - 40 * DAY, events: [event(0, 'session/start'), event(1, 'user/message')] }),
  session('s-sub', { origin: 'subagent', events: [event(0, 'session/start')] }),
  session('s-blank', { blank: true }),
  session('s-torn', { events: [event(0, 'session/start'), event(1, 'user/message'), event(2, 'assistant/message')] }),
])
const agentOf = (id) => ({ session: { id } })
const sidecarDir = join(fakeDir, 'sidecar')
const sidecar = (id) => readLines(join(sidecarDir, `${id}.jsonl`))
const seqs = (id) => sidecar(id).slice(1).map((line) => line.seq)

// A crash after an append and before its state write, plus a torn last line:
// the sidecar, not the stale state file, says where to continue.
mkdirSync(sidecarDir, { recursive: true })
writeFileSync(join(sidecarDir, 's-torn.jsonl'), [
  JSON.stringify({ type: 'ab2/sidecar', schema_version: 'ab2.dsh-sidecar.v1', session: store.get('s-torn').header }),
  JSON.stringify(store.get('s-torn').events[0]),
  JSON.stringify(store.get('s-torn').events[1]),
].join('\n') + '\n{"type":"assistant/mes')
writeFileSync(join(sidecarDir, 's-torn.state.json'), JSON.stringify({ schema_version: 'ab2.dsh-sidecar.v1', last_seq: 0 }))

const ctx = new FakeContext(store)
startBridge(ctx, { ...config, hook: () => fakeHook, sidecarDir })

// --- startup backfill: only recent, non-blank, non-subagent Sessions ---------
const backfillDone = await until('backfill_done', () => eventWhere({ event: 'backfill_done' }))
assert.equal(backfillDone.sessions, 2)
assert.equal(backfillDone.total, 5)
assert.deepEqual(seqs('s-torn'), [0, 1, 2])
assert.equal(JSON.parse(readFileSync(join(sidecarDir, 's-torn.state.json'), 'utf8')).last_seq, 2)
const start = eventWhere({ event: 'plugin_start' })
assert.equal(start.schema_version, 'ab2.dsh-plugin-event.v1')
assert.match(start.instance_id, /^dsh-/)
const startLine = readLines(join(fakeDir, 'events.log')).find((line) => line.body.event === 'plugin_start')
assert.deepEqual(startLine.argv.slice(0, 6), ['ab2hook', '--agent', 'dsh', '--source-version', 'dsh-plugin.v1', '--root'])
assert.equal(startLine.argv[6], 'test-root')
assert.deepEqual(sidecar('s-recent')[0], { type: 'ab2/sidecar', schema_version: 'ab2.dsh-sidecar.v1', session: store.get('s-recent').header })
assert.deepEqual(seqs('s-recent'), [0, 1, 2])
for (const id of ['s-old', 's-sub', 's-blank']) assert.equal(existsSync(join(sidecarDir, `${id}.jsonl`)), false, id)

// --- live events, a seq gap, a repeat, and an old Session --------------------
const recent = store.get('s-recent')
const push = (id, entry, emit = true) => {
  store.get(id).events.push(entry)
  if (emit) ctx.emit('session/event', { id }, entry)
}
push('s-recent', event(3, 'turn/start', { turn: 1 }))
push('s-recent', event(4, 'tool/call', { callId: 'call-1', name: 'pwsh', arguments: '{"command":"ls"}' }), false)
push('s-recent', event(5, 'tool/result', { callId: 'call-1' }))
ctx.emit('session/event', { id: 's-recent' }, recent.events[5])
await until('gap catch-up', () => seqs('s-recent').length === 6)
assert.deepEqual(seqs('s-recent'), [0, 1, 2, 3, 4, 5])
assert.equal(JSON.parse(readFileSync(join(sidecarDir, 's-recent.state.json'), 'utf8')).last_seq, 5)
await until('turn_start', () => eventWhere({ event: 'turn_start', agent_session_id: 's-recent', seq: 3 }))
const updated = await until('transcript_updated', () => eventWhere({ event: 'transcript_updated', agent_session_id: 's-recent', last_seq: 5 }))
assert.equal(updated.sidecar_path, join(sidecarDir, 's-recent.jsonl'))
// Events carry no message text.
assert.equal(JSON.stringify(events()).includes('hello'), false)

push('s-old', event(2, 'turn/start'))
await until('old Session catch-up', () => seqs('s-old').length === 3)
assert.deepEqual(seqs('s-old'), [0, 1, 2])

// An append that never reached session/event arrives with idle.
push('s-recent', event(6, 'turn/end', { reason: { kind: 'completed' } }), false)
ctx.emit('agent/status', { agent: agentOf('s-recent'), status: 'idle' })
await until('idle catch-up', () => seqs('s-recent').length === 7)
await until('session_status', () => eventWhere({ event: 'session_status', agent_session_id: 's-recent', status: 'idle' }))
// Session ids that are not plain file names are never mirrored.
ctx.emit('session/event', { id: '../escape' }, event(0, 'session/start'))
await sleep(100)
assert.equal(existsSync(join(fakeDir, 'escape.jsonl')), false)

// --- approvals ------------------------------------------------------------------
// The Desktop card: settles with its own answer, or 'cancelled' once its signal
// aborts (the Gateway withdraws the card).
const desktopCard = (answerAfter) => (request) => new Promise((resolve) => {
  const card = { withdrawn: false }
  desktopCard.last = card
  request.signal?.addEventListener('abort', () => {
    card.withdrawn = true
    resolve('cancelled')
  }, { once: true })
  if (answerAfter !== undefined) setTimeout(() => resolve(answerAfter.value), answerAfter.ms)
})
const promptStart = (count) => until(`ui_prompt_start #${count}`, () => events().filter((entry) => entry.event === 'ui_prompt_start')[count - 1])

ctx.emit('session/event', { id: 's-recent' }, event(7, 'tool/call', { callId: 'call-2', name: 'pwsh', arguments: '{"command":"rm -rf build"}' }))
let upstream = new AbortController()
let pending = ctx.waterfall('approval/request', {
  agent: agentOf('s-recent'), toolName: 'pwsh', callId: 'call-2', reason: 'escalate sandbox',
  displayReason: { en: 'Allow this?', zh: '允许吗?' }, signal: upstream.signal,
}, desktopCard())
let shown = await promptStart(1)
assert.equal(shown.kind, 'approval')
assert.equal(shown.tool_name, 'pwsh')
assert.equal(shown.tool_call_id, 'call-2')
assert.equal(shown.tool_arguments, '{"command":"rm -rf build"}')
assert.deepEqual(shown.display_reason, { en: 'Allow this?', zh: '允许吗?' })
const firstWait = await until('dialog wait', () => waits().find((wait) => wait.mode === 'dialog'))
assert.deepEqual(firstWait.request, { schema_version: 'ab2.dsh-dialog-wait.v1', agent_session_id: 's-recent', prompt_id: shown.prompt_id })
answer(shown.prompt_id, { kind: 'approval', decision: 'allow' })
assert.equal(await pending, 'allowed-once')
assert.equal(desktopCard.last.withdrawn, true)
assert.equal(upstream.signal.aborted, false)
await until('remote ui_prompt_end', () => eventWhere({ event: 'ui_prompt_end', prompt_id: shown.prompt_id, answered_by: 'remote' }))

// Desktop answers first: the remote wait ends.
pending = ctx.waterfall('approval/request', { agent: agentOf('s-recent'), toolName: 'pwsh', callId: 'call-2', signal: new AbortController().signal },
  desktopCard({ ms: 400, value: 'rejected' }))
shown = await promptStart(2)
const localWait = await until('second dialog wait', () => waits().find((wait) => wait.request.prompt_id === shown.prompt_id))
assert.equal(await pending, 'rejected')
assert.equal(desktopCard.last.withdrawn, false)
await until('local ui_prompt_end', () => eventWhere({ event: 'ui_prompt_end', prompt_id: shown.prompt_id, answered_by: 'local' }))
await until('killed dialog wait', () => !alive(localWait.pid))

// An answer of the wrong kind is ignored; Desktop still answers.
pending = ctx.waterfall('approval/request', { agent: agentOf('s-recent'), toolName: 'pwsh', signal: new AbortController().signal },
  desktopCard({ ms: 1500, value: 'rejected' }))
shown = await promptStart(3)
answer(shown.prompt_id, { kind: 'question', answers: [] })
assert.equal(await pending, 'rejected')

// The request is cancelled upstream (the turn ended): the card and wait end.
upstream = new AbortController()
pending = ctx.waterfall('approval/request', { agent: agentOf('s-recent'), toolName: 'pwsh', signal: upstream.signal }, desktopCard())
shown = await promptStart(4)
const cancelledWait = await until('fourth dialog wait', () => waits().find((wait) => wait.request.prompt_id === shown.prompt_id))
upstream.abort()
assert.equal(await pending, 'cancelled')
await until('killed cancelled wait', () => !alive(cancelledWait.pid))
await until('cancelled ui_prompt_end', () => eventWhere({ event: 'ui_prompt_end', prompt_id: shown.prompt_id, answered_by: 'local' }))

// --- questions ------------------------------------------------------------------
const questions = [
  { id: 'db', header: 'Storage', question: 'Which database?', options: [{ label: 'Postgres', description: 'server' }, { label: 'SQLite' }] },
  { id: 'langs', question: 'Which languages?', multiSelect: true, options: [{ label: 'Go' }, { label: 'Rust' }] },
]
pending = ctx.waterfall('user-questions/request', {
  agent: agentOf('s-recent'), questions, wait: { callId: 'call-3', timed: true }, signal: new AbortController().signal,
}, desktopCard())
shown = await promptStart(5)
assert.equal(shown.kind, 'question')
assert.equal(shown.tool_call_id, 'call-3')
assert.equal(shown.timed, true)
assert.deepEqual(shown.questions[0], {
  id: 'db', question: 'Which database?', header: 'Storage', multi_select: false,
  options: [{ label: 'Postgres', description: 'server' }, { label: 'SQLite' }],
})
// A label dsh did not offer is rejected; the plugin waits again after a delay.
answer(shown.prompt_id, { kind: 'question', answers: [{ id: 'db', selected: ['Mongo'] }, { id: 'langs', selected: ['Go'] }] })
await until('rejected answer consumed', () => !existsSync(join(fakeDir, 'answers', `${shown.prompt_id}.json`)))
await sleep(200)
answer(shown.prompt_id, { kind: 'question', answers: [{ id: 'db', selected: ['SQLite'] }, { id: 'langs', selected: ['Go', 'Rust'], custom: 'Zig' }] })
assert.deepEqual(await pending, { answers: [{ id: 'db', selected: ['SQLite'] }, { id: 'langs', selected: ['Go', 'Rust'], custom: 'Zig' }] })
assert.equal(desktopCard.last.withdrawn, true)

// Single-select and fixed-action rules.
const approvalQuestion = [{ id: 'perm', question: 'Allow network?', options: [{ label: 'Allow' }, { label: 'Deny' }], intent: { kind: 'approval', approve: 'Allow', reject: 'Deny' } }]
pending = ctx.waterfall('user-questions/request', { agent: agentOf('s-recent'), questions: approvalQuestion, signal: new AbortController().signal }, desktopCard())
shown = await promptStart(6)
assert.deepEqual(shown.questions[0].intent, { kind: 'approval', approve: 'Allow', reject: 'Deny' })
answer(shown.prompt_id, { kind: 'question', answers: [{ id: 'perm', selected: ['Allow'], custom: 'but only once' }] })
await until('custom answer consumed', () => !existsSync(join(fakeDir, 'answers', `${shown.prompt_id}.json`)))
await sleep(200)
answer(shown.prompt_id, { kind: 'question', answers: [{ id: 'perm', selected: ['Allow'] }] })
assert.deepEqual(await pending, { answers: [{ id: 'perm', selected: ['Allow'] }] })

// A question QuickTUI cannot show in full goes straight to Desktop.
const wide = [{ id: 'many', question: 'Pick', options: Array.from({ length: 65 }, (_, index) => ({ label: `o${index}` })) }]
const before = events().filter((entry) => entry.event === 'ui_prompt_start').length
const direct = await ctx.waterfall('user-questions/request', { agent: agentOf('s-recent'), questions: wide }, () => ({ answers: [{ id: 'many', selected: ['o1'] }] }))
assert.deepEqual(direct, { answers: [{ id: 'many', selected: ['o1'] }] })
await sleep(100)
assert.equal(events().filter((entry) => entry.event === 'ui_prompt_start').length, before)

// --- commands ---------------------------------------------------------------------
const commandWait = await until('command wait', () => waits().find((wait) => wait.mode === 'command'))
assert.deepEqual(commandWait.request, { schema_version: 'ab2.dsh-command-wait.v1', instance_id: start.instance_id })
command({ id: 'cmd-1', kind: 'prompt', agent_session_id: 's-recent', text: 'continue please' })
command({ id: 'cmd-1', kind: 'prompt', agent_session_id: 's-recent', text: 'continue please' })
command({ id: 'cmd-2', kind: 'prompt', agent_session_id: 's-recent', text: '   ' })
command({ id: 'cmd-3', kind: 'interrupt', agent_session_id: 's-recent' })
command({ id: 'cmd-4', kind: 'prompt', agent_session_id: 's-missing', text: 'hello', mode: 'steer' })
await until('cmd-4 failed', () => eventWhere({ event: 'command_failed', command_id: 'cmd-4' }), 30_000)
assert.equal(ctx.prompts.length, 1)
assert.equal(ctx.prompts[0].sessionId, 's-recent')
assert.equal(ctx.prompts[0].mode, 'queue')
assert.deepEqual(ctx.prompts[0].content, [{ type: 'text', text: 'continue please' }])
assert.deepEqual(ctx.cancels, [{ sessionId: 's-recent' }])
assert.ok(eventWhere({ event: 'command_done', command_id: 'cmd-1', command_kind: 'prompt' }))
assert.ok(eventWhere({ event: 'command_done', command_id: 'cmd-3', command_kind: 'interrupt' }))
assert.match(eventWhere({ event: 'command_failed', command_id: 'cmd-4' }).error, /session not found/)
assert.equal(events().filter((entry) => entry.command_id === 'cmd-1').length, 1)
assert.equal(events().some((entry) => entry.command_id === 'cmd-2'), false)

// --- unload ---------------------------------------------------------------------
pending = ctx.waterfall('approval/request', { agent: agentOf('s-recent'), toolName: 'pwsh', signal: new AbortController().signal }, desktopCard({ ms: 1500, value: 'rejected' }))
shown = await promptStart(7)
const unloadWait = await until('unload dialog wait', () => waits().find((wait) => wait.request.prompt_id === shown.prompt_id))
const openCommandWait = await until('open command wait', () => waits().filter((wait) => wait.mode === 'command').at(-1))
ctx.dispose()
await until('plugin_stop', () => eventWhere({ event: 'plugin_stop' }))
await until('waits killed on unload', () => !alive(unloadWait.pid) && !alive(openCommandWait.pid))
// The Desktop card still answers after the plugin is gone.
assert.equal(await pending, 'rejected')

// --- without a hook the mirror still runs and requests go to Desktop ------------
const quietDir = join(fakeDir, 'quiet')
const quiet = new FakeContext(new Map([session('q-1', { events: [event(0, 'session/start')] })]))
let quietHook
const quietBridge = startBridge(quiet, { backfillDays: 30, sidecarDir: quietDir, hook: () => quietHook })
await until('quiet backfill', () => existsSync(join(quietDir, 'q-1.state.json')))
const eventCount = events().length
assert.equal(await quiet.waterfall('approval/request', { agent: agentOf('q-1'), toolName: 'pwsh' }, () => 'allowed-once'), 'allowed-once')
await sleep(100)
assert.equal(events().length, eventCount)
// A server found later: the instance announces itself and starts taking commands.
quietHook = fakeHook
quietBridge.hookChanged()
const quietStart = await until('late plugin_start', () => events().slice(eventCount).find((entry) => entry.event === 'plugin_start'))
assert.equal(quietStart.sidecar_dir, quietDir)
await until('late command wait', () => waits().some((wait) => wait.mode === 'command' && wait.request.instance_id === quietStart.instance_id))
quiet.dispose()
await until('late plugin_stop', () => events().some((entry) => entry.event === 'plugin_stop' && entry.instance_id === quietStart.instance_id))

// --- a process that does not own the sidecar directory skips the backfill -------
const guestDir = join(fakeDir, 'guest')
const guest = new FakeContext(new Map([session('g-1', { events: [event(0, 'session/start')] })]))
startBridge(guest, { backfillDays: 30, sidecarDir: guestDir, hook: () => undefined, backfillAtStart: Promise.resolve(false) })
await sleep(300)
assert.equal(existsSync(join(guestDir, 'g-1.state.json')), false)
// Its own activity still mirrors the Session.
guest.emit('agent/status', { agent: agentOf('g-1'), status: 'idle' })
await until('guest mirror on activity', () => existsSync(join(guestDir, 'g-1.state.json')))
guest.dispose()

// --- a hook that cannot start: requests still settle through Desktop ----------
const broken = new FakeContext(new Map([session('b-1', { events: [event(0, 'session/start')] })]))
startBridge(broken, { hook: () => [join(fakeDir, 'missing', 'quicktui-server')], backfillDays: 30, sidecarDir: join(fakeDir, 'broken') })
await until('broken backfill', () => existsSync(join(fakeDir, 'broken', 'b-1.state.json')))
assert.equal(await broken.waterfall('approval/request', { agent: agentOf('b-1'), toolName: 'pwsh', signal: new AbortController().signal },
  desktopCard({ ms: 300, value: 'allowed-once' })), 'allowed-once')
broken.dispose()

console.log('ok')
process.exit(0)

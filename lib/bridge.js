// The AgentBridge2 bridge (wire contract: PROTOCOL.md).
//
// dsh runs every Session of one Desktop process inside this plugin's host, so
// one plugin instance serves all of them:
// - Each Session is mirrored to <sidecarDir>/<session id>.jsonl (a header line,
//   then dsh's own log events in seq order) so AgentBridge2 can read
//   transcripts without decoding dsh's zstd logs. At startup only Sessions
//   updated within backfillDays are read; an older Session is read in full the
//   first time it shows new activity.
// - Bounded lifecycle metadata goes to a fire-and-forget `ab2hook --agent dsh`
//   process. Events carry no message text; the sidecar holds the transcript.
// - While an approval or a question is open, one `ab2hook --wait-dialog`
//   process waits for a QuickTUI answer. A valid answer withdraws the Desktop
//   card and settles the request; the Desktop card stays the fallback, and the
//   plugin never answers a request by itself.
// - In the dsh process that owns the sidecar directory, one
//   `ab2hook --wait-command` process waits for QuickTUI commands for every
//   Session: prompt queues or steers a message into a Session, interrupt
//   cancels its turn. Each command id runs at most once.
// - Subagent Sessions are neither mirrored nor reported: QuickTUI shows their
//   work inside the parent Session, and their approvals and questions as
//   requests of the parent Session.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, open, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE_VERSION = 'dsh-plugin.v1'
const EVENT_SCHEMA = 'ab2.dsh-plugin-event.v1'
const WAIT_SCHEMA = 'ab2.dsh-dialog-wait.v1'
const ANSWER_SCHEMA = 'ab2.dsh-dialog-answer.v1'
const COMMAND_WAIT_SCHEMA = 'ab2.dsh-command-wait.v1'
const COMMAND_SCHEMA = 'ab2.dsh-command.v1'
const SIDECAR_SCHEMA = 'ab2.dsh-sidecar.v1'

const DAY_MS = 86_400_000
const HELPER_TIMEOUT_MS = 2500
// A wait that ends sooner than this failed (no server yet), so the next one
// waits for a retry delay; a wait that ran this long ended at its limit.
const WAIT_LONG_MS = 60_000
const WAIT_RETRY_MS = [1000, 5000, 15_000, 30_000]
const TRANSCRIPT_DEBOUNCE_MS = 500
const TAIL_CHUNK_BYTES = 65_536
const MAX_OUTPUT_CHARS = 262_144
// AB2 bounds every shown text in UTF-8 bytes, as the phone shows it.
const MAX_TEXT_BYTES = 4096
const MAX_DETAIL_BYTES = 65_536
const MAX_ID_BYTES = 256
const MAX_SESSION_ID_BYTES = 512
const MAX_PATH_BYTES = 4096
// AgentControl's prompt input limit.
const MAX_PROMPT_BYTES = 32_768
const MAX_OPTIONS = 64
const MAX_QUESTIONS = 16
const MAX_LOCALES = 16
const MAX_TOOL_CALLS = 256
const MAX_DONE_COMMANDS = 64

const encoder = new TextEncoder()

// The longest prefix of value within limit UTF-8 bytes, never splitting a
// character.
const bound = (value, limit) => {
  if (typeof value !== 'string') return undefined
  if (value.length * 3 <= limit) return value
  const buffer = new Uint8Array(limit)
  const { read } = encoder.encodeInto(value, buffer)
  return value.slice(0, read)
}

const fits = (value, limit) => typeof value === 'string' && value !== '' && encoder.encode(value).length <= limit

const subagent = (session) => {
  try {
    return session?.header?.origin === 'subagent'
  } catch {
    return false
  }
}

// The Session an agent reports as; undefined for a subagent.
const sessionIdOf = (agent) => {
  try {
    const id = agent?.session?.id
    return id === undefined || subagent(agent.session) ? undefined : bound(String(id), MAX_SESSION_ID_BYTES)
  } catch {
    return undefined
  }
}

// The Session that shows an agent's requests: a subagent's parent.
const requestSessionIdOf = (agent) => {
  try {
    if (!subagent(agent?.session)) return sessionIdOf(agent)
    const parent = agent.session.header.parentSession
    return parent === undefined ? undefined : bound(String(parent), MAX_SESSION_ID_BYTES)
  } catch {
    return undefined
  }
}

const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal.aborted) {
    resolve()
    return
  }
  const done = () => {
    clearTimeout(timer)
    signal.removeEventListener('abort', done)
    resolve()
  }
  const timer = setTimeout(done, ms)
  timer.unref?.()
  signal.addEventListener('abort', done, { once: true })
})

/**
 * Starts the bridge for every Session of this dsh process.
 * @param ctx - the plugin's Cordis context, with sessionQuery and sessionController.
 * @param options.hook - returns the current hook argv prefix, or undefined while
 *   no QuickTUI server is known; read before every hook process.
 * @param options.root - passed to ab2hook as --root when non-empty.
 * @param options.sidecarDir - where Session mirrors are written.
 * @param options.backfillDays - startup backfill window.
 * @param options.owns - resolves whether this dsh process owns the sidecar
 *   directory; asked at startup and before each command wait. Only the owner
 *   does the startup backfill and waits for commands, so a command runs once.
 * @returns hookChanged(), which restarts waits that were idle without a hook.
 */
export function startBridge(ctx, { hook, root = '', sidecarDir, backfillDays, owns = async () => true }) {
  const instanceId = `dsh-${process.pid.toString(36)}-${Date.now().toString(36)}`
  const lifetime = new AbortController()

  const warn = (message) => {
    try { ctx.logger?.warn?.(`[quicktui-dsh] ${message}`) } catch {}
  }

  // argv array with shell disabled: event data never becomes a command line.
  const spawnHook = (extra, stdio) => {
    const command = hook()
    if (!command) throw new Error('no hook')
    const args = command.slice(1).concat(['ab2hook', '--agent', 'dsh'], extra)
    if (root) args.push('--root', root)
    return spawn(command[0], args, { shell: false, stdio, windowsHide: true })
  }

  // Wakes command waits that sleep while no server is known.
  let hookWake = new AbortController()
  let started = false
  const announce = () => send('plugin_start', { pid: process.pid, sidecar_dir: bound(sidecarDir, MAX_PATH_BYTES), backfill_days: backfillDays })
  // A server installed after dsh started still learns about this instance.
  const hookChanged = () => {
    hookWake.abort()
    hookWake = new AbortController()
    if (started) announce()
  }

  let eventTail = Promise.resolve()
  // Set once plugin_stop is queued: an unloaded plugin spawns nothing.
  let stopped = false
  const runHelper = (body) => new Promise((resolve) => {
    let child
    try {
      child = spawnHook(['--source-version', SOURCE_VERSION], ['pipe', 'ignore', 'ignore'])
    } catch {
      resolve()
      return
    }
    let timer
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish()
    }, HELPER_TIMEOUT_MS)
    timer.unref?.()
    child.once('error', finish)
    child.once('close', finish)
    child.stdin.on('error', () => {})
    try {
      child.stdin.end(body + '\n')
    } catch {
      try { child.kill() } catch {}
    }
  })

  const send = (event, fields) => {
    if (!hook() || stopped) return eventTail
    try {
      const body = JSON.stringify({ schema_version: EVENT_SCHEMA, event, instance_id: instanceId, ...fields })
      eventTail = eventTail.then(() => runHelper(body)).catch(() => {})
    } catch {}
    return eventTail
  }

  // One ab2hook process that blocks until AB2 has a result or the wait ends.
  // Resolves with its trimmed stdout ('' without one); never rejects.
  const waitOnce = (mode, request, stop) => new Promise((resolve) => {
    if (stop.aborted) {
      resolve('')
      return
    }
    let child
    try {
      child = spawnHook([mode], ['pipe', 'pipe', 'ignore'])
    } catch {
      resolve('')
      return
    }
    let output = ''
    let finished = false
    const finish = (value) => {
      if (finished) return
      finished = true
      stop.removeEventListener('abort', onStop)
      resolve(value)
    }
    const onStop = () => {
      try { child.kill() } catch {}
      finish('')
    }
    stop.addEventListener('abort', onStop, { once: true })
    child.once('error', () => finish(''))
    child.once('close', () => finish(output.trim()))
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      output += chunk
      if (output.length > MAX_OUTPUT_CHARS) onStop()
    })
    child.stdin.on('error', () => {})
    try {
      child.stdin.end(JSON.stringify(request) + '\n')
    } catch {
      onStop()
    }
  })

  // Waits until accept(output) returns a value or stop aborts. A wait that
  // ends quickly without an accepted result (no server, a rejected answer)
  // backs off; one that ran to its limit restarts at once.
  const waitUntil = async (mode, request, stop, accept) => {
    let failures = 0
    while (!stop.aborted) {
      const started = Date.now()
      const output = await waitOnce(mode, request, stop)
      if (stop.aborted) return undefined
      if (output !== '') {
        let parsed
        try { parsed = JSON.parse(output) } catch {}
        const value = parsed === undefined ? undefined : accept(parsed)
        if (value !== undefined) return value
      }
      if (Date.now() - started >= WAIT_LONG_MS) {
        failures = 0
        continue
      }
      await sleep(WAIT_RETRY_MS[Math.min(failures, WAIT_RETRY_MS.length - 1)], stop)
      failures++
    }
    return undefined
  }

  // ---- sidecar mirror ------------------------------------------------------

  const sidecarPath = (sessionId) => join(sidecarDir, `${sessionId}.jsonl`)
  const statePath = (sessionId) => join(sidecarDir, `${sessionId}.state.json`)
  const lastSeq = new Map()
  const chains = new Map()
  const transcriptTimers = new Map()

  // Session ids name files: anything but a plain id is not mirrored.
  const mirrorable = (sessionId) => typeof sessionId === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(sessionId) &&
    sessionId !== '.' && sessionId !== '..'

  const serialize = (sessionId, task) => {
    const next = (chains.get(sessionId) ?? Promise.resolve()).then(task).catch((error) => {
      warn(`sidecar ${sessionId}: ${error?.message ?? error}`)
    })
    chains.set(sessionId, next)
    next.then(() => {
      if (chains.get(sessionId) === next) chains.delete(sessionId)
    })
    return next
  }

  // The sidecar itself is the writer's record: a crash between an append and
  // its state write must not append the same events twice. Returns the seq of
  // the last complete line (-1 for the header alone), cutting a torn last
  // line, or undefined when there is no sidecar of this schema.
  const recoverTail = async (sessionId) => {
    let file
    try {
      file = await open(sidecarPath(sessionId), 'r+')
    } catch {
      return undefined
    }
    try {
      const { size } = await file.stat()
      const head = Buffer.alloc(Math.min(size, 4096))
      await file.read(head, 0, head.length, 0)
      if (!head.toString('utf8').startsWith(`{"type":"ab2/sidecar","schema_version":"${SIDECAR_SCHEMA}"`)) return undefined
      // Find the last newline, then the one before it: the last complete line.
      const newlines = []
      let end = size
      while (end > 0 && newlines.length < 2) {
        const start = Math.max(0, end - TAIL_CHUNK_BYTES)
        const chunk = Buffer.alloc(end - start)
        await file.read(chunk, 0, chunk.length, start)
        for (let index = chunk.length - 1; index >= 0 && newlines.length < 2; index--) {
          if (chunk[index] === 0x0a) newlines.push(start + index)
        }
        end = start
      }
      if (newlines.length === 0) return undefined
      if (newlines[0] !== size - 1) await file.truncate(newlines[0] + 1)
      const lineStart = newlines.length > 1 ? newlines[1] + 1 : 0
      const line = Buffer.alloc(newlines[0] - lineStart)
      await file.read(line, 0, line.length, lineStart)
      const last = JSON.parse(line.toString('utf8'))
      return last.type === 'ab2/sidecar' ? -1 : Number.isInteger(last.seq) ? last.seq : undefined
    } catch {
      return undefined
    } finally {
      await file.close()
    }
  }

  const readState = async (sessionId) => {
    if (lastSeq.has(sessionId)) return lastSeq.get(sessionId)
    const seq = await recoverTail(sessionId)
    if (seq !== undefined) lastSeq.set(sessionId, seq)
    return seq
  }

  const writeState = async (sessionId, seq) => {
    const temp = `${statePath(sessionId)}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify({ schema_version: SIDECAR_SCHEMA, last_seq: seq, updated_at: Date.now() }))
    await rename(temp, statePath(sessionId))
    lastSeq.set(sessionId, seq)
  }

  const announceTranscript = (sessionId) => {
    clearTimeout(transcriptTimers.get(sessionId))
    const timer = setTimeout(() => {
      transcriptTimers.delete(sessionId)
      if (lifetime.signal.aborted) return
      send('transcript_updated', { agent_session_id: sessionId, last_seq: lastSeq.get(sessionId), sidecar_path: bound(sidecarPath(sessionId), MAX_PATH_BYTES) })
    }, TRANSCRIPT_DEBOUNCE_MS)
    timer.unref?.()
    transcriptTimers.set(sessionId, timer)
  }

  // Appends the events above the recorded seq. A Session without a sidecar
  // starts a fresh file with the header line.
  const appendEvents = async (sessionId, events, header) => {
    const known = await readState(sessionId)
    const fresh = events
      .filter((event) => Number.isInteger(event?.seq) && (known === undefined || event.seq > known))
      .sort((a, b) => a.seq - b.seq)
    if (fresh.length === 0 && (known !== undefined || !header)) return
    await mkdir(sidecarDir, { recursive: true })
    const lines = []
    if (known === undefined) {
      lines.push(JSON.stringify({ type: 'ab2/sidecar', schema_version: SIDECAR_SCHEMA, session: header ?? null }))
    }
    let top = known ?? -1
    for (const event of fresh) {
      if (event.seq <= top) continue
      lines.push(JSON.stringify(event))
      top = event.seq
    }
    if (known === undefined) await writeFile(sidecarPath(sessionId), lines.join('\n') + '\n')
    else await appendFile(sidecarPath(sessionId), lines.join('\n') + '\n')
    await writeState(sessionId, top)
    announceTranscript(sessionId)
  }

  // A full read through dsh's own reader, which owns its format migrations.
  const catchUp = async (sessionId) => {
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    await appendEvents(sessionId, snapshot?.events ?? [], snapshot?.session)
  }

  const backfill = (sessionId) => {
    if (!mirrorable(sessionId)) return Promise.resolve()
    return serialize(sessionId, () => catchUp(sessionId))
  }

  const backfillRecent = async () => {
    const cutoff = Date.now() - backfillDays * DAY_MS
    const { items } = await ctx.sessionController.list({}, lifetime.signal)
    const recent = items.filter((item) => item.origin !== 'subagent' && !item.blank && item.updatedAt >= cutoff)
    let done = 0
    for (const item of recent) {
      if (lifetime.signal.aborted) return
      await backfill(String(item.sessionId))
      done++
    }
    send('backfill_done', { sessions: done, total: items.length, backfill_days: backfillDays })
  }

  // Approval requests carry only the tool call id; the arguments come from the
  // tool/call event logged just before.
  const toolArguments = new Map()
  const rememberToolCall = (event) => {
    if (event?.type !== 'tool/call' || typeof event.data?.callId !== 'string') return
    toolArguments.set(event.data.callId, bound(String(event.data.arguments ?? ''), MAX_TEXT_BYTES))
    if (toolArguments.size > MAX_TOOL_CALLS) toolArguments.delete(toolArguments.keys().next().value)
  }

  ctx.on('session/event', (session, event) => {
    let sessionId
    try { sessionId = String(session.id) } catch { return }
    if (subagent(session)) return
    rememberToolCall(event)
    if (mirrorable(sessionId) && Number.isInteger(event?.seq)) {
      serialize(sessionId, async () => {
        // Some appends (for example the session/end-seed written while Desktop
        // reopens a Session) never reach session/event, so a seq gap, like a
        // Session without a sidecar, takes a full read first.
        const known = await readState(sessionId)
        if (known === undefined || event.seq > known + 1) await catchUp(sessionId)
        await appendEvents(sessionId, [event])
      })
    }
    if (event?.type === 'turn/start') {
      send('turn_start', { agent_session_id: bound(sessionId, MAX_SESSION_ID_BYTES), seq: event.seq })
    } else if (event?.type === 'turn/end') {
      send('turn_end', { agent_session_id: bound(sessionId, MAX_SESSION_ID_BYTES), seq: event.seq, reason: bound(event.data?.reason?.kind, MAX_ID_BYTES) })
    }
  })

  ctx.on('agent/status', (payload) => {
    const sessionId = sessionIdOf(payload?.agent)
    if (!sessionId) return
    send('session_status', { agent_session_id: sessionId, status: bound(payload.status, MAX_ID_BYTES) })
    // Idle is the last chance to pick up a trailing append that never reached
    // session/event.
    if (payload.status === 'idle') void backfill(sessionId)
  })

  ctx.on('agent/created', (payload) => {
    const sessionId = sessionIdOf(payload?.agent)
    if (sessionId) void backfill(sessionId)
    return undefined
  })

  // ---- approvals and questions ---------------------------------------------

  const promptPrefix = `dsh-${process.pid.toString(36)}-${Date.now().toString(36)}`
  let promptCounter = 0
  const answerWaits = new Set()

  // The next waterfall answerer is the Desktop forwarder, which hands
  // request.signal to its card and withdraws the card when that signal aborts.
  // The approval and question services keep their own copy of the original
  // signal, so aborting the replacement only withdraws the card.
  const race = async (kind, request, next, fields, toResult) => {
    const sessionId = requestSessionIdOf(request?.agent)
    if (!hook() || !sessionId || request.signal?.aborted) return next()
    const withdraw = new AbortController()
    const upstream = request.signal
    const replacement = upstream ? AbortSignal.any([upstream, withdraw.signal]) : withdraw.signal
    try { request.signal = replacement } catch {}
    // Without a withdrawable card a remote answer would leave the card open.
    if (request.signal !== replacement) return next()

    const promptId = `${promptPrefix}-${++promptCounter}`
    const stop = new AbortController()
    const stops = upstream ? [lifetime.signal, stop.signal, upstream] : [lifetime.signal, stop.signal]
    answerWaits.add(stop)
    send('ui_prompt_start', { agent_session_id: sessionId, prompt_id: promptId, kind, ...fields })
    const local = Promise.resolve().then(next).then(
      (value) => ({ by: 'local', value }),
      (error) => ({ by: 'local', error }),
    )
    const remote = waitUntil('--wait-dialog', { schema_version: WAIT_SCHEMA, agent_session_id: sessionId, prompt_id: promptId },
      AbortSignal.any(stops), (answer) => (answer?.schema_version === ANSWER_SCHEMA && answer.kind === kind ? toResult(answer) : undefined))
      .then((value) => (value === undefined ? new Promise(() => {}) : { by: 'remote', value }))
    const winner = await Promise.race([local, remote])
    stop.abort()
    answerWaits.delete(stop)
    if (winner.by === 'remote') withdraw.abort()
    send('ui_prompt_end', { agent_session_id: sessionId, prompt_id: promptId, kind, answered_by: winner.by })
    if (winner.error) throw winner.error
    return winner.value
  }

  const localized = (value) => {
    if (!value || typeof value !== 'object') return undefined
    const result = {}
    for (const [locale, text] of Object.entries(value).slice(0, MAX_LOCALES)) {
      if (fits(locale, MAX_ID_BYTES) && typeof text === 'string') result[locale] = bound(text, MAX_TEXT_BYTES)
    }
    return Object.keys(result).length > 0 ? result : undefined
  }

  ctx.on('approval/request', (request, next) => race('approval', request, next, {
    tool_name: bound(request.toolName, MAX_ID_BYTES),
    tool_call_id: bound(request.callId, MAX_ID_BYTES),
    reason: bound(request.reason, MAX_TEXT_BYTES),
    display_reason: localized(request.displayReason),
    tool_arguments: typeof request.callId === 'string' ? toolArguments.get(request.callId) : undefined,
  }, (answer) => {
    if (answer.decision === 'allow') return 'allowed-once'
    if (answer.decision === 'reject') return 'rejected'
    return undefined
  }), { prepend: true })

  const questionIntent = (intent) => {
    if (!intent || typeof intent.kind !== 'string') return undefined
    return {
      kind: bound(intent.kind, MAX_ID_BYTES),
      approve: bound(intent.approve, MAX_TEXT_BYTES),
      reject: bound(intent.reject, MAX_TEXT_BYTES),
      always: bound(intent.always, MAX_TEXT_BYTES),
    }
  }

  // Questions QuickTUI can show in full: every id and label within its bound,
  // so a remote answer names exactly what dsh asked.
  const answerableQuestions = (questions) => Array.isArray(questions) && questions.length > 0 &&
    questions.length <= MAX_QUESTIONS && questions.every((question) => fits(question?.id, MAX_ID_BYTES) &&
      (question.options === undefined || (Array.isArray(question.options) && question.options.length <= MAX_OPTIONS &&
        question.options.every((option) => fits(option?.label, MAX_TEXT_BYTES)))))

  const toAnswer = (questions) => (answer) => {
    if (!Array.isArray(answer.answers) || answer.answers.length !== questions.length) return undefined
    const result = []
    for (const question of questions) {
      const matches = answer.answers.filter((item) => item?.id === question.id)
      if (matches.length !== 1) return undefined
      const item = matches[0]
      const labels = (question.options ?? []).map((option) => option.label)
      if (!Array.isArray(item.selected) || !item.selected.every((label) => typeof label === 'string' && labels.includes(label))) return undefined
      if (new Set(item.selected).size !== item.selected.length) return undefined
      if (question.multiSelect !== true && item.selected.length > 1) return undefined
      const custom = typeof item.custom === 'string' && item.custom.trim() !== '' ? item.custom : undefined
      if (item.custom !== undefined && typeof item.custom !== 'string') return undefined
      // Fixed-action cards take one of their actions and no free text.
      if (question.intent?.kind === 'approval' && (custom !== undefined || item.selected.length !== 1)) return undefined
      if (item.selected.length === 0 && custom === undefined) return undefined
      result.push({ id: question.id, selected: item.selected.slice(), ...(custom === undefined ? {} : { custom }) })
    }
    return { answers: result }
  }

  ctx.on('user-questions/request', (request, next) => {
    const questions = request?.questions
    if (!answerableQuestions(questions)) return next()
    return race('question', request, next, {
      tool_call_id: bound(request.wait?.callId, MAX_ID_BYTES),
      timed: request.wait?.timed === true,
      questions: questions.map((question) => ({
        id: question.id,
        question: bound(question.question, MAX_TEXT_BYTES),
        detail: bound(question.detail, MAX_DETAIL_BYTES),
        header: bound(question.header, MAX_TEXT_BYTES),
        multi_select: question.multiSelect === true,
        intent: questionIntent(question.intent),
        options: (question.options ?? []).map((option) => ({
          label: option.label,
          description: bound(option.description, MAX_TEXT_BYTES),
        })),
      })),
    }, toAnswer(questions))
  }, { prepend: true })

  // ---- commands --------------------------------------------------------------

  const doneCommands = []

  const parseCommand = (command) => {
    if (command?.schema_version !== COMMAND_SCHEMA || !fits(command.command_id, MAX_ID_BYTES) ||
        !fits(command.agent_session_id, MAX_SESSION_ID_BYTES)) return undefined
    const id = command.command_id
    if (command.kind === 'interrupt') return { id, kind: 'interrupt', sessionId: command.agent_session_id }
    if (command.kind === 'prompt' && fits(command.text, MAX_PROMPT_BYTES) && command.text.trim() !== '' &&
        (command.mode === undefined || command.mode === 'queue' || command.mode === 'steer')) {
      return { id, kind: 'prompt', sessionId: command.agent_session_id, text: command.text, mode: command.mode ?? 'queue' }
    }
    return undefined
  }

  const runCommand = (command) => {
    if (command.kind === 'interrupt') return ctx.sessionController.cancel({ sessionId: command.sessionId })
    return ctx.sessionController.prompt({
      requestId: randomUUID(),
      sessionId: command.sessionId,
      mode: command.mode,
      content: [{ type: 'text', text: command.text }],
    }, lifetime.signal)
  }

  const commandLoop = async () => {
    while (!lifetime.signal.aborted) {
      // A non-owner takes over once the owner's dsh process exits.
      if (!hook() || !(await owns().catch(() => false))) {
        await sleep(WAIT_LONG_MS, AbortSignal.any([lifetime.signal, hookWake.signal]))
        continue
      }
      const command = await waitUntil('--wait-command',
        { schema_version: COMMAND_WAIT_SCHEMA, channel_id: instanceId, process_id: process.pid },
        lifetime.signal, parseCommand)
      if (!command) {
        if (lifetime.signal.aborted) return
        continue
      }
      if (doneCommands.includes(command.id)) continue
      doneCommands.push(command.id)
      if (doneCommands.length > MAX_DONE_COMMANDS) doneCommands.shift()
      const fields = { command_id: command.id, command_kind: command.kind, agent_session_id: command.sessionId }
      // A prompt resumes a cold Session first; the next command need not wait.
      Promise.resolve().then(() => runCommand(command)).then(
        () => send('command_done', fields),
        (error) => send('command_failed', { ...fields, error: bound(String(error?.message ?? error), MAX_TEXT_BYTES) }),
      )
    }
  }

  ctx.effect(() => () => {
    lifetime.abort()
    for (const timer of transcriptTimers.values()) clearTimeout(timer)
    transcriptTimers.clear()
    for (const stop of answerWaits) stop.abort()
    send('plugin_stop', {})
    stopped = true
  }, 'quicktui-dsh.bridge')

  // Start once the loader has mounted every service the plugin reads.
  void (async () => {
    try {
      await ctx.get?.('loader')?.await?.()
    } catch {}
    if (lifetime.signal.aborted) return
    started = true
    announce()
    if (await owns().catch(() => false)) backfillRecent().catch((error) => warn(`backfill: ${error?.message ?? error}`))
    commandLoop().catch((error) => warn(`commands: ${error?.message ?? error}`))
  })()

  return { hookChanged }
}

// Fake `quicktui-server ab2hook --agent dsh` for the dsh plugin node test.
// AB2_FAKE_DIR holds its state:
//   events.log       one {argv, body} line per fire-and-forget event
//   waits.log        one {mode, pid, request} line per wait process
//   answers/<prompt id>.json   printed (and removed) by --wait-dialog
//   commands/*.json            printed (and removed, oldest first) by --wait-command
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.AB2_FAKE_DIR
const argv = process.argv.slice(2)
const mode = argv.includes('--wait-dialog') ? 'dialog' : argv.includes('--wait-command') ? 'command' : 'event'

let input = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) input += chunk

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (mode === 'event') {
  appendFileSync(join(dir, 'events.log'), JSON.stringify({ argv, body: JSON.parse(input) }) + '\n')
  process.exit(0)
}

const request = JSON.parse(input)
appendFileSync(join(dir, 'waits.log'), JSON.stringify({ mode, pid: process.pid, request }) + '\n')

const take = (file) => {
  const content = readFileSync(file, 'utf8')
  rmSync(file, { force: true })
  process.stdout.write(content.trim() + '\n')
  process.exit(0)
}

if (mode === 'dialog') {
  const answers = join(dir, 'answers')
  mkdirSync(answers, { recursive: true })
  const file = join(answers, `${request.prompt_id}.json`)
  for (;;) {
    if (existsSync(file)) take(file)
    await sleep(25)
  }
}

const commands = join(dir, 'commands')
mkdirSync(commands, { recursive: true })
for (;;) {
  const names = readdirSync(commands).filter((name) => name.endsWith('.json')).sort()
  if (names.length > 0) take(join(commands, names[0]))
  await sleep(25)
}

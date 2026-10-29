import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const SCRIPT = fileURLToPath(new URL('../scripts/sync-public-repo.sh', import.meta.url))
const PREFIX = 'integrations/quicktui-dsh'
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
}

const sandbox = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quicktui-dsh-sync-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const repo = join(dir, 'mono')
  const env = { ...process.env, ...IDENTITY }
  const run = (cmd, args, options = {}) => {
    const result = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', ...options, env: { ...env, ...options.env } })
    if (options.allowFailure) return result
    assert.equal(result.status, 0, `${cmd} ${args.join(' ')}\n${result.stdout}${result.stderr}`)
    return result.stdout.trim()
  }
  const git = (...args) => run('git', args)
  mkdirSync(join(repo, PREFIX), { recursive: true })
  git('init', '-q', '-b', 'develop')
  let tick = 0
  // Fixed, increasing dates keep the rebuilt public commits reproducible.
  const commit = (message) => {
    const date = `2026-01-01T00:00:${String(tick++).padStart(2, '0')}Z`
    git('add', '-A')
    run('git', ['commit', '-q', '-m', message], { env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
    return git('rev-parse', 'HEAD')
  }
  const writePlugin = (version, body) => {
    writeFileSync(join(repo, PREFIX, 'package.json'), `{\n  "name": "quicktui-dsh",\n  "version": "${version}",\n  "x": 1\n}\n`)
    writeFileSync(join(repo, PREFIX, 'body.txt'), body)
  }
  const publicRepo = join(dir, 'public.git')
  run('git', ['init', '-q', '--bare', publicRepo])
  const sync = (ref, version, extra = {}) => run('bash', [SCRIPT, ref, ...(version ? [version] : [])], {
    env: { QUICKTUI_DSH_PUBLIC_REMOTE: publicRepo }, ...extra,
  })
  const publicMain = () => run('git', ['rev-parse', 'main'], { cwd: publicRepo })
  return { dir, repo, git, commit, writePlugin, publicRepo, sync, publicMain, run }
}

test('appends to the public main after a merge commit folds earlier commits', (t) => {
  const { repo, git, commit, writePlugin, sync, publicMain, publicRepo, run } = sandbox(t)
  writePlugin('0.1.0', 'one\n')
  const first = commit('add plugin')
  writePlugin('0.1.0', 'two\n')
  commit('plugin two')
  writePlugin('0.1.0', 'three\n')
  commit('plugin three')
  sync('develop', '0.1.0')
  const published = publicMain()

  // A group branch from before the plugin changes merges develop and then
  // fast-forwards develop: the merge commit lands on the first-parent chain.
  git('checkout', '-q', '-b', 'group', first)
  writeFileSync(join(repo, 'other.txt'), 'outside\n')
  commit('change outside the plugin')
  git('merge', '-q', '--no-ff', '-m', 'merge develop into group', 'develop')
  git('checkout', '-q', 'develop')
  git('merge', '-q', '--ff-only', 'group')
  writePlugin('0.1.1', 'four\n')
  const source = commit('plugin four')

  sync('develop', '0.1.1')
  const appended = publicMain()
  assert.equal(git('rev-parse', `${appended}^`), published, 'one commit appended to the old public main')
  assert.equal(git('rev-parse', `${appended}^{tree}`), git('rev-parse', `${source}:${PREFIX}`))
  assert.equal(git('log', '-1', '--format=%s', appended), 'plugin four')
  assert.equal(run('git', ['rev-parse', 'v0.1.1'], { cwd: publicRepo }), appended)

  sync('develop')
  assert.equal(publicMain(), appended, 'a repeated sync adds no commit')
})

test('stops without pushing when the public main tree is not on the source history', (t) => {
  const { dir, commit, writePlugin, sync, publicMain, publicRepo, run } = sandbox(t)
  const other = join(dir, 'other')
  mkdirSync(other)
  run('git', ['init', '-q', '-b', 'main'], { cwd: other })
  run('git', ['commit', '-q', '--allow-empty', '-m', 'unrelated'], { cwd: other })
  run('git', ['push', '-q', publicRepo, 'main'], { cwd: other })
  const unrelated = publicMain()
  writePlugin('0.1.0', 'one\n')
  commit('add plugin')

  const result = sync('develop', '0.1.0', { allowFailure: true })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /is not on the first-parent history/)
  assert.equal(publicMain(), unrelated)
})

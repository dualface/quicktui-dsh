import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// The runner kills its wait processes and exits; a child process keeps a
// failure from leaving them attached to the test runner.
test('bridge against a fake host and a fake ab2hook', () => {
  const fakeDir = mkdtempSync(join(tmpdir(), 'quicktui-dsh-bridge-'))
  try {
    const runner = join(dirname(fileURLToPath(import.meta.url)), 'bridge-runner.mjs')
    const result = spawnSync(process.execPath, [runner], { env: { ...process.env, AB2_FAKE_DIR: fakeDir }, encoding: 'utf8', timeout: 120_000 })
    assert.equal(result.stdout.trim(), 'ok', `${result.stdout}\n${result.stderr}`)
  } finally {
    rmSync(fakeDir, { recursive: true, force: true })
  }
})

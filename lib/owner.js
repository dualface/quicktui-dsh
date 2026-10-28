// The desktop and web profiles can run this plugin at the same time against
// one sidecar directory. A pid file elects the process that does the startup
// backfill so the two do not rewrite the same sidecars together.
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return error?.code === 'EPERM'
  }
}

/**
 * Claims <dir>/owner.pid for this process.
 * @returns a release function when this process owns the directory, else undefined.
 */
export async function claimOwner(dir) {
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'owner.pid')
  const mine = String(process.pid)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx')
      try { await handle.writeFile(mine) } finally { await handle.close() }
      return async () => {
        try {
          if ((await readFile(path, 'utf8')).trim() === mine) await unlink(path)
        } catch {}
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    let holder = NaN
    try { holder = Number((await readFile(path, 'utf8')).trim()) } catch {}
    // A reused pid keeps a stale file alive; the cost is one missed backfill,
    // which the first activity of each Session repairs.
    if (Number.isInteger(holder) && holder > 0 && holder !== process.pid && alive(holder)) return undefined
    try { await unlink(path) } catch {}
  }
  return undefined
}

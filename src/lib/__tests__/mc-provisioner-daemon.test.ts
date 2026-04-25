import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const PROVISIONER_PATH = path.join(process.cwd(), 'ops', 'mc-provisioner-daemon.js')

async function waitForSocket(socketPath: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fs.access(socketPath)
      return
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for socket: ${socketPath}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
}

function sendJsonLine(socketPath: string, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath)
    let response = ''

    client.on('connect', () => {
      client.write(`${JSON.stringify(payload)}\n`)
    })

    client.on('data', (chunk) => {
      response += chunk.toString('utf8')
    })

    client.on('error', (err) => {
      reject(err)
    })

    client.on('end', () => {
      const line = response.trim()
      if (!line) {
        reject(new Error('No response from provisioner'))
        return
      }
      resolve(JSON.parse(line) as Record<string, unknown>)
    })
  })
}

describe('mc-provisioner-daemon input limits', () => {
  let child: ReturnType<typeof spawn> | null = null
  let tmpDir = ''

  afterEach(async () => {
    if (child) {
      child.kill('SIGTERM')
      await new Promise((resolve) => child?.once('exit', () => resolve(undefined)))
      child = null
    }
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true })
      tmpDir = ''
    }
  })

  it('rejects over-size request payloads before processing', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-provisioner-test-'))
    const socketPath = path.join(tmpDir, 'provisioner.sock')

    child = spawn(process.execPath, [PROVISIONER_PATH], {
      env: {
        ...process.env,
        MC_PROVISIONER_TOKEN: 'test-token',
        MC_PROVISIONER_SOCKET: socketPath,
        MC_PROVISIONER_MAX_INPUT_BYTES: '1024',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    await waitForSocket(socketPath)

    const response = await sendJsonLine(socketPath, {
      token: 'test-token',
      command: 'true',
      args: [],
      padding: 'x'.repeat(4 * 1024),
    })

    expect(response.ok).toBe(false)
    expect(response.code).toBe('PROVISIONER_INPUT_TOO_LARGE')
    expect(response.error).toBe('Request payload too large')
  }, 15000)
})

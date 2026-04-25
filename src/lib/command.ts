import { spawn } from 'node:child_process'
import { config } from './config'

interface CommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
  onData?: (chunk: string) => void
}

interface CommandResult {
  stdout: string
  stderr: string
  code: number | null
}

const SHELL_INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'cmd', 'powershell', 'pwsh'])
const SHELL_INLINE_FLAGS = new Set(['-c', '/c', '-Command', '-command', '-EncodedCommand', '-encodedcommand'])

export class CommandValidationError extends Error {
  readonly code = 'COMMAND_VALIDATION_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'CommandValidationError'
  }
}

function getCommandBasename(command: string): string {
  const normalized = command.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return (parts[parts.length - 1] || '').toLowerCase()
}

function assertSafeCommandInvocation(command: string, args: string[]): void {
  if (typeof command !== 'string' || !command.trim()) {
    throw new CommandValidationError('Executable is required')
  }

  if (/\s/.test(command) || /[|&;<>`$\n\r]/.test(command)) {
    throw new CommandValidationError('Executable contains unsupported characters')
  }

  const basename = getCommandBasename(command)
  if (SHELL_INTERPRETERS.has(basename)) {
    const hasInlineShellPayload = args.some((arg) => SHELL_INLINE_FLAGS.has(String(arg)))
    if (hasInlineShellPayload) {
      throw new CommandValidationError('Shell interpreter inline execution is not allowed')
    }
  }
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  assertSafeCommandInvocation(command, args)

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let timeoutId: NodeJS.Timeout | undefined

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL')
      }, options.timeoutMs)
    }

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      options.onData?.(chunk)
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      options.onData?.(chunk)
    })

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId)
      reject(error)
    })

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      const error = new Error(
        `Command failed with exit code ${String(code)}: ${stderr || stdout}`
      )
      ;(error as any).stdout = stdout
      ;(error as any).stderr = stderr
      ;(error as any).code = code
      reject(error)
    })

    if (options.input) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}

export function runOpenClaw(args: string[], options: CommandOptions = {}) {
  // Explicitly pass OPENCLAW_STATE_DIR so the CLI uses the exact resolved path.
  // Without this, the CLI may interpret OPENCLAW_HOME as a parent directory and
  // append ".openclaw" to it — causing double-nesting when OPENCLAW_HOME is
  // already set to the state directory (e.g. /root/.openclaw → /root/.openclaw/.openclaw).
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCLAW_STATE_DIR: config.openclawStateDir,
    ...options.env,
  }
  return runCommand(config.openclawBin, args, {
    ...options,
    env,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}

export function runClawdbot(args: string[], options: CommandOptions = {}) {
  return runCommand(config.clawdbotBin, args, {
    ...options,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}

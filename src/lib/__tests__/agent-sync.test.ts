import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('removeAgentFromConfig', () => {
  const originalEnv = { ...process.env }
  let tempDir = ''

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  })

  it('removes matching agent entries by id and display name', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          agents: {
            list: [
              { id: 'jarv', name: 'jarv', identity: { name: 'jarv' } },
              { id: 'neo', identity: { name: 'Neo' } },
              { id: 'keep-me', name: 'keep-me', identity: { name: 'keep-me' } },
            ],
          },
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    )

    process.env.OPENCLAW_CONFIG_PATH = configPath
    process.env.OPENCLAW_STATE_DIR = tempDir

    const { removeAgentFromConfig } = await import('@/lib/agent-sync')
    const result = await removeAgentFromConfig({ id: 'neo', name: 'Neo' })

    expect(result.removed).toBe(true)
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(parsed.agents.list).toEqual([
      { id: 'jarv', name: 'jarv', identity: { name: 'jarv' } },
      { id: 'keep-me', name: 'keep-me', identity: { name: 'keep-me' } },
    ])
  })

  it('is a no-op when no matching agent entry exists', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    writeFileSync(
      configPath,
      JSON.stringify({ agents: { list: [{ id: 'keep-me', name: 'keep-me' }] } }, null, 2) + '\n',
      'utf-8',
    )

    process.env.OPENCLAW_CONFIG_PATH = configPath
    process.env.OPENCLAW_STATE_DIR = tempDir

    const { removeAgentFromConfig } = await import('@/lib/agent-sync')
    const result = await removeAgentFromConfig({ id: 'missing', name: 'missing' })

    expect(result.removed).toBe(false)
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(parsed.agents.list).toEqual([{ id: 'keep-me', name: 'keep-me' }])
  })

  it('normalizes nested model.primary payloads when writing config', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        agents: {
          list: [
            {
              id: 'neo',
              model: {
                primary: {
                  primary: 'anthropic/claude-sonnet-4-20250514',
                },
                fallbacks: ['openai/codex-mini-latest', 'openai/codex-mini-latest'],
              },
            },
          ],
        },
      }, null, 2) + '\n',
      'utf-8',
    )

    process.env.OPENCLAW_CONFIG_PATH = configPath
    process.env.OPENCLAW_STATE_DIR = tempDir

    const { writeAgentToConfig } = await import('@/lib/agent-sync')
    await writeAgentToConfig({
      id: 'neo',
      model: {
        primary: {
          primary: 'anthropic/claude-sonnet-4-20250514',
        },
        fallbacks: ['openrouter/anthropic/claude-sonnet-4'],
      },
    })

    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(parsed.agents.list[0].model).toEqual({
      primary: 'anthropic/claude-sonnet-4-20250514',
      fallbacks: ['openrouter/anthropic/claude-sonnet-4'],
    })
  })

  it('does not treat prose bullets in TOOLS.md as tool allowlist entries', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const workspace = path.join(tempDir, 'workspace')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(
      path.join(workspace, 'TOOLS.md'),
      [
        '# TOOLS.md',
        '',
        '## Review Heuristics',
        '- Passing tests are strong evidence, but not proof that the right thing was tested',
        '- A green build does not erase user-visible regressions',
      ].join('\n'),
      'utf-8',
    )

    process.env.OPENCLAW_CONFIG_PATH = path.join(tempDir, 'openclaw.json')
    process.env.OPENCLAW_STATE_DIR = tempDir

    const { enrichAgentConfigFromWorkspace } = await import('@/lib/agent-sync')
    const enriched = enrichAgentConfigFromWorkspace({ workspace })

    expect(enriched.tools?.allow).toBeUndefined()
    expect(enriched.tools?.raw).toContain('Passing tests are strong evidence')
  })

  it('parses only tool-like selectors from TOOLS.md', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const workspace = path.join(tempDir, 'workspace')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(
      path.join(workspace, 'TOOLS.md'),
      [
        '# TOOLS.md',
        '',
        '- `read`',
        '- group:fs',
        '- memory_search',
        '- not a prose sentence',
      ].join('\n'),
      'utf-8',
    )

    process.env.OPENCLAW_CONFIG_PATH = path.join(tempDir, 'openclaw.json')
    process.env.OPENCLAW_STATE_DIR = tempDir

    const { enrichAgentConfigFromWorkspace } = await import('@/lib/agent-sync')
    const enriched = enrichAgentConfigFromWorkspace({ workspace })

    expect(enriched.tools?.allow).toEqual(['read', 'group:fs', 'memory_search'])
  })

  it('strips presentation-only and invalid tool entries before writing openclaw config', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    writeFileSync(configPath, JSON.stringify({ agents: { list: [] } }, null, 2) + '\n', 'utf-8')

    process.env.OPENCLAW_CONFIG_PATH = configPath
    process.env.OPENCLAW_STATE_DIR = tempDir

    const { writeAgentToConfig } = await import('@/lib/agent-sync')
    await writeAgentToConfig({
      id: 'aegis',
      model: { primary: 'openai-codex/gpt-5.4' },
      tools: {
        allow: ['read', 'this is prose, not a tool'],
        deny: ['group:fs', 'definitely not a tool name'],
        alsoAllow: ['memory_search'],
        raw: '# TOOLS.md\n- guidance only',
        profile: 'minimal',
        exec: { ask: 'off' },
      },
    })

    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(parsed.agents.list[0].tools).toEqual({
      allow: ['read'],
      deny: ['group:fs'],
      profile: 'minimal',
      exec: { ask: 'off' },
    })
  })
})

describe('syncAgentsFromConfig', () => {
  const originalEnv = { ...process.env }
  let tempDir = ''

  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  })

  it('updates an existing agent row when the synced display name changes but the session key is stable', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-agent-sync-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    const workspace = path.join(tempDir, 'workspace')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(path.join(workspace, 'soul.md'), '# Soul\nsynced soul\n', 'utf-8')
    writeFileSync(
      configPath,
      JSON.stringify({
        agents: {
          list: [
            {
              id: 'product-line-a-platform-dev',
              name: 'Product Line A Platform Dev',
              workspace,
              agentDir: path.join(tempDir, 'agent'),
              model: { primary: 'openai-codex/gpt-5.4' },
              identity: {
                name: 'Product Line A Platform Dev',
                theme: 'coder',
              },
            },
          ],
        },
      }, null, 2) + '\n',
      'utf-8',
    )

    process.env.OPENCLAW_CONFIG_PATH = configPath
    process.env.OPENCLAW_STATE_DIR = tempDir

    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT,
        session_key TEXT UNIQUE,
        soul_content TEXT,
        status TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        config TEXT,
        workspace_id INTEGER DEFAULT 1
      );
    `)
    db.prepare(`
      INSERT INTO agents (name, role, session_key, soul_content, status, created_at, updated_at, config)
      VALUES (?, ?, ?, ?, 'offline', ?, ?, ?)
    `).run(
      'product-line-a-platform-dev',
      'agent',
      'agent:product-line-a-platform-dev:main',
      null,
      1,
      1,
      '{}',
    )

    const logAuditEvent = vi.fn()
    const broadcast = vi.fn()
    vi.doMock('@/lib/db', () => ({
      getDatabase: () => db,
      db_helpers: {},
      logAuditEvent,
    }))
    vi.doMock('@/lib/event-bus', () => ({
      eventBus: { broadcast },
    }))
    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }))

    const { previewSyncDiff, syncAgentsFromConfig } = await import('@/lib/agent-sync')

    const preview = await previewSyncDiff()
    expect(preview.newAgents).toEqual([])
    expect(preview.updatedAgents).toEqual(['Product Line A Platform Dev'])
    expect(preview.onlyInMC).toEqual([])

    const result = await syncAgentsFromConfig('tester')
    expect(result.created).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.agents).toEqual([
      {
        id: 'product-line-a-platform-dev',
        name: 'Product Line A Platform Dev',
        action: 'updated',
      },
    ])

    const row = db.prepare(`
      SELECT name, role, session_key, config, soul_content
      FROM agents
      WHERE session_key = ?
    `).get('agent:product-line-a-platform-dev:main') as {
      name: string
      role: string
      session_key: string
      config: string
      soul_content: string | null
    }

    expect(row.name).toBe('Product Line A Platform Dev')
    expect(row.role).toBe('coder')
    expect(JSON.parse(row.config).openclawId).toBe('product-line-a-platform-dev')
    expect(row.soul_content).toContain('synced soul')
    expect(logAuditEvent).toHaveBeenCalled()
    expect(broadcast).toHaveBeenCalledWith('agent.created', expect.objectContaining({ updated: 1 }))
  })
})

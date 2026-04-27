import type { APIRequestContext, Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import Database from 'better-sqlite3'

export const API_KEY_HEADER: Record<string, string> = {
  'x-api-key': 'test-api-key-e2e-12345',
  'Content-Type': 'application/json',
}

export const E2E_ADMIN_USER = process.env.AUTH_USER || 'testadmin'
export const E2E_ADMIN_PASS = process.env.AUTH_PASS || 'testpass1234!'

export function setDefaultWorkspaceSwitcherFlag(enabled: boolean): () => void {
  const dbPath = process.env.MISSION_CONTROL_DB_PATH ||
    path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')
  const db = new Database(dbPath)
  try {
    const rows = db.prepare('SELECT id, feature_flags FROM workspaces')
      .all() as Array<{ id: number; feature_flags: string | null }>
    if (rows.length === 0) return () => {}

    const update = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    for (const row of rows) {
      let flags: Record<string, unknown> = {}
      if (row.feature_flags) {
        try {
          const parsed = JSON.parse(row.feature_flags)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            flags = parsed as Record<string, unknown>
          }
        } catch {
          flags = {}
        }
      }

      if (enabled) {
        flags.FEATURE_WORKSPACE_SWITCHER = true
      } else {
        delete flags.FEATURE_WORKSPACE_SWITCHER
      }
      const nextFlags = Object.keys(flags).length > 0 ? JSON.stringify(flags) : null
      update.run(nextFlags, row.id)
    }
    db.pragma('wal_checkpoint(TRUNCATE)')

    return () => {
      const restoreDb = new Database(dbPath)
      try {
        const restore = restoreDb.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
        for (const row of rows) {
          restore.run(row.feature_flags, row.id)
        }
        restoreDb.pragma('wal_checkpoint(TRUNCATE)')
      } finally {
        restoreDb.close()
      }
    }
  } finally {
    db.close()
  }
}

async function waitForWorkspaceSwitcherFlag(request: APIRequestContext) {
  const deadline = Date.now() + 5_000
  let lastStatus = 0
  let lastBody: unknown = null

  while (Date.now() < deadline) {
    const res = await request.get('/api/tasks?workspace_scope=facility', { headers: API_KEY_HEADER })
    lastStatus = res.status()
    lastBody = await res.json().catch(() => null)
    if (res.status() === 200) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(
    `Workspace switcher flag did not become visible to the e2e app; last status ${lastStatus}: ${JSON.stringify(lastBody)}`
  )
}

export async function enableWorkspaceSwitcherFlagForE2E(request: APIRequestContext): Promise<() => void> {
  if (process.env.MC_E2E_WORKSPACE_SWITCHER_PRESEEDED === '1') {
    await waitForWorkspaceSwitcherFlag(request)
    return () => {}
  }

  const restore = setDefaultWorkspaceSwitcherFlag(true)
  try {
    await waitForWorkspaceSwitcherFlag(request)
    return restore
  } catch (error) {
    restore()
    throw error
  }
}

function uid() {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`
}

function withWorkspaceScope(pathname: string, workspaceId: number) {
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}workspace_id=${encodeURIComponent(String(workspaceId))}`
}

async function expectJsonSuccess<TBody extends Record<string, unknown>>(
  res: Awaited<ReturnType<APIRequestContext['post']>>,
  label: string
): Promise<TBody> {
  let body: TBody
  try {
    body = await res.json() as TBody
  } catch (error) {
    throw new Error(`${label} returned non-JSON response with status ${res.status()}: ${String(error)}`)
  }

  if (!res.ok()) {
    throw new Error(`${label} failed with status ${res.status()}: ${JSON.stringify(body)}`)
  }
  return body
}

export async function loginAsE2EAdmin(page: Page, request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { username: E2E_ADMIN_USER, password: E2E_ADMIN_PASS },
    headers: { 'x-real-ip': '10.88.90.10' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok()) {
    throw new Error(`E2E admin login failed with status ${res.status()}: ${JSON.stringify(body)}`)
  }

  const setCookie = res.headers()['set-cookie'] ?? ''
  const match = setCookie.match(/((?:__Host-)?mc-session)=([^;]+)/)
  if (!match) throw new Error(`E2E admin login did not return a session cookie: ${setCookie}`)

  const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3005'
  await page.context().addCookies([{
    name: match[1],
    value: match[2],
    url: baseURL,
    httpOnly: true,
    sameSite: 'Lax',
  }])

  return `${match[1]}=${match[2]}`
}

export async function dismissOnboardingForE2E(request: APIRequestContext, cookieHeader: string) {
  const headers = { 'Content-Type': 'application/json', cookie: cookieHeader }
  const skipRes = await request.post('/api/onboarding', {
    headers,
    data: { action: 'skip' },
  })
  if (![200, 204].includes(skipRes.status())) {
    const body = await skipRes.json().catch(() => ({}))
    throw new Error(`Onboarding skip failed with status ${skipRes.status()}: ${JSON.stringify(body)}`)
  }

  const settingsRes = await request.put('/api/settings', {
    headers,
    data: { settings: { 'general.interface_mode': 'full' } },
  })
  if (![200, 204].includes(settingsRes.status())) {
    const body = await settingsRes.json().catch(() => ({}))
    throw new Error(`E2E interface-mode setup failed with status ${settingsRes.status()}: ${JSON.stringify(body)}`)
  }
}

interface SeededWorkspace {
  id: number
  name: string
  slug: string
}

interface ProductLineSeed {
  workspace: SeededWorkspace
  projectId: number
  projectName: string
  taskId: number
  taskTitle: string
  agentId: number
  agentName: string
}

export interface ProductLineE2EFixture {
  alpha: ProductLineSeed
  beta: ProductLineSeed
  cleanup: () => Promise<void>
}

async function createSeedWorkspace(request: APIRequestContext, name: string, slug: string) {
  const res = await request.post('/api/workspaces', {
    headers: API_KEY_HEADER,
    data: { name, slug },
  })
  const body = await expectJsonSuccess<{ workspace?: SeededWorkspace }>(res, `create workspace ${name}`)
  if (!body.workspace?.id) throw new Error(`create workspace ${name} did not return a workspace id`)
  return body.workspace
}

async function createSeedProject(request: APIRequestContext, workspaceId: number, name: string, ticketPrefix: string) {
  const res = await request.post(withWorkspaceScope('/api/projects', workspaceId), {
    headers: API_KEY_HEADER,
    data: { name, ticket_prefix: ticketPrefix },
  })
  const body = await expectJsonSuccess<{ project?: { id: number; name: string } }>(res, `create project ${name}`)
  if (!body.project?.id) throw new Error(`create project ${name} did not return a project id`)
  return body.project
}

async function createSeedAgent(request: APIRequestContext, workspaceId: number, name: string) {
  const res = await request.post(withWorkspaceScope('/api/agents', workspaceId), {
    headers: API_KEY_HEADER,
    data: { name, role: 'tester', status: 'offline' },
  })
  const body = await expectJsonSuccess<{ agent?: { id: number; name: string } }>(res, `create agent ${name}`)
  if (!body.agent?.id) throw new Error(`create agent ${name} did not return an agent id`)
  return body.agent
}

async function createSeedTask(
  request: APIRequestContext,
  workspaceId: number,
  projectId: number,
  title: string,
  assignedTo: string
) {
  const res = await request.post(withWorkspaceScope('/api/tasks', workspaceId), {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} seeded by SPEC-002 real UI e2e`,
      priority: 'medium',
      status: 'inbox',
      project_id: projectId,
      assigned_to: assignedTo,
    },
  })
  const body = await expectJsonSuccess<{ task?: { id: number; title: string } }>(res, `create task ${title}`)
  if (!body.task?.id) throw new Error(`create task ${title} did not return a task id`)
  return body.task
}

export async function seedProductLineE2EData(request: APIRequestContext): Promise<ProductLineE2EFixture> {
  const stamp = uid().replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-10)
  const restoreWorkspaceSwitcherFlag = await enableWorkspaceSwitcherFlagForE2E(request)
  const created = {
    tasks: [] as Array<{ id: number; workspaceId: number }>,
    agents: [] as Array<{ id: number; workspaceId: number }>,
    projects: [] as Array<{ id: number; workspaceId: number }>,
    workspaces: [] as Array<{ id: number }>,
  }

  const cleanup = async () => {
    for (const task of [...created.tasks].reverse()) {
      await request.delete(withWorkspaceScope(`/api/tasks/${task.id}`, task.workspaceId), { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    for (const agent of [...created.agents].reverse()) {
      await request.delete(withWorkspaceScope(`/api/agents/${agent.id}`, agent.workspaceId), { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    for (const project of [...created.projects].reverse()) {
      await request.delete(withWorkspaceScope(`/api/projects/${project.id}?mode=delete`, project.workspaceId), { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    for (const workspace of [...created.workspaces].reverse()) {
      await request.delete(`/api/workspaces/${workspace.id}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    restoreWorkspaceSwitcherFlag()
  }

  try {
    const alphaWorkspace = await createSeedWorkspace(
      request,
      `SPEC-002 Alpha ${stamp}`,
      `spec-002-alpha-${stamp}`
    )
    const betaWorkspace = await createSeedWorkspace(
      request,
      `SPEC-002 Beta ${stamp}`,
      `spec-002-beta-${stamp}`
    )
    created.workspaces.push({ id: alphaWorkspace.id }, { id: betaWorkspace.id })

    const alphaProject = await createSeedProject(request, alphaWorkspace.id, `SPEC-002 Alpha Project ${stamp}`, `A${stamp.slice(0, 5)}`.toUpperCase())
    const betaProject = await createSeedProject(request, betaWorkspace.id, `SPEC-002 Beta Project ${stamp}`, `B${stamp.slice(0, 5)}`.toUpperCase())
    created.projects.push({ id: alphaProject.id, workspaceId: alphaWorkspace.id }, { id: betaProject.id, workspaceId: betaWorkspace.id })

    const alphaAgent = await createSeedAgent(request, alphaWorkspace.id, `spec-002-alpha-agent-${stamp}`)
    const betaAgent = await createSeedAgent(request, betaWorkspace.id, `spec-002-beta-agent-${stamp}`)
    created.agents.push({ id: alphaAgent.id, workspaceId: alphaWorkspace.id }, { id: betaAgent.id, workspaceId: betaWorkspace.id })

    const alphaTask = await createSeedTask(
      request,
      alphaWorkspace.id,
      alphaProject.id,
      `SPEC-002 Alpha Task ${stamp}`,
      alphaAgent.name
    )
    const betaTask = await createSeedTask(
      request,
      betaWorkspace.id,
      betaProject.id,
      `SPEC-002 Beta Task ${stamp}`,
      betaAgent.name
    )
    created.tasks.push({ id: alphaTask.id, workspaceId: alphaWorkspace.id }, { id: betaTask.id, workspaceId: betaWorkspace.id })

    return {
      alpha: {
        workspace: alphaWorkspace,
        projectId: alphaProject.id,
        projectName: alphaProject.name,
        taskId: alphaTask.id,
        taskTitle: alphaTask.title,
        agentId: alphaAgent.id,
        agentName: alphaAgent.name,
      },
      beta: {
        workspace: betaWorkspace,
        projectId: betaProject.id,
        projectName: betaProject.name,
        taskId: betaTask.id,
        taskTitle: betaTask.title,
        agentId: betaAgent.id,
        agentName: betaAgent.name,
      },
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

// --- Task helpers ---

export async function createTestTask(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const title = `e2e-task-${uid()}`
  const res = await request.post('/api/tasks', {
    headers: API_KEY_HEADER,
    data: { title, ...overrides },
  })
  const body = await res.json()
  return { id: body.task?.id as number, title, res, body }
}

export async function deleteTestTask(request: APIRequestContext, id: number) {
  return request.delete(`/api/tasks/${id}`, { headers: API_KEY_HEADER })
}

// --- Agent helpers ---

export async function createTestAgent(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const name = `e2e-agent-${uid()}`
  const res = await request.post('/api/agents', {
    headers: API_KEY_HEADER,
    data: { name, role: 'tester', ...overrides },
  })
  const body = await res.json()
  return { id: body.agent?.id as number, name, res, body }
}

export async function deleteTestAgent(request: APIRequestContext, id: number) {
  return request.delete(`/api/agents/${id}`, { headers: API_KEY_HEADER })
}

// --- Workflow helpers ---

export async function createTestWorkflow(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const name = `e2e-wf-${uid()}`
  const res = await request.post('/api/workflows', {
    headers: API_KEY_HEADER,
    data: { name, task_prompt: 'Test prompt for e2e', ...overrides },
  })
  const body = await res.json()
  return { id: body.template?.id as number, name, res, body }
}

export async function deleteTestWorkflow(request: APIRequestContext, id: number) {
  return request.delete('/api/workflows', {
    headers: API_KEY_HEADER,
    data: { id },
  })
}

// --- Webhook helpers ---

export async function createTestWebhook(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const name = `e2e-webhook-${uid()}`
  const res = await request.post('/api/webhooks', {
    headers: API_KEY_HEADER,
    data: { name, url: 'https://example.com/hook', ...overrides },
  })
  const body = await res.json()
  return { id: body.id as number, name, res, body }
}

export async function deleteTestWebhook(request: APIRequestContext, id: number) {
  return request.delete('/api/webhooks', {
    headers: API_KEY_HEADER,
    data: { id },
  })
}

// --- Alert helpers ---

export async function createTestAlert(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const name = `e2e-alert-${uid()}`
  const res = await request.post('/api/alerts', {
    headers: API_KEY_HEADER,
    data: {
      name,
      entity_type: 'task',
      condition_field: 'status',
      condition_operator: 'equals',
      condition_value: 'inbox',
      ...overrides,
    },
  })
  const body = await res.json()
  return { id: body.rule?.id as number, name, res, body }
}

export async function deleteTestAlert(request: APIRequestContext, id: number) {
  return request.delete('/api/alerts', {
    headers: API_KEY_HEADER,
    data: { id },
  })
}

// --- Project helpers ---

export async function createTestProject(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const suffix = uid()
  const name = `e2e-project-${suffix}`
  // Derive a unique ticket prefix from the suffix to avoid collisions
  const ticket_prefix = overrides.ticket_prefix ?? `T${suffix.replace(/\D/g, '').slice(-5)}`
  const res = await request.post('/api/projects', {
    headers: API_KEY_HEADER,
    data: { name, ticket_prefix, ...overrides },
  })
  const body = await res.json()
  return { id: body.project?.id as number, name, res, body }
}

export async function deleteTestProject(request: APIRequestContext, id: number) {
  return request.delete(`/api/projects/${id}?mode=delete`, { headers: API_KEY_HEADER })
}

// --- User helpers ---

export async function createTestUser(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const username = `e2e-user-${uid()}`
  const res = await request.post('/api/auth/users', {
    headers: API_KEY_HEADER,
    data: { username, password: 'e2e-testpass-123', display_name: username, ...overrides },
  })
  const body = await res.json()
  return { id: body.user?.id as number, username, res, body }
}

export async function deleteTestUser(request: APIRequestContext, id: number) {
  return request.delete('/api/auth/users', {
    headers: API_KEY_HEADER,
    data: { id },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

export const SLUG_NON_ALNUM_SEQUENCE_RE = /[^a-z0-9]+/g
export const SLUG_LEADING_DASH_RE = /^-+/
export const SLUG_TRAILING_DASH_RE = /-+$/

// Cap input length BEFORE running any regex over it. This neutralises any
// pathological-input concern from CodeQL's data-flow analysis: even though the
// three regexes here are linear-time, bounding the input also bounds total work
// at the boundary regardless of regex shape.
const SLUGIFY_MAX_INPUT_LENGTH = 1024

export function slugify(input: string): string {
  return input
    .slice(0, SLUGIFY_MAX_INPUT_LENGTH)
    .trim()
    .toLowerCase()
    .replace(SLUG_NON_ALNUM_SEQUENCE_RE, '-')
    .replace(SLUG_LEADING_DASH_RE, '')
    .replace(SLUG_TRAILING_DASH_RE, '')
    .slice(0, 64)
}

function normalizePrefix(input: string): string {
  const normalized = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.slice(0, 12)
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 'p.workspace_id')
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === '1'

    const rows = db.prepare(`
      SELECT p.id, p.workspace_id, p.name, p.slug, p.description, p.ticket_prefix, p.ticket_counter, p.status,
             p.github_repo, p.deadline, p.color, p.github_sync_enabled, p.github_labels_initialized, p.github_default_branch, p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
             (SELECT GROUP_CONCAT(paa.agent_name) FROM project_agent_assignments paa WHERE paa.project_id = p.id) as assigned_agents_csv
      FROM projects p
      WHERE ${workspaceFilter.sql}
        ${includeArchived ? '' : "AND p.status = 'active'"}
      ORDER BY p.name COLLATE NOCASE ASC
    `).all(...workspaceFilter.params) as Array<Record<string, unknown>>

    const projects = rows.map(row => ({
      ...row,
      assigned_agents: row.assigned_agents_csv ? String(row.assigned_agents_csv).split(',') : [],
      assigned_agents_csv: undefined,
    }))

    return NextResponse.json({ projects })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/projects error')
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    if (acceptedScope.kind === 'facility' || acceptedScope.workspaceId === null) {
      return NextResponse.json({ error: 'workspace_id is required for project creation' }, { status: 400 })
    }
    const workspaceId = acceptedScope.workspaceId
    const body = await request.json()

    const name = String(body?.name || '').trim()
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const prefixInput = String(body?.ticket_prefix || body?.ticketPrefix || '').trim()
    const slugInput = String(body?.slug || '').trim()
    const githubRepo = typeof body?.github_repo === 'string' ? body.github_repo.trim() || null : null
    const deadline = typeof body?.deadline === 'number' ? body.deadline : null
    const color = typeof body?.color === 'string' ? body.color.trim() || null : null

    if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 })

    const slug = slugInput ? slugify(slugInput) : slugify(name)
    const ticketPrefix = normalizePrefix(prefixInput || name.slice(0, 5))
    if (!slug) return NextResponse.json({ error: 'Invalid project slug' }, { status: 400 })
    if (!ticketPrefix) return NextResponse.json({ error: 'Invalid ticket prefix' }, { status: 400 })

    const exists = db.prepare(`
      SELECT id FROM projects
      WHERE workspace_id = ? AND (slug = ? OR ticket_prefix = ?)
      LIMIT 1
    `).get(workspaceId, slug, ticketPrefix) as { id: number } | undefined
    if (exists) {
      return NextResponse.json({ error: 'Project slug or ticket prefix already exists' }, { status: 409 })
    }

    const result = db.prepare(`
      INSERT INTO projects (workspace_id, name, slug, description, ticket_prefix, github_repo, deadline, color, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
    `).run(workspaceId, name, slug, description || null, ticketPrefix, githubRepo, deadline, color)

    const project = db.prepare(`
      SELECT id, workspace_id, name, slug, description, ticket_prefix, ticket_counter, status,
             github_repo, deadline, color, github_sync_enabled, github_labels_initialized, github_default_branch, created_at, updated_at
      FROM projects
      WHERE id = ?
    `).get(Number(result.lastInsertRowid))

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/projects error')
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

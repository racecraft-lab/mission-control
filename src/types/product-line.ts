export const ACTIVE_WORKSPACE_STORAGE_KEY = 'mc:active-workspace:v1'
export const ACTIVE_WORKSPACE_PAYLOAD_VERSION = 1

export interface ProductLine {
  id: number
  slug: string
  name: string
  tenant_id: number
  feature_flags?: string | Record<string, unknown> | null
}

export interface FacilityScope {
  kind: 'facility'
  tenantId: number
  version: number
  scopeKey: string
  originTabId?: string
  userId?: number
  sessionId?: string
}

export interface ProductLineScope {
  kind: 'productLine'
  tenantId: number
  productLineId: number
  productLine: ProductLine
  version: number
  scopeKey: string
  originTabId?: string
  userId?: number
  sessionId?: string
}

export type ActiveProductLineScope = FacilityScope | ProductLineScope

export interface PersistedProductLineScope {
  payloadVersion: typeof ACTIVE_WORKSPACE_PAYLOAD_VERSION
  tenantId: number
  productLineId: number | null
  scopeVersion: number
}

export interface ProductLineScopeMessage extends PersistedProductLineScope {
  originTabId: string
  userId?: number
  sessionId?: string
}

export function isFacilityWorkspace(workspace: Pick<ProductLine, 'slug' | 'name'>): boolean {
  return workspace.slug.trim().toLowerCase() === 'facility' ||
    workspace.name.trim().toLowerCase() === 'facility'
}

export function scopeKey(tenantId: number, productLineId: number | null): string {
  return productLineId === null
    ? `tenant:${String(tenantId)}:facility`
    : `tenant:${String(tenantId)}:product-line:${String(productLineId)}`
}

export function createFacilityScope(tenantId: number, version: number): FacilityScope {
  return {
    kind: 'facility',
    tenantId,
    version,
    scopeKey: scopeKey(tenantId, null),
  }
}

export function createProductLineScope(
  productLine: ProductLine,
  version: number
): ProductLineScope {
  return {
    kind: 'productLine',
    tenantId: productLine.tenant_id,
    productLineId: productLine.id,
    productLine,
    version,
    scopeKey: scopeKey(productLine.tenant_id, productLine.id),
  }
}

export function parsePersistedProductLineScope(raw: string | null): PersistedProductLineScope | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedProductLineScope>
    if (parsed.payloadVersion !== ACTIVE_WORKSPACE_PAYLOAD_VERSION) return null
    if (typeof parsed.tenantId !== 'number' || !Number.isFinite(parsed.tenantId)) return null
    if (typeof parsed.scopeVersion !== 'number' || !Number.isFinite(parsed.scopeVersion)) return null
    if (parsed.productLineId !== null && (
      typeof parsed.productLineId !== 'number' ||
      !Number.isFinite(parsed.productLineId)
    )) {
      return null
    }
    return {
      payloadVersion: ACTIVE_WORKSPACE_PAYLOAD_VERSION,
      tenantId: parsed.tenantId,
      productLineId: parsed.productLineId ?? null,
      scopeVersion: parsed.scopeVersion,
    }
  } catch {
    return null
  }
}

export function serializeProductLineScope(scope: ActiveProductLineScope): string {
  const payload: PersistedProductLineScope = {
    payloadVersion: ACTIVE_WORKSPACE_PAYLOAD_VERSION,
    tenantId: scope.tenantId,
    productLineId: scope.kind === 'productLine' ? scope.productLineId : null,
    scopeVersion: scope.version,
  }
  return JSON.stringify(payload)
}

export function selectableProductLines(workspaces: ProductLine[]): ProductLine[] {
  return workspaces.filter((workspace) => !isFacilityWorkspace(workspace))
}

export function appendScopeToPath(path: string, scope: ActiveProductLineScope | null): string {
  if (!scope) return path
  const [base = path, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  if (scope.kind === 'productLine') {
    params.set('workspace_id', String(scope.productLineId))
    params.delete('workspace_scope')
  } else {
    params.set('workspace_scope', 'facility')
    params.delete('workspace_id')
  }
  const serialized = params.toString()
  return serialized ? `${base}?${serialized}` : base
}

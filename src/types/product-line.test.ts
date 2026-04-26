import { describe, expect, it } from 'vitest'
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  createFacilityScope,
  createProductLineScope,
  isFacilityWorkspace,
  parsePersistedProductLineScope,
  scopeKey,
  selectableProductLines,
  serializeProductLineScope,
  type ProductLine,
} from '@/types/product-line'

const productLine: ProductLine = {
  id: 22,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
}

describe('Product Line scope helpers', () => {
  it('uses the SPEC-002 persistence key', () => {
    expect(ACTIVE_WORKSPACE_STORAGE_KEY).toBe('mc:active-workspace:v1')
  })

  it('derives stable Facility and Product Line scope keys', () => {
    expect(scopeKey(7, null)).toBe('tenant:7:facility')
    expect(scopeKey(7, 22)).toBe('tenant:7:product-line:22')
  })

  it('rejects real facility workspace rows from selectable Product Lines', () => {
    const workspaces: ProductLine[] = [
      { id: 1, slug: 'facility', name: 'Facility', tenant_id: 7 },
      productLine,
    ]
    expect(isFacilityWorkspace(workspaces[0])).toBe(true)
    expect(selectableProductLines(workspaces)).toEqual([productLine])
  })

  it('round trips only the persisted scope slice', () => {
    const scope = createProductLineScope(productLine, 100)
    expect(parsePersistedProductLineScope(serializeProductLineScope(scope))).toEqual({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: 22,
      scopeVersion: 100,
    })

    const facility = createFacilityScope(7, 101)
    expect(parsePersistedProductLineScope(serializeProductLineScope(facility))).toEqual({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: null,
      scopeVersion: 101,
    })
  })

  it('rejects malformed or unsupported persisted payloads', () => {
    expect(parsePersistedProductLineScope('{bad')).toBeNull()
    expect(parsePersistedProductLineScope(JSON.stringify({ payloadVersion: 99 }))).toBeNull()
    expect(parsePersistedProductLineScope(JSON.stringify({
      payloadVersion: 1,
      tenantId: '7',
      productLineId: 22,
      scopeVersion: 1,
    }))).toBeNull()
  })
})

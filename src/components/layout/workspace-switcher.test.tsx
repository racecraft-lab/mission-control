import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher'
import { useMissionControl } from '@/store'
import { createFacilityScope, createProductLineScope, type ProductLine } from '@/types/product-line'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const messages: Record<string, string> = {
      facility: 'Facility',
      productLine: 'Product Line',
      loading: 'Loading scopes...',
      empty: 'No Product Lines available',
      loadError: 'Product Line list failed to load.',
      unauthorizedSelection: 'Selected Product Line is no longer authorized.',
      triggerAria: 'Change Facility or Product Line scope',
      listboxAria: 'Facility and Product Line scopes',
    }
    return (key: string) => messages[key] ?? key
  },
}))

const facilityRow: ProductLine = {
  id: 3,
  slug: 'facility',
  name: 'Facility',
  tenant_id: 7,
}

const assembly: ProductLine = {
  id: 42,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
}

const paint: ProductLine = {
  id: 43,
  slug: 'paint',
  name: 'Paint',
  tenant_id: 7,
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    useMissionControl.setState({
      workspaceSwitcherEnabled: true,
      workspaceListStatus: 'ready',
      workspaceScopeNotice: null,
      workspaces: [facilityRow, assembly, paint],
      activeProductLine: null,
      activeProductLineScope: createFacilityScope(7, 1),
      scopeKey: 'tenant:7:facility',
      fetchWorkspaces: vi.fn(async () => undefined),
      setActiveProductLine: vi.fn((productLine: ProductLine | null) => {
        useMissionControl.setState({
          activeProductLine: productLine,
          activeProductLineScope: productLine ? createProductLineScope(productLine, 2) : createFacilityScope(7, 2),
          scopeKey: productLine ? `tenant:7:product-line:${productLine.id}` : 'tenant:7:facility',
        })
      }),
    })
  })

  it('renders one synthetic Facility option and selectable Product Line options', () => {
    render(<WorkspaceSwitcher />)

    fireEvent.click(screen.getByRole('button', { name: 'Change Facility or Product Line scope' }))
    const listbox = screen.getByRole('listbox', { name: 'Facility and Product Line scopes' })
    const options = within(listbox).getAllByRole('option')

    expect(options).toHaveLength(3)
    expect(within(options[0]).getAllByText('Facility')).toHaveLength(2)
    expect(within(options[1]).getByText('Assembly')).toBeInTheDocument()
    expect(within(options[2]).getByText('Paint')).toBeInTheDocument()
    expect(within(listbox).getAllByText('Facility')).toHaveLength(2)
  })

  it('marks the selected option and applies listbox option semantics', () => {
    useMissionControl.setState({
      activeProductLine: assembly,
      activeProductLineScope: createProductLineScope(assembly, 3),
      scopeKey: 'tenant:7:product-line:42',
    })

    render(<WorkspaceSwitcher />)

    fireEvent.click(screen.getByRole('button', { name: 'Change Facility or Product Line scope' }))
    const listbox = screen.getByRole('listbox')
    const assemblyOption = within(listbox).getByRole('option', { name: /Assembly/ })
    const facilityOption = within(listbox).getByRole('option', { name: /^Facility/ })

    expect(assemblyOption).toHaveAttribute('aria-selected', 'true')
    expect(facilityOption).toHaveAttribute('aria-selected', 'false')
    expect(assemblyOption).toHaveAttribute('tabIndex', '0')
  })

  it('keeps loading, empty, and error rows outside the selectable option set', () => {
    useMissionControl.setState({
      workspaces: [facilityRow],
      workspaceListStatus: 'ready',
      workspaceScopeNotice: 'workspace-list-failure',
    })

    render(<WorkspaceSwitcher />)

    fireEvent.click(screen.getByRole('button', { name: 'Change Facility or Product Line scope' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Product Line list failed to load.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})

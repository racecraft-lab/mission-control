import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerEvents } from '@/lib/use-server-events'
import { useMissionControl } from '@/store'
import { createFacilityScope, createProductLineScope, type ProductLine } from '@/types/product-line'

const productLine: ProductLine = {
  id: 42,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
}

class FakeEventSource implements EventSource {
  static instances: FakeEventSource[] = []

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2
  readonly url: string
  readonly withCredentials = false
  readyState = 0
  onerror: ((this: EventSource, ev: Event) => any) | null = null
  onmessage: ((this: EventSource, ev: MessageEvent) => any) | null = null
  onopen: ((this: EventSource, ev: Event) => any) | null = null
  close = vi.fn(() => {
    this.readyState = this.CLOSED
  })
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn(() => true)

  constructor(url: string | URL) {
    this.url = String(url)
    FakeEventSource.instances.push(this)
  }
}

function ServerEventsHarness() {
  useServerEvents()
  return null
}

describe('useServerEvents', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    useMissionControl.setState({
      workspaceSwitcherEnabled: true,
      activeProductLineScope: createFacilityScope(7, 1),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('closes and recreates the EventSource when Facility/Product Line scope changes', async () => {
    const { unmount } = render(<ServerEventsHarness />)

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    const facilityStream = FakeEventSource.instances[0]
    expect(facilityStream.url).toBe('/api/events?workspace_scope=facility')

    act(() => {
      useMissionControl.setState({
        activeProductLineScope: createProductLineScope(productLine, 2),
      })
    })

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2))
    expect(facilityStream.close).toHaveBeenCalled()
    const productLineStream = FakeEventSource.instances[1]
    expect(productLineStream.url).toBe('/api/events?workspace_id=42')

    unmount()
    expect(productLineStream.close).toHaveBeenCalled()
  })
})

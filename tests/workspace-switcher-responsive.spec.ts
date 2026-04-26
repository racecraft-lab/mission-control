import { test, expect } from '@playwright/test'

const responsiveHtml = `
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    header { width: 100vw; height: 56px; display: flex; align-items: center; gap: 8px; padding: 0 12px; overflow: hidden; border-bottom: 1px solid #333; }
    #trigger { height: 32px; min-width: 0; max-width: min(11rem, calc(100vw - 24px)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #popup { position: absolute; top: 40px; left: 12px; width: min(18rem, calc(100vw - 1rem)); border: 1px solid #333; }
    [role="option"] { width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
  <header>
    <button id="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Change Facility or Product Line scope" title="Facility: Facility">
      <span>Facility</span><span> / </span><span>Assembly Product Line With Long Label</span><span aria-hidden>v</span>
    </button>
  </header>
  <div id="popup" hidden>
    <div role="listbox" aria-label="Facility and Product Line scopes">
      <button role="option" type="button" aria-selected="true">Facility <span>Facility</span></button>
      <button role="option" type="button" aria-selected="false">Assembly Product Line With Long Label <span>Product Line</span></button>
    </div>
  </div>
  <script>
    const trigger = document.getElementById('trigger')
    const popup = document.getElementById('popup')
    trigger.addEventListener('click', () => {
      popup.hidden = !popup.hidden
      trigger.setAttribute('aria-expanded', String(!popup.hidden))
    })
  </script>
`

test.describe('Workspace switcher responsive layout', () => {
  for (const width of [320, 375, 390]) {
    test(`keeps the switcher visible without horizontal overflow at ${width}px`, async ({ page, request }) => {
      void request
      await page.setViewportSize({ width, height: 720 })
      await page.setContent(responsiveHtml)
      const trigger = page.getByRole('button', { name: /change facility or product line scope/i })
      await expect(trigger).toBeVisible()

      const triggerBox = await trigger.boundingBox()
      expect(triggerBox).not.toBeNull()
      expect((triggerBox?.x ?? 0) + (triggerBox?.width ?? 0)).toBeLessThanOrEqual(width)

      await trigger.click()
      const listbox = page.getByRole('listbox', { name: /facility and product line scopes/i })
      await expect(listbox).toBeVisible()
      const listboxBox = await listbox.boundingBox()
      expect(listboxBox).not.toBeNull()
      expect((listboxBox?.x ?? 0) + (listboxBox?.width ?? 0)).toBeLessThanOrEqual(width)

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const viewportWidth = await page.evaluate(() => window.innerWidth)
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1)
    })
  }
})

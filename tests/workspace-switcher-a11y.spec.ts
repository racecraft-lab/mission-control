import { test, expect } from '@playwright/test'

const switcherHtml = `
  <button id="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Change Facility or Product Line scope" title="Facility: Facility">
    <span id="kind">Facility</span><span> / </span><span id="label">Facility</span><span aria-hidden>v</span>
  </button>
  <div id="popup" hidden>
    <div id="listbox" role="listbox" aria-label="Facility and Product Line scopes">
      <button type="button" role="option" aria-selected="true" tabindex="0" data-kind="facility">Facility <span>Facility</span></button>
      <button type="button" role="option" aria-selected="false" tabindex="-1" data-kind="productLine">Assembly Product Line With Long Label <span>Product Line</span></button>
      <button type="button" role="option" aria-selected="false" tabindex="-1" data-kind="productLine">Paint <span>Product Line</span></button>
    </div>
  </div>
  <main id="outside" style="width:400px;height:300px">outside</main>
  <script>
    const trigger = document.getElementById('trigger')
    const popup = document.getElementById('popup')
    const options = Array.from(document.querySelectorAll('[role="option"]'))
    let activeIndex = 0
    function open() {
      popup.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      options[activeIndex].focus()
    }
    function close() {
      popup.hidden = true
      trigger.setAttribute('aria-expanded', 'false')
      trigger.focus()
    }
    function select(index) {
      options.forEach((option, optionIndex) => {
        option.setAttribute('aria-selected', String(optionIndex === index))
        option.tabIndex = optionIndex === index ? 0 : -1
      })
      activeIndex = index
      const selected = options[index]
      document.getElementById('kind').textContent = selected.dataset.kind === 'productLine' ? 'Product Line' : 'Facility'
      document.getElementById('label').textContent = selected.firstChild.textContent.trim()
      trigger.title = document.getElementById('kind').textContent + ': ' + document.getElementById('label').textContent
      close()
    }
    trigger.addEventListener('click', () => popup.hidden ? open() : close())
    trigger.addEventListener('keydown', event => {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        open()
      }
    })
    options.forEach((option, index) => {
      option.addEventListener('click', () => select(index))
      option.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          activeIndex = Math.min(options.length - 1, activeIndex + 1)
          options[activeIndex].focus()
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          activeIndex = Math.max(0, activeIndex - 1)
          options[activeIndex].focus()
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select(activeIndex)
        }
      })
    })
    document.addEventListener('mousedown', event => {
      if (!popup.hidden && event.target.id === 'outside') close()
    })
  </script>
`

test.describe('Workspace switcher accessibility', () => {
  test('supports keyboard navigation, Escape/outside close, and trigger focus return', async ({ page, request }) => {
    void request
    await page.setContent(switcherHtml)
    const trigger = page.getByRole('button', { name: /change facility or product line scope/i })
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')

    await trigger.focus()
    await page.keyboard.press('Enter')
    const listbox = page.getByRole('listbox', { name: /facility and product line scopes/i })
    await expect(listbox).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(listbox.getByRole('option')).toHaveCount(3)
    await expect(listbox.getByRole('option', { name: /^Facility/ })).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(listbox).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('title', /Product Line: Assembly Product Line With Long Label/)

    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.mouse.click(300, 300)
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })
})

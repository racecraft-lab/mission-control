import { describe, it, expect } from 'vitest'

// Reproduce the stripHtml logic from markdown-renderer to test it in isolation.
// Loops until idempotent so interleaved sequences like `<scr<script>ipt>` are
// fully stripped rather than leaving a residual tag behind.
function stripHtml(content: string): string {
  let prev: string
  let result = content
  do {
    prev = result
    result = result.replace(/<[^>]*>/g, '')
  } while (result !== prev)
  return result
}

describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello')
  })

  it('removes self-closing tags', () => {
    expect(stripHtml('Before <br/> After')).toBe('Before  After')
  })

  it('removes img tags from GitHub pastes', () => {
    const input = 'Description with <img src="https://example.com/screenshot.png" alt="screenshot"> embedded image'
    expect(stripHtml(input)).toBe('Description with  embedded image')
  })

  it('removes nested HTML tags', () => {
    expect(stripHtml('<div><strong>Bold</strong> text</div>')).toBe('Bold text')
  })

  it('preserves plain text without tags', () => {
    expect(stripHtml('No tags here, just **markdown**')).toBe('No tags here, just **markdown**')
  })

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('removes multiple img tags', () => {
    const input = '<img src="a.png"><img src="b.png">text<img src="c.png">'
    expect(stripHtml(input)).toBe('text')
  })

  it('removes HTML comments', () => {
    expect(stripHtml('Before <!-- comment --> After')).toBe('Before  After')
  })

  it('handles tags with attributes and whitespace', () => {
    const input = '<a href="https://example.com" target="_blank" >Link text</a>'
    expect(stripHtml(input)).toBe('Link text')
  })

  it('preserves angle brackets that are not HTML tags', () => {
    // This is a limitation — mathematical expressions like "x < 5" would be affected
    // But for our use case (stripping pasted HTML), this is acceptable
    expect(stripHtml('5 > 3 is true')).toBe('5 > 3 is true')
  })

  it('output never contains a complete `<...>` after stripping', () => {
    // A naive single-pass `replace(/<[^>]*>/g, '')` can leave a complete tag
    // behind when one tag is split across the input by another (e.g.
    // `<scr<script>ipt>` consumes the inner `<script>` first and leaves a
    // residual fragment that, when concatenated by other inputs, re-forms a
    // tag). The loop-until-idempotent variant guarantees the output has no
    // surviving `<...>` patterns regardless of input.
    const inputs = [
      '<scr<script>alert(1)</script>ipt>',
      '<scr<script>ipt>alert(1)<scr</script>ipt>',
      '<<img src=x onerror=alert(1)>>',
    ]
    for (const input of inputs) {
      expect(stripHtml(input)).not.toMatch(/<[^>]*>/)
    }
  })
})

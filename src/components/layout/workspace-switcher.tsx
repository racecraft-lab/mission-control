'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'
import { selectableProductLines, type ProductLine } from '@/types/product-line'

type SwitcherOption =
  | { kind: 'facility'; id: 'facility'; label: string }
  | { kind: 'productLine'; id: string; label: string; productLine: ProductLine }

export function WorkspaceSwitcher() {
  const t = useTranslations('workspaceSwitcher')
  const {
    activeProductLine,
    activeProductLineScope,
    fetchWorkspaces,
    setActiveProductLine,
    workspaceListStatus,
    workspaceScopeNotice,
    workspaceSwitcherEnabled,
    workspaces,
  } = useMissionControl()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    fetchWorkspaces().catch(() => undefined)
  }, [fetchWorkspaces])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  const productLines = useMemo(() => selectableProductLines(workspaces), [workspaces])
  const options = useMemo<SwitcherOption[]>(() => [
    { kind: 'facility', id: 'facility', label: t('facility') },
    ...productLines.map((productLine) => ({
      kind: 'productLine' as const,
      id: `product-line-${String(productLine.id)}`,
      label: productLine.name,
      productLine,
    })),
  ], [productLines, t])

  const selectedId = activeProductLine
    ? `product-line-${String(activeProductLine.id)}`
    : 'facility'
  const selectedLabel = activeProductLine?.name ?? t('facility')
  const selectedKind = activeProductLineScope?.kind === 'productLine'
    ? t('productLine')
    : t('facility')

  const selectOption = useCallback((option: SwitcherOption) => {
    setActiveProductLine(option.kind === 'productLine' ? option.productLine : null, { source: 'user' })
    setOpen(false)
    triggerRef.current?.focus()
  }, [setActiveProductLine])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      setOpen(true)
      const currentIndex = Math.max(0, options.findIndex((option) => option.id === selectedId))
      const nextIndex = event.key === 'ArrowUp' ? Math.max(0, currentIndex - 1) : currentIndex
      setActiveIndex(nextIndex)
      requestAnimationFrame(() => {
        optionRefs.current[nextIndex]?.focus()
      })
    }
  }

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const next = Math.min(options.length - 1, Math.max(0, activeIndex + delta))
      setActiveIndex(next)
      optionRefs.current[next]?.focus()
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : options.length - 1
      setActiveIndex(next)
      optionRefs.current[next]?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) selectOption(option)
    }
  }

  if (!workspaceSwitcherEnabled) return null

  const alertText = workspaceScopeNotice === 'workspace-list-failure'
    ? t('loadError')
    : workspaceScopeNotice === 'unauthorized-selection'
      ? t('unauthorizedSelection')
      : null

  return (
    <div ref={rootRef} className="relative min-w-0">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="xs"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('triggerAria')}
        onClick={() => {
          setOpen((current) => !current)
          const currentIndex = Math.max(0, options.findIndex((option) => option.id === selectedId))
          setActiveIndex(currentIndex)
        }}
        onKeyDown={onTriggerKeyDown}
        className="h-8 min-w-0 max-w-[11rem] md:max-w-[16rem] justify-start bg-secondary/35 px-2"
        title={`${selectedKind}: ${selectedLabel}`}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="text-muted-foreground">{selectedKind}</span>
          <span className="text-muted-foreground/40"> / </span>
          <span className="text-foreground">{selectedLabel}</span>
        </span>
        <span aria-hidden className="shrink-0 text-muted-foreground">v</span>
      </Button>

      {open && (
        <div className="absolute left-0 top-10 z-[80] w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {alertText && (
            <div role="alert" className="px-3 py-2 text-xs text-red-300">
              {alertText}
            </div>
          )}
          {workspaceListStatus === 'loading' ? (
            <div role="status" className="px-3 py-2 text-xs text-muted-foreground">
              {t('loading')}
            </div>
          ) : !alertText && productLines.length === 0 ? (
            <div role="status" className="px-3 py-2 text-xs text-muted-foreground">
              {t('empty')}
            </div>
          ) : null}
          <div role="listbox" aria-label={t('listboxAria')} className="max-h-72 overflow-y-auto py-1">
            {options.map((option, index) => {
              const selected = option.id === selectedId
              return (
                <button
                  key={option.id}
                  ref={(element) => { optionRefs.current[index] = element }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => {
                    selectOption(option)
                  }}
                  onKeyDown={onOptionKeyDown}
                  onMouseEnter={() => {
                    setActiveIndex(index)
                  }}
                  className={`flex h-9 w-full min-w-0 items-center gap-2 px-3 text-left text-xs transition-colors ${
                    selected
                      ? 'bg-primary/15 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                  }`}
                >
                  <span className="w-4 shrink-0 text-center" aria-hidden>{selected ? '*' : ''}</span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {option.kind === 'facility' ? t('facility') : t('productLine')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

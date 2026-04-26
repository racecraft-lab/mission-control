import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

describe('Product Line mode-sensitive panel wiring', () => {
  it('threads the selected scope through task board data and mutation requests', () => {
    const taskBoard = source('src/components/panels/task-board-panel.tsx')

    expect(taskBoard).toContain('activeProductLineScope')
    expect(taskBoard).toContain("appendScopeToPath('/api/agents', activeProductLineScope)")
    expect(taskBoard).toContain("appendScopeToPath('/api/projects', activeProductLineScope)")
    expect(taskBoard).toContain("appendScopeToPath('/api/tasks', activeProductLineScope)")
    expect(taskBoard).toContain("appendScopeToPath('/api/quality-review', activeProductLineScope)")
    expect(taskBoard).toContain("appendScopeToPath(`/api/tasks/${task.id}`, activeProductLineScope)")
  })

  it('threads the selected scope through agent squad requests while preserving id-based ambiguous mutations', () => {
    const agentSquad = source('src/components/panels/agent-squad-panel-phase3.tsx')

    expect(agentSquad).toContain('activeProductLineScope')
    expect(agentSquad).toContain("appendScopeToPath('/api/agents', activeProductLineScope)")
    expect(agentSquad).toContain('appendScopeToPath(`/api/agents/${agentId}/hide`, activeProductLineScope)')
    expect(agentSquad).toContain('appendScopeToPath(`/api/agents/${agentId}`, activeProductLineScope)')
    expect(agentSquad).toContain('appendScopeToPath(`/api/agents/${agentState.id}/soul`, activeProductLineScope)')
    expect(agentSquad).toContain('appendScopeToPath(`/api/agents/${agentState.id}/memory`, activeProductLineScope)')
  })

  it('threads the selected scope through project manager and DB-backed chat surfaces', () => {
    const projectManager = source('src/components/modals/project-manager-modal.tsx')
    const chatWorkspace = source('src/components/chat/chat-workspace.tsx')
    const agentComms = source('src/components/panels/agent-comms-panel.tsx')

    expect(projectManager).toContain("appendScopeToPath('/api/projects?includeArchived=1', activeProductLineScope)")
    expect(projectManager).toContain("appendScopeToPath('/api/agents', activeProductLineScope)")
    expect(projectManager).toContain('appendScopeToPath(`/api/projects/${project.id}`, activeProductLineScope)')

    expect(chatWorkspace).toContain("appendScopeToPath('/api/agents', activeProductLineScope)")
    expect(chatWorkspace).toContain('appendScopeToPath(`/api/chat/messages?conversation_id=${encodeURIComponent(activeConversation)}&limit=100`, activeProductLineScope)')
    expect(chatWorkspace).toContain("appendScopeToPath('/api/chat/messages', activeProductLineScope)")

    expect(agentComms).toContain("appendScopeToPath('/api/agents/comms?limit=200', activeProductLineScope)")
    expect(agentComms).toContain("appendScopeToPath('/api/chat/messages', activeProductLineScope)")
  })
})

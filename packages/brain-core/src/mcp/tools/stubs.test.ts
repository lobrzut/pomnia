import { describe, expect, it } from 'vitest'

import { listTools } from './index.js'
import { runStub } from './stubs.js'

/**
 * Listing and handling are different questions.
 *
 * These three tools are answered but not advertised: three catalog entries
 * announcing themselves as NOT IMPLEMENTED cost context in every listing, in
 * every conversation, and their only possible outcome is an agent picking one
 * and being told no. A client holding a cached catalog still gets a useful
 * refusal rather than "unknown tool".
 */
const UNIMPLEMENTED = ['run_skill', 'search_code', 'code_status']

describe('unimplemented tools', () => {
  it('are not advertised', () => {
    const names = listTools().map((t) => t.name)
    for (const n of UNIMPLEMENTED) expect(names, `${n} must not be listed`).not.toContain(n)
  })

  it('leave the working catalog intact', () => {
    const names = listTools().map((t) => t.name)
    for (const n of [
      'search_library',
      'save_conversation',
      'checkpoint_session',
      'get_user_profile',
      'memory',
      'library_status',
      'list_skills',
      'list_cli_skills',
      'get_skill',
    ]) {
      expect(names, `${n} must still be listed`).toContain(n)
    }
  })

  it('still answer, so a cached client is not told "unknown tool"', () => {
    for (const n of UNIMPLEMENTED) {
      const text = runStub(n)
      expect(text).toContain('not implemented')
      // Says plainly that nothing happened — an agent must not report success.
      expect(text).toMatch(/nothing ran and nothing was searched/)
    }
  })

  it('point somewhere real instead of at the author’s own network', () => {
    expect(runStub('run_skill')).toContain('get_skill')
    expect(runStub('search_code')).toContain('search_library')
    expect(runStub('code_status')).toContain('library_status')
    for (const n of UNIMPLEMENTED) {
      expect(runStub(n)).not.toMatch(/python master|192\.168/i)
    }
  })

  it('does not invent an alternative for a tool it has none for', () => {
    expect(runStub('something_else')).toContain('No equivalent is available')
  })
})

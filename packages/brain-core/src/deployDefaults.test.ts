import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const deploy = (f: string): string =>
  readFileSync(join(__dirname, '..', 'deploy', f), 'utf8')

/**
 * The appliance is the no-GPU, no-Ollama deployment: fastembed ONNX on the CPU,
 * search only, small enough to live on a NAS. These assert the defaults that
 * make a fresh install honest about what it can do.
 */
describe('appliance install defaults', () => {
  it('ships with distillation off', () => {
    // install.sh never pulls a chat model, but distill defaults to on and its
    // only precondition was a non-empty Ollama URL — which config fills in with
    // http://127.0.0.1:11434 whether or not anything listens. A plain install
    // therefore reported distill enabled, runnable and idle on a host with no
    // Ollama at all, and failed on every attempt.
    expect(deploy('pomnia-brain-core.service')).toContain('Environment=BRAIN_DISTILL=0')
  })

  it('embeds in-process rather than through Ollama', () => {
    expect(deploy('pomnia-brain-core.service')).toContain('Environment=BRAIN_EMBED_BACKEND=fastembed')
  })

  it('turns distillation on only when the operator asks for Ollama', () => {
    const sh = deploy('install.sh')
    expect(sh).toMatch(/^DISTILL=0$/m)
    expect(sh).toContain('--with-ollama) WITH_OLLAMA=1; EMBED_BACKEND=ollama; DISTILL=1;')
  })

  it('writes the operator\'s choice into the unit', () => {
    // Without this line the unit keeps the template's 0 and --with-ollama is
    // silently ignored — the opposite failure, equally quiet.
    expect(deploy('install.sh')).toContain('BRAIN_DISTILL=$DISTILL')
  })
})

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

/**
 * Distillation on a machine with no GPU is not impossible, it is
 * non-interactive. Measured on the reference appliance (i5-6600T, four cores):
 * 654 s per note against 9.2 s on a desktop GPU. The vault behind that number
 * records a median of 3 notes a day and 13 at the 90th percentile across 359
 * days, and an eight-hour night fits 44 — so a timer keeps up with fifteen
 * times the median day while nobody is using the box.
 */
describe('nightly distillation', () => {
  it('runs the one-shot distiller rather than a server', () => {
    expect(deploy('pomnia-distill.service')).toContain('daemon.js --distill')
    expect(deploy('pomnia-distill.service')).toContain('Type=oneshot')
  })

  it('never gets killed halfway', () => {
    // A note half-written has to be redone from the top, so a run that is cut
    // short leaves the queue exactly where it was, every night.
    expect(deploy('pomnia-distill.service')).toContain('TimeoutStartSec=0')
  })

  it('yields to anyone actually using the machine', () => {
    // The point of running at night is to be invisible; a search arriving at
    // 3am must still be answered.
    const unit = deploy('pomnia-distill.service')
    expect(unit).toContain('Nice=19')
    expect(unit).toContain('IOSchedulingClass=idle')
    expect(unit).toContain('CPUSchedulingPolicy=idle')
  })

  it('survives a box that was switched off overnight', () => {
    // Without Persistent the queue just grows and nothing says why.
    expect(deploy('pomnia-distill.timer')).toContain('Persistent=true')
  })

  it('is installed only when a model was installed with it', () => {
    const sh = deploy('install.sh')
    expect(sh).toContain('if [[ "$DISTILL" == "1" ]]; then')
    expect(sh).toContain('systemctl enable --now pomnia-distill.timer')
  })

  it('removes the timer when distillation is turned back off', () => {
    // A nightly run against a host with no model would fail every night,
    // forever, and nothing would be watching.
    expect(deploy('install.sh')).toContain('systemctl disable --now pomnia-distill.timer')
  })
})

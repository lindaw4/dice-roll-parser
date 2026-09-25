import { randomInt } from 'node:crypto'
import type { DiceExpression, DiceTerm, Modifier, ModifierKind } from './parser.js'

export interface TermRoll {
  sign: 1 | -1
  description: string
  values: number[]
  kept: number[]
  subtotal: number
}

export interface RollResult {
  total: number
  rolls: TermRoll[]
}

// sides is assumed >= 2, which parse() already guarantees for any DiceTerm.
export type RandomSource = (sides: number) => number

const defaultRandomSource: RandomSource = (sides) => randomInt(1, sides + 1)

export function roll(expression: DiceExpression, randomSource: RandomSource = defaultRandomSource): RollResult {
  const rolls: TermRoll[] = []
  let total = 0

  for (const term of expression.terms) {
    if (term.type === 'constant') {
      rolls.push({
        sign: term.sign,
        description: `${term.value}`,
        values: [term.value],
        kept: [term.value],
        subtotal: term.value,
      })
      total += term.sign * term.value
      continue
    }

    const values: number[] = []
    for (let n = 0; n < term.count; n++) {
      const raw = randomSource(term.sides)
      values.push(term.fudge ? raw - 2 : raw)
    }

    const kept = applyModifiers(values, term.modifiers)
    const subtotal = kept.reduce((sum, value) => sum + value, 0)

    rolls.push({ sign: term.sign, description: describeDiceTerm(term), values, kept, subtotal })
    total += term.sign * subtotal
  }

  return { total, rolls }
}

function applyModifiers(values: number[], modifiers: Modifier[]): number[] {
  let indices = values.map((_, index) => index)

  for (const modifier of modifiers) {
    const sorted = [...indices].sort((a, b) => values[a] - values[b])
    switch (modifier.kind) {
      case 'keep-high':
        indices = sorted.slice(sorted.length - modifier.count)
        break
      case 'keep-low':
        indices = sorted.slice(0, modifier.count)
        break
      case 'drop-high':
        indices = sorted.slice(0, sorted.length - modifier.count)
        break
      case 'drop-low':
        indices = sorted.slice(modifier.count)
        break
    }
  }

  indices.sort((a, b) => a - b)
  return indices.map((index) => values[index])
}

function describeDiceTerm(term: DiceTerm): string {
  const modifierText = term.modifiers.map((m) => `${modifierKey(m.kind)}${m.count}`).join('')
  const sidesText = term.fudge ? 'F' : `${term.sides}`
  return `${term.count}d${sidesText}${modifierText}`
}

function modifierKey(kind: ModifierKind): string {
  switch (kind) {
    case 'keep-high':
      return 'kh'
    case 'keep-low':
      return 'kl'
    case 'drop-high':
      return 'dh'
    case 'drop-low':
      return 'dl'
  }
}

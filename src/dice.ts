import { randomInt } from 'node:crypto'

export interface ParseOptions {
  lenient?: boolean
}

export type ModifierKind = 'keep-high' | 'keep-low' | 'drop-high' | 'drop-low'

export interface Modifier {
  kind: ModifierKind
  count: number
}

export interface DiceTerm {
  type: 'dice'
  sign: 1 | -1
  count: number
  sides: number
  modifiers: Modifier[]
}

export interface ConstantTerm {
  type: 'constant'
  sign: 1 | -1
  value: number
}

export type Term = DiceTerm | ConstantTerm

export interface DiceExpression {
  terms: Term[]
  source: string
}

export class DiceSyntaxError extends Error {
  constructor(
    message: string,
    public readonly input: string,
    public readonly position: number,
  ) {
    super(`${message} (at position ${position} in "${input}")`)
    this.name = 'DiceSyntaxError'
  }
}

const MODIFIER_KEYWORDS: Record<string, ModifierKind> = {
  kh: 'keep-high',
  kl: 'keep-low',
  dh: 'drop-high',
  dl: 'drop-low',
}

const MAX_DICE_COUNT = 1000

// Parses dice notation into an AST without rolling anything, so callers can
// validate user input before touching randomness at all.
export function parse(rawInput: string, options: ParseOptions = {}): DiceExpression {
  const lenient = options.lenient ?? false
  const original = rawInput
  let input = rawInput

  if (/\s/.test(input)) {
    if (!lenient) {
      throw new DiceSyntaxError('whitespace is not allowed in strict mode', original, input.search(/\s/))
    }
    input = input.replace(/\s+/g, '')
  }

  if (input.length === 0) {
    throw new DiceSyntaxError('expression is empty', original, 0)
  }

  if (lenient) {
    input = input.replace(/D/g, 'd')
    for (const key of Object.keys(MODIFIER_KEYWORDS)) {
      input = input.replace(new RegExp(key, 'gi'), key)
    }
  }

  const terms: Term[] = []
  let i = 0
  let expectTerm = true

  while (i < input.length) {
    let sign: 1 | -1 = 1

    if (input[i] === '+' || input[i] === '-') {
      if (terms.length === 0 && input[i] === '+' && !lenient) {
        throw new DiceSyntaxError('a leading "+" is not allowed in strict mode', original, i)
      }
      sign = input[i] === '-' ? -1 : 1
      i++
      expectTerm = true
    } else if (!expectTerm) {
      throw new DiceSyntaxError(`expected "+" or "-" but found "${input[i]}"`, original, i)
    }

    const numStart = i
    while (i < input.length && isDigit(input[i])) i++
    const countText = input.slice(numStart, i)

    if (input[i] === 'd') {
      i++
      const sidesStart = i
      while (i < input.length && isDigit(input[i])) i++
      const sidesText = input.slice(sidesStart, i)
      if (sidesText.length === 0) {
        throw new DiceSyntaxError('expected a number of sides after "d"', original, i)
      }

      const count = countText.length === 0 ? 1 : parseStrictNumber(countText, original, numStart, lenient)
      const sides = parseStrictNumber(sidesText, original, sidesStart, lenient)

      const modifiers: Modifier[] = []
      while (true) {
        const key = input.slice(i, i + 2)
        const kind = MODIFIER_KEYWORDS[key]
        if (!kind) break
        i += 2
        const modStart = i
        while (i < input.length && isDigit(input[i])) i++
        const modText = input.slice(modStart, i)
        if (modText.length === 0) {
          throw new DiceSyntaxError(`expected a count after "${key}"`, original, i)
        }
        modifiers.push({ kind, count: parseStrictNumber(modText, original, modStart, lenient) })
      }

      if (count < 1 || count > MAX_DICE_COUNT) {
        throw new DiceSyntaxError(`dice count must be between 1 and ${MAX_DICE_COUNT}`, original, numStart)
      }
      if (sides < 2) {
        throw new DiceSyntaxError('a die must have at least 2 sides', original, sidesStart)
      }
      for (const modifier of modifiers) {
        if (modifier.count < 1 || modifier.count > count) {
          throw new DiceSyntaxError(`modifier count must be between 1 and ${count}`, original, numStart)
        }
      }

      terms.push({ type: 'dice', sign, count, sides, modifiers })
    } else if (countText.length > 0) {
      const value = parseStrictNumber(countText, original, numStart, lenient)
      terms.push({ type: 'constant', sign, value })
    } else if (i >= input.length) {
      throw new DiceSyntaxError('expression ends with a dangling operator', original, i)
    } else {
      throw new DiceSyntaxError(`unexpected character "${input[i]}"`, original, i)
    }

    expectTerm = false
  }

  return { terms, source: original }
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

function parseStrictNumber(text: string, original: string, position: number, lenient: boolean): number {
  if (!lenient && text.length > 1 && text[0] === '0') {
    throw new DiceSyntaxError(`leading zeros are not allowed ("${text}")`, original, position)
  }
  return parseInt(text, 10)
}

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
      values.push(randomSource(term.sides))
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
  return `${term.count}d${term.sides}${modifierText}`
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

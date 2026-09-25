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
  fudge: boolean
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
    input = input.replace(/f/gi, 'F')
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
      let sides: number
      let fudge = false

      if (input[i] === 'F') {
        i++
        sides = 3
        fudge = true
      } else if (input[i] === '%') {
        i++
        sides = 100
      } else {
        while (i < input.length && isDigit(input[i])) i++
        const sidesText = input.slice(sidesStart, i)
        if (sidesText.length === 0) {
          throw new DiceSyntaxError('expected a number of sides, "F", or "%" after "d"', original, i)
        }
        sides = parseStrictNumber(sidesText, original, sidesStart, lenient)
      }

      const count = countText.length === 0 ? 1 : parseStrictNumber(countText, original, numStart, lenient)

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

      terms.push({ type: 'dice', sign, count, sides, fudge, modifiers })
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

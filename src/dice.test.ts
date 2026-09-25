import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, roll, DiceSyntaxError, type RandomSource } from './dice.js'

// A random source that hands out a fixed sequence, wrapping around, so
// modifier tests don't depend on real randomness to be deterministic.
function sequence(...values: number[]): RandomSource {
  let i = 0
  return () => values[i++ % values.length]
}

test('parses a bare die with an implicit count of 1', () => {
  const expr = parse('d20')
  assert.equal(expr.terms.length, 1)
  const term = expr.terms[0]
  assert.equal(term.type, 'dice')
  if (term.type === 'dice') {
    assert.equal(term.count, 1)
    assert.equal(term.sides, 20)
    assert.deepEqual(term.modifiers, [])
  }
})

test('parses multiple terms chained with + and -', () => {
  const expr = parse('2d6+1d4-3')
  assert.equal(expr.terms.length, 3)
  assert.equal(expr.terms[0].sign, 1)
  assert.equal(expr.terms[1].sign, 1)
  assert.equal(expr.terms[2].sign, -1)
  assert.equal(expr.terms[2].type, 'constant')
})

test('parses each modifier keyword with its count', () => {
  for (const [key, kind] of [
    ['kh', 'keep-high'],
    ['kl', 'keep-low'],
    ['dh', 'drop-high'],
    ['dl', 'drop-low'],
  ] as const) {
    const expr = parse(`4d6${key}2`)
    const term = expr.terms[0]
    assert.equal(term.type, 'dice')
    if (term.type === 'dice') {
      assert.deepEqual(term.modifiers, [{ kind, count: 2 }])
    }
  }
})

test('parses stacked modifiers on the same dice term', () => {
  const expr = parse('4d6kh3dl1')
  const term = expr.terms[0]
  assert.equal(term.type, 'dice')
  if (term.type === 'dice') {
    assert.deepEqual(term.modifiers, [
      { kind: 'keep-high', count: 3 },
      { kind: 'drop-low', count: 1 },
    ])
  }
})

test('rejects whitespace in strict mode but accepts it lenient', () => {
  assert.throws(() => parse('1d20 + 5'), DiceSyntaxError)
  const expr = parse('1d20 + 5', { lenient: true })
  assert.equal(expr.terms.length, 2)
})

test('rejects uppercase D and modifier keys in strict mode', () => {
  assert.throws(() => parse('1D20'), DiceSyntaxError)
  assert.throws(() => parse('4d6KH3'), DiceSyntaxError)
  const expr = parse('4d6KH3', { lenient: true })
  const term = expr.terms[0]
  assert.equal(term.type, 'dice')
  if (term.type === 'dice') {
    assert.deepEqual(term.modifiers, [{ kind: 'keep-high', count: 3 }])
  }
})

test('rejects leading zeros in strict mode but accepts them lenient', () => {
  assert.throws(() => parse('1d06'), DiceSyntaxError)
  assert.throws(() => parse('01d20'), DiceSyntaxError)
  assert.equal(parse('1d06', { lenient: true }).terms[0].type, 'dice')
})

test('rejects a leading + in strict mode but accepts it lenient', () => {
  assert.throws(() => parse('+1d6'), DiceSyntaxError)
  const expr = parse('+1d6', { lenient: true })
  assert.equal(expr.terms[0].sign, 1)
})

test('rejects dangling and doubled operators', () => {
  assert.throws(() => parse('1d6+'), DiceSyntaxError)
  assert.throws(() => parse('1d6++2'), DiceSyntaxError)
})

test('rejects an empty expression', () => {
  assert.throws(() => parse(''), DiceSyntaxError)
})

test('rejects a die with fewer than 2 sides', () => {
  assert.throws(() => parse('1d1'), DiceSyntaxError)
})

test('rejects a dice count above the maximum', () => {
  assert.throws(() => parse('1001d6'), DiceSyntaxError)
})

test('rejects a modifier count greater than the dice count', () => {
  assert.throws(() => parse('4d6kh5'), DiceSyntaxError)
})

test('rolls a constant term as its plain value', () => {
  const expr = parse('5')
  const result = roll(expr)
  assert.equal(result.total, 5)
  assert.deepEqual(result.rolls[0].values, [5])
})

test('keep-high drops the lowest rolls but preserves original order', () => {
  const expr = parse('4d6kh3')
  const result = roll(expr, sequence(5, 1, 4, 2))
  assert.deepEqual(result.rolls[0].values, [5, 1, 4, 2])
  assert.deepEqual(result.rolls[0].kept, [5, 4, 2])
  assert.equal(result.rolls[0].subtotal, 11)
  assert.equal(result.total, 11)
})

test('drop-low removes the lowest rolls and keeps the rest in order', () => {
  const expr = parse('4d6dl1')
  const result = roll(expr, sequence(5, 1, 4, 2))
  assert.deepEqual(result.rolls[0].kept, [5, 4, 2])
})

test('a negative sign subtracts the term subtotal from the total', () => {
  const expr = parse('2d6-1d4')
  const result = roll(expr, sequence(6, 6, 3))
  assert.equal(result.total, 12 - 3)
})

test('parses fudge dice with an implicit count of 1', () => {
  const expr = parse('dF')
  const term = expr.terms[0]
  assert.equal(term.type, 'dice')
  if (term.type === 'dice') {
    assert.equal(term.count, 1)
    assert.equal(term.sides, 3)
    assert.equal(term.fudge, true)
  }
})

test('rejects lowercase fudge dice in strict mode but accepts it lenient', () => {
  assert.throws(() => parse('4df'), DiceSyntaxError)
  const expr = parse('4df', { lenient: true })
  const term = expr.terms[0]
  assert.equal(term.type, 'dice')
  if (term.type === 'dice') {
    assert.equal(term.fudge, true)
  }
})

test('rolls fudge dice as -1, 0, or +1 per die', () => {
  const expr = parse('4dF')
  const result = roll(expr, sequence(1, 2, 3, 2))
  assert.deepEqual(result.rolls[0].values, [-1, 0, 1, 0])
  assert.equal(result.rolls[0].description, '4dF')
  assert.equal(result.total, 0)
})

test('parses percentile shorthand as an ordinary d100', () => {
  const expr = parse('d%')
  const term = expr.terms[0]
  assert.equal(term.type, 'dice')
  if (term.type === 'dice') {
    assert.equal(term.sides, 100)
    assert.equal(term.fudge, false)
  }
  const result = roll(expr, sequence(42))
  assert.equal(result.total, 42)
})

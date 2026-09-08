#!/usr/bin/env node
import { parse, roll, DiceSyntaxError } from './dice.js'

function main(argv: string[]): number {
  const lenient = argv.includes('--lenient')
  const args = argv.filter((arg) => arg !== '--lenient')

  if (args.length === 0) {
    printUsage()
    return 1
  }

  const notation = args.join('')

  let expression
  try {
    expression = parse(notation, { lenient })
  } catch (error) {
    if (error instanceof DiceSyntaxError) {
      console.error(`dice: ${error.message}`)
      if (!lenient) {
        console.error('dice: pass --lenient to accept loosely formatted notation')
      }
      return 1
    }
    throw error
  }

  const result = roll(expression)

  for (const termRoll of result.rolls) {
    const sign = termRoll.sign === -1 ? '-' : '+'
    console.log(`  ${sign} ${termRoll.description}: [${termRoll.values.join(', ')}] -> ${termRoll.subtotal}`)
  }
  console.log(`total: ${result.total}`)

  return 0
}

function printUsage(): void {
  console.error('usage: dice [--lenient] <notation>')
  console.error('example: dice 4d6kh3+2')
}

process.exitCode = main(process.argv.slice(2))

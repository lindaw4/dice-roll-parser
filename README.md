# dice-roll-parser

A parser and roller for tabletop dice notation, like `2d6+3` or `4d6kh3`.

Most dice notation parsers I've seen accept almost anything: mixed case,
stray whitespace, leading zeros, whatever. That's fine if you're the only
one typing the notation, but it's a liability the moment the string comes
from a text field, a chat command, or a saved character sheet someone
edited by hand. A typo like `1d20 +5` (space before the modifier) or
`1D20+05` shouldn't silently roll the wrong thing.

So this library parses strictly by default and rejects anything that
doesn't match the canonical form. If you genuinely want to accept messy
input, you ask for it explicitly with a `lenient` option (or `--lenient`
on the CLI).

## What "strict" actually means

In strict mode, all of the following are rejected:

- any whitespace (`1d20 + 5`)
- uppercase `D` or uppercase modifier keys (`1D20`, `4d6KH3`)
- leading zeros on any number (`1d06`, `01d20`)
- a leading `+` on the first term (`+1d6`)
- dangling or doubled operators (`1d6+`, `1d6++2`)

`--lenient` normalizes all of the above instead of rejecting them. It does
not relax semantic checks: a die still needs at least 2 sides, dice counts
are still capped, and a `kh`/`kl`/`dh`/`dl` count still can't exceed the
number of dice rolled. Lenient means "forgive the formatting," not
"accept nonsense."

## Notation supported

```
NdS            roll N dice with S sides each (N defaults to 1, so "d20" is "1d20")
NdSkhK         keep the highest K of the N rolls
NdSklK         keep the lowest K of the N rolls
NdSdhK         drop the highest K of the N rolls
NdSdlK         drop the lowest K of the N rolls
+N / -N        a flat modifier
```

Terms chain with `+` and `-`, e.g. `4d6kh3+2d4-1`.

## Library usage

```ts
import { parse, roll } from 'dice-roll-parser'

const expression = parse('4d6kh3+2')
const result = roll(expression)

console.log(result.total)
// e.g. 15

for (const term of result.rolls) {
  console.log(term.description, term.values, '->', term.subtotal)
}
// 4d6kh3 [ 2, 4, 5, 6 ] -> 15
// 2 [ 2 ] -> 2
```

`parse` throws a `DiceSyntaxError` (with the offending position) on bad
input, so you can catch it and show the user exactly where things went
wrong:

```ts
import { parse, DiceSyntaxError } from 'dice-roll-parser'

try {
  parse('1D20 + 5')
} catch (error) {
  if (error instanceof DiceSyntaxError) {
    console.error(error.message)
    // Try again with { lenient: true } if the input isn't trusted.
  }
}
```

`roll` also accepts a custom random source (`(sides: number) => number`)
if you need deterministic rolls for tests, or a different source of
randomness than `node:crypto`.

## CLI usage

```
npm run build
node dist/cli.js 4d6kh3+2
  + 4d6kh3: [2, 4, 5, 6] -> 15
  + 2: [2] -> 2
total: 17

node dist/cli.js "1D20 + 5"
dice: expected "+" or "-" but found "D" (at position 1 in "1D20 + 5")
dice: pass --lenient to accept loosely formatted notation

node dist/cli.js --lenient "1D20 + 5"
  + 1d20: [14] -> 14
  + 5: [5] -> 5
total: 19
```

Once published, the CLI is also reachable as `dice` via the `bin` entry
in package.json.

## Building

There are no third-party dependencies. `npm run build` runs `tsc` and
writes plain JS to `dist/`.

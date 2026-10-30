# Game of Life

Conway's Game of Life in the browser — a small, dependency-free cellular-automaton
engine plus a canvas UI you can draw on.

![B3/S23](https://img.shields.io/badge/rule-B3%2FS23-6ee7ff)

## What it does

- **Draw** — click or drag on the board to paint cells; click a live cell (or
  shift-click) to erase.
- **Run** — play/pause, single-step, clear, or randomize with an adjustable density.
- **Patterns** — load a glider, blinker, toad, beacon, pulsar, lightweight
  spaceship or R-pentomino from the preset menu.
- **Boards** — 64×48 up to 160×120 cells, with optional toroidal (wrapping) edges.
- **HUD** — generation counter, live population, board size and edge mode.

Keyboard: `space` play/pause, `n` step, `r` randomize, `c` clear.

## Run it

No build step, no dependencies. Open `index.html` in a browser, or serve the
folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## The engine

`life.js` is the whole simulation: a flat `Uint8Array` board and a B3/S23 step
function. It works in the browser (`window.Life`) and in Node
(`require('./life.js')`), so the page and the tests run the same code.

```js
const Life = require('./life.js');

let grid = Life.createGrid(40, 30);
const glider = Life.parseRLE(Life.PRESETS.Glider);
const at = Life.centerOffset(40, 30, glider);
grid = Life.place(grid, 40, 30, glider, at.col, at.row, /* wrap */ true);

for (let gen = 0; gen < 10; gen++) {
  grid = Life.step(grid, 40, 30, { wrap: true });
  console.log(gen, Life.population(grid));
}
```

API: `createGrid`, `step`, `population`, `neighbors`, `get`, `toRows`,
`fromRows`, `patternFromRows`, `parseRLE`, `place`, `centerOffset`, `randomFill`
(seeded with `mulberry32`), and `PRESETS`.

`step` is pure — it returns a new grid and never mutates its input.

## Tests

```bash
node --test
```

23 tests cover the classic patterns (blinker, toad, beacon, pulsar, glider and
LWSS translations), the B3/S23 rules, toroidal vs. clipped edges, RLE parsing,
pattern stamping, determinism of the seeded randomizer, a multi-size/multi-density
sweep that asserts births and deaths both occur, and the page wiring in
`index.html`.

## License

MIT

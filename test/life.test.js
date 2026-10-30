'use strict';

/*
 * Test suite for the Game of Life engine (life.js) and the page wiring
 * (index.html). Run with:  node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Life = require('../life.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Build a grid from '#'/'.' picture rows, centred on a pad x pad board. */
function board(lines, pad = 8, wrap = false) {
  const cols = Math.max(...lines.map((l) => l.length)) + pad * 2;
  const rows = lines.length + pad * 2;
  const grid = Life.createGrid(cols, rows);
  const pattern = Life.patternFromRows(lines);
  const off = Life.centerOffset(cols, rows, pattern);
  return {
    cols,
    rows,
    grid: Life.place(grid, cols, rows, pattern, off.col, off.row, wrap)
  };
}

function picture(grid, cols, rows) {
  return Life.toRows(grid, cols, rows);
}

/** Bounding box of the living cells, or null for an empty board. */
function bbox(grid, cols, rows) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let pop = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!grid[row * cols + col]) continue;
      pop++;
      if (col < minX) minX = col;
      if (col > maxX) maxX = col;
      if (row < minY) minY = row;
      if (row > maxY) maxY = row;
    }
  }
  if (pop === 0) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, pop };
}

/** Crop to the bounding box, then render as '#'/'.' rows (translation-free). */
function shape(grid, cols, rows) {
  const box = bbox(grid, cols, rows);
  if (!box) return [];
  const out = [];
  for (let row = box.minY; row <= box.maxY; row++) {
    let line = '';
    for (let col = box.minX; col <= box.maxX; col++) {
      line += grid[row * cols + col] ? '#' : '.';
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classic patterns
// ---------------------------------------------------------------------------

test('blinker oscillates with period 2', () => {
  const b = board(['.#.', '.#.', '.#.']);
  const one = Life.step(b.grid, b.cols, b.rows, { wrap: false });
  assert.deepEqual(shape(one, b.cols, b.rows), ['###']);
  const two = Life.step(one, b.cols, b.rows, { wrap: false });
  assert.deepEqual(picture(two, b.cols, b.rows), picture(b.grid, b.cols, b.rows));
});

test('block is a still life', () => {
  const b = board(['##', '##']);
  const after = Life.step(b.grid, b.cols, b.rows);
  assert.deepEqual(picture(after, b.cols, b.rows), picture(b.grid, b.cols, b.rows));
});

test('glider translates one cell diagonally every four generations', () => {
  const b = board(['.#.', '..#', '###'], 12);
  const start = bbox(b.grid, b.cols, b.rows);
  let grid = b.grid;
  for (let i = 0; i < 4; i++) grid = Life.step(grid, b.cols, b.rows, { wrap: false });
  const end = bbox(grid, b.cols, b.rows);
  assert.equal(end.pop, 5);
  assert.deepEqual(shape(grid, b.cols, b.rows), shape(b.grid, b.cols, b.rows));
  assert.equal(end.minX - start.minX, 1);
  assert.equal(end.minY - start.minY, 1);
});

test('toad has period 2', () => {
  const b = board(['.###', '###.'], 6);
  const one = Life.step(b.grid, b.cols, b.rows, { wrap: false });
  assert.notDeepEqual(picture(one, b.cols, b.rows), picture(b.grid, b.cols, b.rows));
  const two = Life.step(one, b.cols, b.rows, { wrap: false });
  assert.deepEqual(picture(two, b.cols, b.rows), picture(b.grid, b.cols, b.rows));
});

test('beacon has period 2 and breathes between 8 and 6 cells', () => {
  const b = board(['##..', '##..', '..##', '..##'], 6);
  const one = Life.step(b.grid, b.cols, b.rows, { wrap: false });
  assert.equal(Life.population(one), 6);
  const two = Life.step(one, b.cols, b.rows, { wrap: false });
  assert.equal(Life.population(two), 8);
  assert.deepEqual(picture(two, b.cols, b.rows), picture(b.grid, b.cols, b.rows));
});

test('pulsar has period 3', () => {
  const pattern = Life.parseRLE(Life.PRESETS.Pulsar);
  assert.equal(pattern.width, 13);
  assert.equal(pattern.height, 13);
  assert.equal(pattern.cells.length, 48);

  const b = board(shape(Life.place(Life.createGrid(13, 13), 13, 13, pattern, 0, 0, false), 13, 13), 10);
  const start = picture(b.grid, b.cols, b.rows);
  const seen = [];
  const pops = [Life.population(b.grid)];
  let grid = b.grid;
  for (let gen = 1; gen <= 3; gen++) {
    grid = Life.step(grid, b.cols, b.rows, { wrap: false });
    seen.push(picture(grid, b.cols, b.rows));
    pops.push(Life.population(grid));
  }
  assert.notDeepEqual(seen[0], start, 'pulsar must not be a still life');
  assert.notDeepEqual(seen[1], start, 'pulsar must not have period 2');
  assert.deepEqual(seen[2], start, 'pulsar must return after 3 generations');
  assert.deepEqual(pops, [48, 56, 72, 48], 'pulsar population cycle is 48 -> 56 -> 72 -> 48');
});

test('lightweight spaceship travels two cells sideways every four generations', () => {
  const pattern = Life.parseRLE(Life.PRESETS.LWSS);
  const cols = 40;
  const rows = 40;
  let grid = Life.place(Life.createGrid(cols, rows), cols, rows, pattern, 10, 10, false);
  const start = bbox(grid, cols, rows);
  for (let i = 0; i < 4; i++) grid = Life.step(grid, cols, rows, { wrap: false });
  const end = bbox(grid, cols, rows);
  assert.equal(end.pop, 9);
  assert.deepEqual(shape(grid, cols, rows), shape(
    Life.place(Life.createGrid(cols, rows), cols, rows, pattern, 10, 10, false), cols, rows));
  assert.equal(Math.abs(end.minX - start.minX), 2);
  assert.equal(end.minY - start.minY, 0);
});

// ---------------------------------------------------------------------------
// Rules and edge behaviour
// ---------------------------------------------------------------------------

test('B3/S23: lone cells die, crowded cells die, three parents make a birth', () => {
  const lone = board(['#'], 4);
  assert.equal(Life.population(Life.step(lone.grid, lone.cols, lone.rows, { wrap: false })), 0);

  // A solid 3x3: the four corners have exactly 3 neighbours and live, the
  // centre has 8 and dies, and four outside cells each see 3 -> births.
  const block = Life.fromRows(['.....', '.###.', '.###.', '.###.', '.....']);
  const next = Life.step(block.grid, block.cols, block.rows, { wrap: false });
  assert.equal(next[1 * 5 + 1], 1, 'corner survives with 3 neighbours');
  assert.equal(next[2 * 5 + 2], 0, 'crowded centre dies');
  assert.equal(next[0 * 5 + 2], 1, 'a dead cell with exactly 3 neighbours is born');
  assert.equal(Life.population(next), 8);

  const birth = board(['##.', '##.', '.##'], 4);
  assert.ok(Life.population(Life.step(birth.grid, birth.cols, birth.rows, { wrap: false })) > 0);
});

test('neighbors counts the eight surrounding cells', () => {
  const b = board(['###', '#.#', '###'], 4);
  const mid = Life.centerOffset(b.cols, b.rows, Life.patternFromRows(['###', '#.#', '###']));
  assert.equal(Life.neighbors(b.grid, b.cols, b.rows, mid.col + 1, mid.row + 1, false), 8);
  // A ring corner only touches its two ring neighbours, not the far side.
  assert.equal(Life.neighbors(b.grid, b.cols, b.rows, mid.col, mid.row, false), 2);
  // Outside a clipped board everything is dead.
  assert.equal(Life.neighbors(b.grid, b.cols, b.rows, 0, 0, false), 0);
});

test('wrap joins opposite edges, no-wrap treats the outside as dead', () => {
  const cols = 6;
  const rows = 6;
  const grid = Life.createGrid(cols, rows);
  grid[5 * cols + 5] = 1; // bottom-right corner
  assert.equal(Life.get(grid, cols, rows, -1, -1, true), 1, '-1 wraps to the last column/row');
  assert.equal(Life.get(grid, cols, rows, -1, -1, false), 0);
  assert.equal(Life.get(grid, cols, rows, cols, rows, false), 0);

  const corner = Life.createGrid(cols, rows);
  corner[0] = 1; // top-left
  assert.equal(Life.get(corner, cols, rows, cols, rows, true), 1, 'cols/rows wrap to 0');
  const tiny = Life.createGrid(1, 1);
  tiny[0] = 1;
  assert.equal(Life.get(tiny, 1, 1, -1, -1, true), 1, 'a 1x1 board is its own neighbour');

  // Three cells in a row across the seam: on a torus they are a normal
  // blinker (it turns vertical across the seam); without wrap the trio just
  // dies at the edge. Same cells, opposite outcome.
  const seam = Life.createGrid(cols, rows);
  seam[0 * cols + cols - 1] = 1;
  seam[0 * cols + 0] = 1;
  seam[0 * cols + 1] = 1;
  const wrapped = Life.step(seam, cols, rows, { wrap: true });
  const clipped = Life.step(seam, cols, rows, { wrap: false });
  assert.equal(Life.population(wrapped), 3, 'wrapped blinker survives');
  assert.equal(wrapped[0 * cols + 0], 1);
  assert.equal(wrapped[1 * cols + 0], 1);
  assert.equal(wrapped[5 * cols + 0], 1);
  assert.equal(Life.population(clipped), 0, 'without wrap every cell is over-exposed to the edge');
  const wrapped2 = Life.step(wrapped, cols, rows, { wrap: true });
  assert.deepEqual(picture(wrapped2, cols, rows), picture(seam, cols, rows));
});

test('step is pure and never mutates its input', () => {
  const b = board(['.#.', '..#', '###'], 6);
  const before = picture(b.grid, b.cols, b.rows);
  const copy = Uint8Array.from(b.grid);
  Life.step(b.grid, b.cols, b.rows, { wrap: true });
  assert.deepEqual(picture(b.grid, b.cols, b.rows), before);
  assert.deepEqual(Array.from(b.grid), Array.from(copy));
});

test('step and createGrid reject bad dimensions', () => {
  let err = null;
  try {
    Life.createGrid(0, 5);
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'zero width must throw');
  assert.equal(err.name, 'RangeError');

  err = null;
  try {
    Life.createGrid(3.5, 4);
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'fractional width must throw');
  assert.equal(err.name, 'RangeError');

  err = null;
  try {
    Life.step(new Uint8Array(4), 3, 3);
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'mismatched grid length must throw');
  assert.equal(err.name, 'RangeError');
});

test('population counts any non-zero cell', () => {
  const grid = Uint8Array.from([0, 1, 2, 0, 9, 0]);
  assert.equal(Life.population(grid), 3);
  assert.equal(Life.population(new Uint8Array(10)), 0);
});

// ---------------------------------------------------------------------------
// RLE parsing, grids of text, stamping
// ---------------------------------------------------------------------------

test('parseRLE reads the header, comments, run counts and row breaks', () => {
  const text = [
    '#N Glider',
    '#O the smallest spaceship',
    'x = 3, y = 3, rule = B3/S23',
    'bo$2bo$3o!'
  ].join('\n');
  const p = Life.parseRLE(text);
  assert.equal(p.width, 3);
  assert.equal(p.height, 3);
  assert.equal(p.rule, 'B3/S23');
  assert.deepEqual(p.cells, [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);

  const multi = Life.parseRLE('x = 4, y = 3, rule = B3/S23\n2o2b$b2o$3bo!');
  assert.deepEqual(multi.cells, [[0, 0], [1, 0], [1, 1], [2, 1], [3, 2]]);

  const skipped = Life.parseRLE('x = 3, y = 4\n3o2$3o!');
  assert.deepEqual(skipped.cells, [
    [0, 0], [1, 0], [2, 0],
    [0, 2], [1, 2], [2, 2]
  ]);
  assert.equal(skipped.rule, 'B3/S23', 'rule defaults to B3/S23');
});

test('parseRLE rejects junk instead of guessing', () => {
  for (const bad of ['x = 1, y = 1\nbo$x!', 'x = 2, y = 2\n2z!', 'x = 2, y = 2\n']) {
    let err = null;
    try {
      Life.parseRLE(bad);
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'expected a throw for ' + JSON.stringify(bad));
    assert.ok(err.name === 'SyntaxError' || err.name === 'RangeError');
  }
});

test('fromRows pads ragged input and toRows round-trips', () => {
  const b = Life.fromRows(['##', '#', '####']);
  assert.equal(b.cols, 4);
  assert.equal(b.rows, 3);
  assert.deepEqual(Life.toRows(b.grid, b.cols, b.rows), ['##..', '#...', '####']);

  const padded = Life.fromRows(['#', '##']);
  assert.deepEqual(Life.toRows(padded.grid, padded.cols, padded.rows), ['#.', '##']);
});

test('place stamps a pattern and clips or wraps off-board cells', () => {
  const pattern = Life.patternFromRows(['##', '##']);
  const cols = 5;
  const rows = 5;

  const clipped = Life.place(Life.createGrid(cols, rows), cols, rows, pattern, 3, 3, false);
  assert.equal(Life.population(clipped), 4, 'all four cells still land on the board');

  const clippedEdge = Life.place(Life.createGrid(cols, rows), cols, rows, pattern, 4, 4, false);
  assert.equal(Life.population(clippedEdge), 1, 'only the (4,4) cell survives clipping');

  const wrapped = Life.place(Life.createGrid(cols, rows), cols, rows, pattern, 4, 4, true);
  assert.equal(Life.population(wrapped), 4, 'wrapping keeps every cell');
  assert.equal(wrapped[4 * cols + 4], 1);
  assert.equal(wrapped[0 * cols + 0], 1);
  assert.equal(wrapped[4 * cols + 0], 1, 'row wraps around');
});

test('centerOffset centres odd and even patterns', () => {
  assert.deepEqual(Life.centerOffset(10, 10, { width: 4, height: 4 }), { col: 3, row: 3 });
  assert.deepEqual(Life.centerOffset(10, 10, { width: 3, height: 3 }), { col: 3, row: 3 });
  assert.deepEqual(Life.centerOffset(9, 7, { width: 4, height: 2 }), { col: 2, row: 2 });
});

test('randomFill honours density limits and a seeded PRNG reproduces the board', () => {
  const empty = Life.createGrid(20, 20);
  assert.equal(Life.randomFill(empty, 0, Life.mulberry32(1)), 0);
  assert.equal(Life.randomFill(empty, 1, Life.mulberry32(1)), 400);

  const a = Life.createGrid(30, 20);
  const b = Life.createGrid(30, 20);
  const filledA = Life.randomFill(a, 0.3, Life.mulberry32(42));
  const filledB = Life.randomFill(b, 0.3, Life.mulberry32(42));
  assert.equal(filledA, filledB);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.ok(Math.abs(filledA / 600 - 0.3) < 0.08, 'density should land near 30%, got ' + filledA);

  const other = Life.createGrid(30, 20);
  Life.randomFill(other, 0.3, Life.mulberry32(43));
  assert.notDeepEqual(Array.from(other), Array.from(a), 'different seeds must differ');
});

test('every shipped preset parses and survives a step', () => {
  const names = Object.keys(Life.PRESETS);
  assert.ok(names.length >= 6);
  for (const name of names) {
    const p = Life.parseRLE(Life.PRESETS[name]);
    assert.ok(p.cells.length > 0, name + ' should not be empty');
    for (const [x, y] of p.cells) {
      assert.ok(x >= 0 && x < p.width, name + ' x in range');
      assert.ok(y >= 0 && y < p.height, name + ' y in range');
    }
    const cols = p.width + 20;
    const rows = p.height + 20;
    let grid = Life.place(Life.createGrid(cols, rows), cols, rows, p, 10, 10, false);
    for (let i = 0; i < 3; i++) grid = Life.step(grid, cols, rows, { wrap: false });
    assert.ok(Life.population(grid) > 0, name + ' should still be alive after 3 steps');
  }
});

// ---------------------------------------------------------------------------
// Sweep: many boards, sizes and seeds at once
// ---------------------------------------------------------------------------

test('sweep: random boards stay well-formed and exercise births and deaths', () => {
  const sizes = [[8, 8], [9, 7], [16, 12], [31, 17], [40, 30]];
  const densities = [0.05, 0.3, 0.7];
  let births = 0;
  let deaths = 0;
  let grew = 0;
  let shrank = 0;
  let stayed = 0;
  let generations = 0;

  for (const [cols, rows] of sizes) {
    for (const density of densities) {
      for (let seed = 0; seed < 4; seed++) {
        const rand = Life.mulberry32((cols * 10000 + rows * 100 + seed) ^ 0x5f3759df);
        const grid = Life.createGrid(cols, rows);
        Life.randomFill(grid, density, rand);

        let current = grid;
        for (let t = 0; t < 4; t++) {
          const next = Life.step(current, cols, rows, { wrap: (seed + t) % 2 === 0 });
          assert.equal(next.length, cols * rows);
          assert.equal(next.constructor, Uint8Array);
          generations++;

          let before = 0;
          let after = 0;
          for (let i = 0; i < next.length; i++) {
            assert.ok(next[i] === 0 || next[i] === 1, 'cells must be 0 or 1');
            if (current[i]) before++;
            if (next[i]) after++;
            if (!current[i] && next[i]) births++;
            if (current[i] && !next[i]) deaths++;
          }
          if (after > before) grew++;
          else if (after < before) shrank++;
          else stayed++;
          current = next;
        }

        // Same seed, same board, same result -> deterministic.
        const replay = Life.createGrid(cols, rows);
        Life.randomFill(replay, density, Life.mulberry32((cols * 10000 + rows * 100 + seed) ^ 0x5f3759df));
        assert.deepEqual(Array.from(replay), Array.from(grid));
      }
    }
  }

  assert.ok(generations >= 140, 'sweep should run plenty of generations, ran ' + generations);
  assert.ok(births > 0, 'sweep never produced a birth');
  assert.ok(deaths > 0, 'sweep never produced a death');
  assert.ok(grew > 0, 'sweep never grew a population');
  assert.ok(shrank > 0, 'sweep never shrank a population');
  assert.ok(stayed > 0, 'sweep never held a population steady');
});

// ---------------------------------------------------------------------------
// The page itself
// ---------------------------------------------------------------------------

test('index.html loads the engine and the UI script parses', () => {
  assert.match(HTML, /<script src="life\.js"><\/script>/, 'page must load life.js');
  assert.match(HTML, /<canvas id="board"/, 'page needs a board canvas');

  const match = /<script data-module="ui">([\s\S]*?)<\/script>/.exec(HTML);
  assert.ok(match, 'index.html must contain a data-module="ui" script');
  assert.doesNotThrow(() => new vm.Script(match[1], { filename: 'index-ui.js' }));

  // The UI script guards on `document`; in a bare context it must simply return.
  assert.doesNotThrow(() => vm.runInNewContext(match[1], {}, { filename: 'index-ui.js' }));
});

test('index.html wires up every element the UI script reaches for', () => {
  const ids = new Set();
  const idPattern = /id="([^"]+)"/g;
  let m;
  while ((m = idPattern.exec(HTML))) {
    assert.ok(!ids.has(m[1]), 'duplicate id: ' + m[1]);
    ids.add(m[1]);
  }
  for (const id of ['board', 'gen', 'pop', 'dims', 'edge', 'play', 'step', 'clear', 'random',
    'preset', 'load', 'speed', 'speedVal', 'density', 'densityVal', 'size', 'wrap']) {
    assert.ok(ids.has(id), 'missing element #' + id);
  }
  const ui = /<script data-module="ui">([\s\S]*?)<\/script>/.exec(HTML)[1];
  const referenced = [...ui.matchAll(/getElementById\('([^']+)'\)/g)].map((x) => x[1]);
  assert.ok(referenced.length > 0);
  for (const id of referenced) assert.ok(ids.has(id), 'UI references missing #' + id);
});

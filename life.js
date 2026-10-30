/*
 * Conway's Game of Life -- dependency-free core engine.
 *
 * Works in the browser (attaches `window.Life`) and in Node
 * (`require('./life.js')`), so the exact same code that powers the page is
 * the code under test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Life = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assertDims(cols, rows) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      var err = new RangeError('cols and rows must be positive integers');
      err.name = 'RangeError';
      throw err;
    }
  }

  /** Fresh empty board as a flat Uint8Array (row-major). */
  function createGrid(cols, rows) {
    assertDims(cols, rows);
    return new Uint8Array(cols * rows);
  }

  /** Number of living cells. Any non-zero value counts as alive. */
  function population(grid) {
    var n = 0;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i]) n++;
    }
    return n;
  }

  /**
   * Read a cell. `wrap` treats the board as a torus; otherwise cells outside
   * the board are dead.
   */
  function get(grid, cols, rows, col, row, wrap) {
    if (wrap) {
      col = ((col % cols) + cols) % cols;
      row = ((row % rows) + rows) % rows;
    } else if (col < 0 || row < 0 || col >= cols || row >= rows) {
      return 0;
    }
    return grid[row * cols + col] ? 1 : 0;
  }

  /** Living neighbours (Moore neighbourhood, 8 cells). */
  function neighbors(grid, cols, rows, col, row, wrap) {
    var n = 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        n += get(grid, cols, rows, col + dx, row + dy, wrap);
      }
    }
    return n;
  }

  /**
   * One generation of B3/S23. Returns a new grid, never mutates the input.
   * options.wrap defaults to true.
   */
  function step(grid, cols, rows, options) {
    assertDims(cols, rows);
    if (grid.length !== cols * rows) {
      var err = new RangeError('grid length ' + grid.length + ' does not match ' + cols + 'x' + rows);
      err.name = 'RangeError';
      throw err;
    }
    var wrap = !(options && options.wrap === false);
    var out = new Uint8Array(cols * rows);
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var alive = grid[row * cols + col] ? 1 : 0;
        var n = neighbors(grid, cols, rows, col, row, wrap);
        out[row * cols + col] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
      }
    }
    return out;
  }

  /** Grid -> array of '#'/'.' strings (handy for tests and debugging). */
  function toRows(grid, cols, rows) {
    var out = [];
    for (var row = 0; row < rows; row++) {
      var line = '';
      for (var col = 0; col < cols; col++) {
        line += grid[row * cols + col] ? '#' : '.';
      }
      out.push(line);
    }
    return out;
  }

  /** Array of '#'/'.' strings -> { cols, rows, grid }. Ragged rows are padded. */
  function fromRows(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
      var err = new Error('fromRows needs a non-empty array of strings');
      err.name = 'RangeError';
      throw err;
    }
    var cols = 0;
    var i;
    for (i = 0; i < lines.length; i++) {
      if (cols < lines[i].length) cols = lines[i].length;
    }
    var rows = lines.length;
    var grid = createGrid(cols, rows);
    for (var row = 0; row < rows; row++) {
      var line = lines[row];
      for (var col = 0; col < line.length; col++) {
        var ch = line[col];
        grid[row * cols + col] = ch === '#' || ch === 'O' || ch === 'o' ? 1 : 0;
      }
    }
    return { cols: cols, rows: rows, grid: grid };
  }

  /** Array of '#'/'.' strings -> pattern object { width, height, cells }. */
  function patternFromRows(lines) {
    var b = fromRows(lines);
    var cells = [];
    for (var row = 0; row < b.rows; row++) {
      for (var col = 0; col < b.cols; col++) {
        if (b.grid[row * b.cols + col]) cells.push([col, row]);
      }
    }
    return { width: b.cols, height: b.rows, cells: cells };
  }

  /**
   * Parse a Run Length Encoded pattern (the classic .rle text format).
   * Comments start with '#', the header is `x = 3, y = 3, rule = B3/S23`.
   * Returns { width, height, rule, cells: [[x, y], ...] }.
   */
  function parseRLE(text) {
    var lines = String(text).split(/\r?\n/);
    var width = 0;
    var height = 0;
    var rule = 'B3/S23';
    var body = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.charAt(0) === '#') continue;
      var header = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*(?:,\s*rule\s*=\s*([A-Za-z0-9/]+))?/i.exec(line);
      if (header) {
        width = parseInt(header[1], 10);
        height = parseInt(header[2], 10);
        if (header[3]) rule = header[3];
        continue;
      }
      body.push(line);
    }
    var data = body.join('');
    if (!data) {
      var empty = new Error('RLE body is empty');
      empty.name = 'RangeError';
      throw empty;
    }
    var cells = [];
    var x = 0;
    var y = 0;
    var run = 0;
    var maxX = 0;
    var maxY = 0;
    for (var k = 0; k < data.length; k++) {
      var ch = data[k];
      if (ch >= '0' && ch <= '9') {
        run = run * 10 + (ch.charCodeAt(0) - 48);
        continue;
      }
      var count = run === 0 ? 1 : run;
      run = 0;
      if (ch === 'b' || ch === 'B' || ch === '.') {
        x += count;
      } else if (ch === 'o' || ch === 'O' || ch === '*') {
        for (var c = 0; c < count; c++) cells.push([x + c, y]);
        x += count;
      } else if (ch === '$') {
        y += count;
        x = 0;
        if (y > maxY) maxY = y;
      } else if (ch === '!') {
        break;
      } else if (ch === ' ' || ch === '\t') {
        continue;
      } else {
        var bad = new Error('unexpected character in RLE: ' + JSON.stringify(ch));
        bad.name = 'SyntaxError';
        throw bad;
      }
      if (x > maxX) maxX = x;
      if (y + 1 > maxY) maxY = y + 1;
    }
    return {
      width: width || maxX,
      height: height || maxY,
      rule: rule,
      cells: cells
    };
  }

  /**
   * Stamp a pattern onto a copy of the grid at (col, row). Cells that fall
   * outside a non-wrapping board are dropped.
   */
  function place(grid, cols, rows, pattern, col, row, wrap) {
    assertDims(cols, rows);
    var out = new Uint8Array(grid);
    var cells = pattern.cells;
    for (var i = 0; i < cells.length; i++) {
      var x = col + cells[i][0];
      var y = row + cells[i][1];
      var tx = x;
      var ty = y;
      if (wrap) {
        tx = ((x % cols) + cols) % cols;
        ty = ((y % rows) + rows) % rows;
      } else if (x < 0 || y < 0 || x >= cols || y >= rows) {
        continue;
      }
      out[ty * cols + tx] = 1;
    }
    return out;
  }

  /** Top-left corner that centres a pattern on the board. */
  function centerOffset(cols, rows, pattern) {
    return {
      col: Math.floor((cols - pattern.width) / 2),
      row: Math.floor((rows - pattern.height) / 2)
    };
  }

  /**
   * Fill a grid in place with random cells at the given density.
   * `rand` is any () -> [0,1) function, so tests can pass a seeded PRNG.
   * Returns the number of cells set.
   */
  function randomFill(grid, density, rand) {
    var r = typeof rand === 'function' ? rand : Math.random;
    var d = Math.max(0, Math.min(1, Number(density)));
    var alive = 0;
    for (var i = 0; i < grid.length; i++) {
      var on = r() < d ? 1 : 0;
      grid[i] = on;
      alive += on;
    }
    return alive;
  }

  /** Small deterministic PRNG (mulberry32) so a board can be recreated. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PRESETS = {
    Glider: 'x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!',
    Blinker: 'x = 3, y = 1, rule = B3/S23\n3o!',
    Toad: 'x = 4, y = 2, rule = B3/S23\nb3o$3o!',
    Beacon: 'x = 4, y = 4, rule = B3/S23\n2o$2o$2b2o$2b2o!',
    Pulsar:
      'x = 13, y = 13, rule = B3/S23\n' +
      '2b3o3b3o2b$13b$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b$13b$' +
      '2b3o3b3o2b$o4bobo4bo$o4bobo4bo$o4bobo4bo$13b$2b3o3b3o2b!',
    'LWSS': 'x = 5, y = 4, rule = B3/S23\nbo2bo$o4b$o3bo$4o!',
    'R-pentomino': 'x = 3, y = 3, rule = B3/S23\nb2o$2o$bo!'
  };

  return {
    createGrid: createGrid,
    population: population,
    get: get,
    neighbors: neighbors,
    step: step,
    toRows: toRows,
    fromRows: fromRows,
    patternFromRows: patternFromRows,
    parseRLE: parseRLE,
    place: place,
    centerOffset: centerOffset,
    randomFill: randomFill,
    mulberry32: mulberry32,
    PRESETS: PRESETS
  };
});

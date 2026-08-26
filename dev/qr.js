/* Minimal QR Code encoder — byte mode, versions 1-15, ECC levels L/M/Q/H.
   Follows ISO/IEC 18004. encodeQR() returns the module matrix without a quiet zone. */

// Block structure per version 1..15: [ [blocks, totalCodewords, dataCodewords], ... ]
const ECB = {
  l: [[[1,26,19]],[[1,44,34]],[[1,70,55]],[[1,100,80]],[[1,134,108]],[[2,86,68]],[[2,98,78]],[[2,121,97]],[[2,146,116]],[[2,86,68],[2,87,69]],[[4,101,81]],[[2,116,92],[2,117,93]],[[4,133,107]],[[3,145,115],[1,146,116]],[[5,109,87],[1,110,88]]],
  m: [[[1,26,16]],[[1,44,28]],[[1,70,44]],[[2,50,32]],[[2,67,43]],[[4,43,27]],[[4,49,31]],[[2,60,38],[2,61,39]],[[3,58,36],[2,59,37]],[[4,69,43],[1,70,44]],[[1,80,50],[4,81,51]],[[6,58,36],[2,59,37]],[[8,59,37],[1,60,38]],[[4,64,40],[5,65,41]],[[5,65,41],[5,66,42]]],
  q: [[[1,26,13]],[[1,44,22]],[[2,35,17]],[[2,50,24]],[[2,33,15],[2,34,16]],[[4,43,19]],[[2,32,14],[4,33,15]],[[4,40,18],[2,41,19]],[[4,36,16],[4,37,17]],[[6,43,19],[2,44,20]],[[4,50,22],[4,51,23]],[[4,46,20],[6,47,21]],[[8,44,20],[4,45,21]],[[11,36,16],[5,37,17]],[[5,54,24],[7,55,25]]],
  h: [[[1,26,9]],[[1,44,16]],[[2,35,13]],[[4,25,9]],[[2,33,11],[2,34,12]],[[4,43,15]],[[4,39,13],[1,40,14]],[[4,40,14],[2,41,15]],[[4,36,12],[4,37,13]],[[6,43,15],[2,44,16]],[[3,36,12],[8,37,13]],[[7,42,14],[4,43,15]],[[12,33,11],[4,34,12]],[[11,36,12],[5,37,13]],[[11,36,12],[7,37,13]]],
};
const ALIGN = [[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70]];
const ECC_BITS = { l: 1, m: 0, q: 3, h: 2 };

// --- GF(256), primitive polynomial 0x11d ---
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function generatorPoly(degree) {
  let poly = [1];                                  // coefficients, highest degree first
  for (let d = 0; d < degree; d++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {        // multiply by (x + a^d)
      next[i] ^= poly[i];
      next[i + 1] ^= gmul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const gen = generatorPoly(ecCount);
  const res = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1);
    res[ecCount - 1] = 0;
    if (factor !== 0) for (let i = 0; i < ecCount; i++) res[i] ^= gmul(gen[i + 1], factor);
  }
  return res;
}

const countBits = (version) => version < 10 ? 8 : 16;
const capacityBytes = (version, ecc) => ECB[ecc][version - 1].reduce((sum, [n, , d]) => sum + n * d, 0);

function pickVersion(byteLen, ecc) {
  for (let v = 1; v <= 15; v++) {
    if (4 + countBits(v) + 8 * byteLen <= capacityBytes(v, ecc) * 8) return v;
  }
  return null;
}

function buildCodewords(bytes, version, ecc) {
  const totalData = capacityBytes(version, ecc);
  const bits = [];
  const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(0b0100, 4);                                  // byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < totalData * 8; i++) bits.push(0);  // terminator
  while (bits.length % 8) bits.push(0);

  const data = new Uint8Array(totalData);
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data[i / 8] = byte;
  }
  for (let i = bits.length / 8, pad = 0; i < totalData; i++, pad++) data[i] = pad % 2 ? 0x11 : 0xec;

  const dataBlocks = [], ecBlocks = [];
  let offset = 0;
  for (const [count, total, dataLen] of ECB[ecc][version - 1]) {
    for (let b = 0; b < count; b++) {
      const block = data.subarray(offset, offset + dataLen);
      offset += dataLen;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, total - dataLen));
    }
  }
  const out = [];                                   // interleave: data first, then error correction
  const maxData = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  const maxEc = Math.max(...ecBlocks.map(b => b.length));
  for (let i = 0; i < maxEc; i++) for (const b of ecBlocks) if (i < b.length) out.push(b[i]);
  return out;
}

function bchFormat(value) {                         // BCH(15,5)
  let rest = value << 10;
  for (let i = 14; i >= 10; i--) if ((rest >> i) & 1) rest ^= 0x537 << (i - 10);
  return ((value << 10) | rest) ^ 0x5412;
}
function bchVersion(version) {                      // BCH(18,6)
  let rest = version << 12;
  for (let i = 17; i >= 12; i--) if ((rest >> i) & 1) rest ^= 0x1f25 << (i - 12);
  return (version << 12) | rest;
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i, j) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => ((i >> 1) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

const emptyGrid = (size, fill) => Array.from({ length: size }, () => new Int8Array(size).fill(fill));

function drawFunctionPatterns(size, version) {
  const m = emptyGrid(size, -1);                    // -1 marks a free data module
  const reserved = emptyGrid(size, 0);
  const set = (r, c, v) => { m[r][c] = v; reserved[r][c] = 1; };

  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = inRing && ((r === 0 || r === 6 || c === 0 || c === 6) ||
                              (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(rr, cc, dark ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {              // timing patterns
    const v = i % 2 === 0 ? 1 : 0;
    set(6, i, v); set(i, 6, v);
  }

  for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
    }
  }

  set(size - 8, 8, 1);                              // dark module
  for (let i = 0; i < 9; i++) {                     // reserve format information
    if (!reserved[8][i]) set(8, i, 0);
    if (!reserved[i][8]) set(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, 0);
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, 0);
  }
  if (version >= 7) {                               // reserve version information
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3), c = size - 11 + (i % 3);
      set(r, c, 0); set(c, r, 0);
    }
  }
  return { m, reserved };
}

function placeData(m, reserved, codewords, size) {
  let bit = 0;
  const nextBit = () => {
    const idx = bit >> 3;
    const v = idx < codewords.length ? (codewords[idx] >> (7 - (bit & 7))) & 1 : 0;
    bit++;
    return v;                                       // past the stream: remainder bits stay light
  };
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;                     // skip the vertical timing column
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) if (!reserved[row][col]) m[row][col] = nextBit();
    }
    upward = !upward;
  }
}

function penalty(m, size) {
  let score = 0;
  const runScore = (line) => {
    let s = 0, run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    return s;
  };

  // 1:1:3:1:1 finder-like pattern with four light modules on one side. Modules
  // outside the symbol count as light, so patterns flush against an edge score too.
  const PATTERN = [1, 0, 1, 1, 1, 0, 1];
  const finderLike = (line) => {
    const at = (i) => PATTERN.every((p, k) => line[i + k] === p);
    const find = (from) => { for (let i = from; i + 7 <= size; i++) if (at(i)) return i; return -1; };
    const allLight = (a, b) => {
      for (let i = Math.max(a, 0); i < Math.min(b, size); i++) if (line[i]) return false;
      return true;
    };
    let s = 0, idx = find(0);
    while (idx !== -1) {
      let next = idx + 7;
      if (idx === 0 || idx === size - 7 || allLight(idx - 4, idx) || allLight(next, next + 4)) s += 40;
      else next = idx + 4;                          // no room for a light run: resume inside the pattern
      idx = find(next);
    }
    return s;
  };

  const lines = [];
  for (let r = 0; r < size; r++) lines.push(Array.from(m[r]));
  for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => m[r][c]));
  for (const line of lines) score += runScore(line) + finderLike(line);

  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

function applyFormat(m, size, ecc, mask) {
  const bits = bchFormat((ECC_BITS[ecc] << 3) | mask);
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    if (i < 6) m[i][8] = bit;                       // copy 1: down the left column,
    else if (i < 8) m[i + 1][8] = bit;              // jumping over the timing module,
    else m[size - 15 + i][8] = bit;                 // continuing at the bottom-left finder
    if (i < 8) m[8][size - 1 - i] = bit;            // copy 2: along row 8, right to left
    else if (i === 8) m[8][7] = bit;
    else m[8][14 - i] = bit;
  }
}

function applyVersionInfo(m, size, version) {
  if (version < 7) return;
  const bits = bchVersion(version);
  for (let i = 0; i < 18; i++) {
    const bit = (bits >> i) & 1;
    const r = Math.floor(i / 3), c = size - 11 + (i % 3);
    m[r][c] = bit; m[c][r] = bit;
  }
}

/** Encode `text` as a QR symbol. Returns { size, version, mask, modules } where
 *  modules[row][col] is 1 for dark. Throws if the text needs more than version 15. */
export function encodeQR(text, ecc = 'm', forceMask = null) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = pickVersion(bytes.length, ecc);
  if (!version) throw new Error(`Text too long: ${bytes.length} bytes exceeds version 15 at level ${ecc}`);
  const size = 17 + version * 4;
  const codewords = buildCodewords(bytes, version, ecc);
  const { m: base, reserved } = drawFunctionPatterns(size, version);
  placeData(base, reserved, codewords, size);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== null && mask !== forceMask) continue;
    const m = base.map((row, r) => {
      const out = new Int8Array(size);
      for (let c = 0; c < size; c++) out[c] = reserved[r][c] ? row[c] : (row[c] ^ (MASKS[mask](r, c) ? 1 : 0));
      return out;
    });
    applyFormat(m, size, ecc, mask);
    applyVersionInfo(m, size, version);
    const score = penalty(m, size);
    if (!best || score < best.score) best = { score, m, mask };
  }
  return { size, version, mask: best.mask, modules: best.m };
}

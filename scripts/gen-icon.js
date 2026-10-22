const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const table = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function makePng(size) {
  const s = size / 32;
  const CX = (size - 1) / 2;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - CX, y - CX);
      const edge = Math.min(1, Math.max(0, size / 2 - 0.3 * s - d));
      const a = Math.round(edge * 255);
      const t = (x + y) / (2 * (size - 1));
      let r = lerp(99, 168, t);
      let g = lerp(102, 85, t);
      let b = lerp(241, 247, t);
      // 白色表圈（时钟意象）
      if (d >= 10 * s && d <= 12.4 * s) {
        const ringA = Math.round(Math.min(1, Math.max(0, 12.4 * s - d)) * Math.min(1, Math.max(0, d - 10 * s)) * 255);
        const mix = ringA / 255;
        r = lerp(r, 255, mix);
        g = lerp(g, 255, mix);
        b = lerp(b, 255, mix);
      }
      // 指针：竖直向上
      if (x >= 15 * s && x <= 17 * s && y >= 7 * s && y <= 16 * s && d < 12 * s) {
        r = 255; g = 255; b = 255;
      }
      const o = 1 + x * 4;
      row[o] = r; row[o + 1] = g; row[o + 2] = b; row[o + 3] = a;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function wrapIco(png, size) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([head, entry, png]);
}

const dir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tray.png'), makePng(32));
const icon256 = makePng(256);
fs.writeFileSync(path.join(dir, 'icon.png'), icon256);
fs.writeFileSync(path.join(dir, 'icon.ico'), wrapIco(icon256, 256));
console.log('written: tray.png(32), icon.png(256), icon.ico(256)');

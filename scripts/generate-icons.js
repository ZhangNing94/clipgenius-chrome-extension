// Generate ClipGenius icons - Rose red gradient with scissors/bookmark motif
const sizes = [16, 48, 128];
const fs = require('fs');
const path = require('path');

// PNG generation using raw pixel manipulation
function generatePNG(size) {
  const pixels = size * size;
  const data = Buffer.alloc(pixels * 4);
  
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Rounded square with gradient
      const cornerR = size * 0.18;
      const halfSize = size / 2 - size * 0.05;
      let inside = true;
      
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax > halfSize || ay > halfSize) {
        inside = false;
      } else if (ax > halfSize - cornerR && ay > halfSize - cornerR) {
        const cdx = ax - (halfSize - cornerR);
        const cdy = ay - (halfSize - cornerR);
        if (Math.sqrt(cdx * cdx + cdy * cdy) > cornerR) {
          inside = false;
        }
      }
      
      if (!inside) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }
      
      // Gradient from top-left to bottom-right
      const gradient = (dx / size + dy / size + 1) / 2;
      
      // Rose red gradient: #e11d48 (225,29,72) → #f43f5e (244,63,94)
      const r1 = 225, g1 = 29, b1 = 72;
      const r2 = 244, g2 = 63, b2 = 94;
      
      // Slight lighter center highlight
      const centerDist = dist / (size / 2);
      const highlight = Math.max(0, 1 - centerDist * 0.6);
      
      data[idx] = Math.round(r1 + (r2 - r1) * gradient + highlight * 20);
      data[idx + 1] = Math.round(g1 + (g2 - g1) * gradient + highlight * 15);
      data[idx + 2] = Math.round(b1 + (b2 - b1) * gradient + highlight * 10);
      data[idx + 3] = 255;
    }
  }
  
  // Draw scissors/bookmark shape in center (white)
  const iconSize = size * 0.22;
  const iconCx = cx;
  const iconCy = cy - size * 0.02;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (data[idx + 3] === 0) continue;
      
      const dx = x - iconCx;
      const dy = y - iconCy;
      
      // Bookmark shape: inverted triangle with circle at bottom
      const s = iconSize;
      
      // Top circle (bookmark tab)
      const tabCy = iconCy - s * 0.6;
      const tabR = s * 0.25;
      const tabDist = Math.sqrt(dx * dx + (y - tabCy) * (y - tabCy));
      
      // Body triangle (pointing down)
      const inTriangle = dy >= -s * 0.35 && dy <= s * 0.8 &&
        Math.abs(dx) <= s * 0.6 * (1 - (dy + s * 0.35) / (s * 1.15));
      
      // Connector between tab and body
      const inConnector = Math.abs(dx) <= s * 0.15 && y >= tabCy + tabR * 0.5 && y <= -s * 0.35 + tabCy + s * 0.35;
      
      // Download arrow at bottom
      const arrowY = iconCy + s * 0.9;
      const inArrowLine = Math.abs(dx) <= s * 0.1 && y >= arrowY - s * 0.3 && y <= arrowY;
      const inArrowHead = Math.abs(dy - arrowY) + Math.abs(dx) <= s * 0.35 && y >= arrowY;
      
      if (tabDist <= tabR || inTriangle || inConnector || inArrowLine || inArrowHead) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      }
    }
  }
  
  return data;
}

// Encode as PNG using raw implementation
function createPNG(pixelData, size) {
  const zlib = require('zlib');
  
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // no filter
    pixelData.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate all sizes
const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

sizes.forEach(size => {
  const pixels = generatePNG(size);
  const png = createPNG(pixels, size);
  const filename = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Generated ${filename} (${png.length} bytes)`);
});
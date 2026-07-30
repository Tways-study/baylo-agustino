/**
 * Generates placeholder PWA icons as SVG files.
 * Replace with actual crest artwork before launch.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.join(__dirname, '..', 'public', 'icons')

function makeSvg(size) {
  const fontSize = Math.round(size * 0.3)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#CC0000"/>
  <rect x="4" y="4" width="${size - 8}" height="${size - 8}" fill="none" stroke="#FFCC00" stroke-width="${Math.max(2, size * 0.02)}"/>
  <text
    x="50%"
    y="55%"
    dominant-baseline="middle"
    text-anchor="middle"
    font-family="monospace"
    font-weight="bold"
    font-size="${fontSize}"
    letter-spacing="${Math.round(fontSize * 0.08)}"
    fill="#FFCC00"
  >BA</text>
</svg>`
}

fs.mkdirSync(iconsDir, { recursive: true })

for (const size of [192, 512]) {
  const svgPath = path.join(iconsDir, `icon-${size}.svg`)
  fs.writeFileSync(svgPath, makeSvg(size))
  console.log(`Written: icon-${size}.svg (replace with actual crest PNG before launch)`)
}

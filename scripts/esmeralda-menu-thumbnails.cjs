'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const MENU_DIR = path.resolve(__dirname, '../public/images/esmeralda-v2/menu');
const THUMB_SIZE = 192;
const THUMB_SUFFIX = '-192.webp';

/** Re-run safely after adding or replacing an approved source image. Never edits an original. */
async function generateMenuThumbnails(directory = MENU_DIR) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const originals = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.webp') && !entry.name.endsWith(THUMB_SUFFIX))
    .map(entry => entry.name)
    .sort();
  if (!originals.length) throw new Error('No Esmeralda source WebP images found in ' + directory);

  const result = { originals: originals.length, generated: 0, unchanged: 0, sourceBytes: 0, thumbnailBytes: 0 };
  for (const name of originals) {
    const source = path.join(directory, name);
    const output = path.join(directory, name.replace(/\.webp$/, THUMB_SUFFIX));
    const inputStat = await fs.stat(source);
    const outputStat = await fs.stat(output).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    result.sourceBytes += inputStat.size;

    if (outputStat && outputStat.mtimeMs >= inputStat.mtimeMs) {
      const metadata = await sharp(output).metadata().catch(() => null);
      if (metadata?.format === 'webp' && metadata.width === THUMB_SIZE && metadata.height === THUMB_SIZE) {
        result.unchanged++;
        result.thumbnailBytes += outputStat.size;
        continue;
      }
    }

    // All approved originals have square transparent canvases; preserve their full edges.
    const buffer = await sharp(source, { failOn: 'error' })
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 75, alphaQuality: 90, effort: 5 })
      .toBuffer();
    const temporary = output + '.' + process.pid + '.tmp';
    try {
      await fs.writeFile(temporary, buffer);
      await fs.rename(temporary, output);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    result.generated++;
    result.thumbnailBytes += buffer.length;
  }
  return result;
}

if (require.main === module) {
  generateMenuThumbnails()
    .then(result => console.log('Esmeralda menu thumbnails: ' + result.originals + ' sources, ' + result.generated + ' generated, ' + result.unchanged + ' unchanged, ' + Math.round(result.thumbnailBytes / 1024) + ' KiB in total'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { generateMenuThumbnails, THUMB_SIZE, THUMB_SUFFIX };

import imageCompression from 'browser-image-compression';

/**
 * Produce two derivatives for a shelf photo:
 *   - `display`: ~1600px max edge, quality 0.82 — the "big" image for lightbox.
 *   - `thumb`:   ~400px max edge, quality 0.78 — the grid thumbnail.
 *
 * Both are JPEG. `browser-image-compression` handles HEIC fallback where
 * the browser can decode it.
 *
 * @param {File} file
 * @returns {Promise<{display: Blob, thumb: Blob}>}
 */
export async function makeDerivatives(file) {
  const baseOpts = {
    useWebWorker: true,
    initialQuality: 0.82,
    fileType: 'image/jpeg',
  };
  const display = await imageCompression(file, { ...baseOpts, maxWidthOrHeight: 1600 });
  const thumb = await imageCompression(file, {
    ...baseOpts,
    initialQuality: 0.78,
    maxWidthOrHeight: 400,
  });
  return { display, thumb };
}

// Shrinks a photo in the browser before it's uploaded: at most MAX_SIDE
// pixels on its longer side, saved as a JPEG. Phone photos (often 3–5 MB)
// come out around 200–500 KB, so pages load faster on mobile data and
// storage fills up slower. Videos, GIFs and files that can't be read are
// uploaded as they are, and so is any photo the shrinking wouldn't make smaller.

const MAX_SIDE = 1600;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 250 * 1024;

const loadImage = async (file) => {
  // createImageBitmap applies the photo's rotation (EXIF), so it isn't sideways.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const shrinkImage = async (file, { maxSide = MAX_SIDE, quality = QUALITY } = {}) => {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const img = await loadImage(file);
    const w = img.width, h = img.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale === 1 && file.size < SKIP_BELOW_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; // transparent PNGs get a white background as JPEGs
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (typeof img.close === 'function') img.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
};

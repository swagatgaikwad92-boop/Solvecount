/* SolveCount — camera access + image compression.
 * Proof photos are downscaled (max 1280px) and JPEG-encoded before they touch IndexedDB.
 */

const MAX_SIDE = 1280;
const THUMB_SIDE = 360;
const MAIN_QUALITY = 0.72;
const THUMB_QUALITY = 0.7;

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality);
  });
}

function drawScaled(src, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0, cw, ch);
  return canvas;
}

export async function compress(src, w, h) {
  const main = drawScaled(src, w, h, MAX_SIDE);
  const blob = await toBlob(main, MAIN_QUALITY);
  const thumbCanvas = drawScaled(main, main.width, main.height, THUMB_SIDE);
  const thumb = await toBlob(thumbCanvas, THUMB_QUALITY);
  return { blob, thumb, w: main.width, h: main.height };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unsupported')); };
    img.src = url;
  });
}

/** Compress a File picked from the gallery / camera app. Respects EXIF rotation. */
export async function compressFile(file) {
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try { bitmap = await loadImage(file); } catch {
      throw new Error("That photo format isn't supported. Try a JPEG or PNG.");
    }
  }
  const w = bitmap.width; const h = bitmap.height;
  const out = await compress(bitmap, w, h);
  bitmap.close?.();
  return out;
}

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
  }

  async start() {
    this.stop();
    const constraints = {
      audio: false,
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    this.video.classList.toggle('is-mirrored', this.facing === 'user');
    await this.video.play().catch(() => {});
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  async flip() {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    await this.start();
  }

  async snap() {
    const v = this.video;
    if (!v.videoWidth) throw new Error('Camera is not ready yet.');
    return compress(v, v.videoWidth, v.videoHeight);
  }
}

/** Friendly reason for a getUserMedia failure. */
export function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is off. Allow it in your browser settings, or use one of the options below.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device. You can pick a photo instead.';
    case 'NotReadableError':
      return 'Another app is using the camera. Close it, or pick a photo instead.';
    default:
      return 'The camera could not start. You can pick a photo instead.';
  }
}

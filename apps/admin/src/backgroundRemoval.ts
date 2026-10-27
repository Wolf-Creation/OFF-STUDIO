/** Remove a flat, edge-connected studio background from a product photo. */
export async function removePlainBackground(source: string): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.crossOrigin = 'anonymous'
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('The source image could not be loaded.'))
    element.src = source
  })
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.drawImage(image, 0, 0, width, height)
  const frame = context.getImageData(0, 0, width, height)
  const pixels = frame.data
  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2]]
  }
  const cornerSamples = [sample(1, 1), sample(width - 2, 1), sample(1, height - 2), sample(width - 2, height - 2)]
  const background = [0, 1, 2].map(channel => [...cornerSamples.map(color => color[channel])].sort((a, b) => a - b)[1])
  const visited = new Uint8Array(width * height)
  const queue = new Uint32Array(width * height)
  let read = 0
  let write = 0
  const threshold = 52
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (visited[index]) return
    visited[index] = 1
    const offset = index * 4
    const dr = pixels[offset] - background[0]
    const dg = pixels[offset + 1] - background[1]
    const db = pixels[offset + 2] - background[2]
    if (Math.sqrt(dr * dr + dg * dg + db * db) > threshold || pixels[offset + 3] < 8) return
    queue[write++] = index
  }
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1) }
  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); enqueue(width - 1, y) }
  while (read < write) {
    const index = queue[read++]
    const offset = index * 4
    pixels[offset + 3] = 0
    const x = index % width
    const y = Math.floor(index / width)
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1)
  }
  context.putImageData(frame, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the transparent PNG.')), 'image/png'))
}

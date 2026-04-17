
self.onmessage = function(e) {
  const { imageData, startX, startY, width, height, tolerance } = e.data;
  const data = imageData.data;
  const startPos = (Math.floor(startY) * width + Math.floor(startX)) * 4;
  
  const startR = data[startPos];
  const startG = data[startPos + 1];
  const startB = data[startPos + 2];
  const startA = data[startPos + 3];

  if (startA === 0) {
    self.postMessage({ imageData });
    return;
  }

  const match = (p: number) => {
    if (data[p + 3] === 0) return false;
    const dr = data[p] - startR;
    const dg = data[p + 1] - startG;
    const db = data[p + 2] - startB;
    return (dr * dr + dg * dg + db * db) <= (tolerance * tolerance);
  };

  const stack = [startPos];
  const visited = new Uint8Array(width * height);
  visited[startPos / 4] = 1;

  while (stack.length > 0) {
    const pos = stack.pop()!;
    data[pos + 3] = 0; // Set alpha to 0 (transparent)

    const pixelIndex = pos / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    // Check 4 neighbors
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = (ny * width + nx) * 4;
        const nIdx = nPos / 4;
        if (!visited[nIdx] && match(nPos)) {
          visited[nIdx] = 1;
          stack.push(nPos);
        }
      }
    }
  }

  self.postMessage({ imageData });
};

import * as THREE from 'three';

const TEXTURE_SIZE = 512;
const CELLS_PER_TILE = 5;

export function createIslandGridTexture(cellColor: string, sectionColor: string, baseColor: string, tilesAcross: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = baseColor;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const cellSize = TEXTURE_SIZE / CELLS_PER_TILE;
  context.strokeStyle = cellColor;
  context.lineWidth = 2;
  for (let i = 1; i < CELLS_PER_TILE; i++) {
    context.beginPath();
    context.moveTo(i * cellSize, 0);
    context.lineTo(i * cellSize, TEXTURE_SIZE);
    context.moveTo(0, i * cellSize);
    context.lineTo(TEXTURE_SIZE, i * cellSize);
    context.stroke();
  }

  context.strokeStyle = sectionColor;
  context.lineWidth = 5;
  context.strokeRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(tilesAcross, tilesAcross);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

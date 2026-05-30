import { useEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
  DoubleSide,
  FrontSide,
} from 'three';
import { useDesignStore } from '../store/designStore';
import { gcodeToSegments, type ToolpathSegment } from '../gcode/gcodeToPoints';

/**
 * Heightmap-based rendering of the workpiece as the tool progresses.
 *
 * Allocates a 2D grid covering the toolpath area; each cell stores the deepest
 * Z value the bit has reached at that XY position (0 = uncut top of material,
 * negative = depth below the surface). As `simProgress` advances, new cut
 * segments are stamped into the grid and the mesh's vertex Z values are updated
 * via the official BufferAttribute.setZ API.
 *
 * Uses flat shading so per-vertex normals don't have to be recomputed on every
 * progress change — a 250k-vertex `computeVertexNormals` call takes ~150 ms
 * and would stutter animation. Flat shading derives face normals in the shader
 * (dFdx/dFdy) so the surface is correctly lit with no per-frame CPU cost.
 */
export function RenderedWorkpiece() {
  const gcode = useDesignStore((s) => s.gcode);
  const material = useDesignStore((s) => s.material);
  const tool = useDesignStore((s) => s.toolConfig);
  const simProgress = useDesignStore((s) => s.simProgress);

  const segments = useMemo<ToolpathSegment[]>(
    () => (gcode ? gcodeToSegments(gcode.split('\n')) : []),
    [gcode],
  );

  // Ensure the simulation controls know how many segments to play through,
  // even if the user never visited Toolpath mode first.
  const simSetTotalSegments = useDesignStore((s) => s.simSetTotalSegments);
  useEffect(() => {
    simSetTotalSegments(segments.length);
  }, [segments.length, simSetTotalSegments]);

  // Grid covers the TOOLPATH area only — keeps resolution high regardless of
  // material size. Stock outside the grid is shown by a separate full-material
  // plane + side walls behind the heightmap.
  const grid = useMemo(() => {
    if (segments.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasCuts = false;
    for (const s of segments) {
      if (s.type !== 'cut') continue;
      hasCuts = true;
      if (s.from.x < minX) minX = s.from.x;
      if (s.to.x < minX)   minX = s.to.x;
      if (s.from.x > maxX) maxX = s.from.x;
      if (s.to.x > maxX)   maxX = s.to.x;
      if (s.from.y < minY) minY = s.from.y;
      if (s.to.y < minY)   minY = s.to.y;
      if (s.from.y > maxY) maxY = s.from.y;
      if (s.to.y > maxY)   maxY = s.to.y;
    }
    if (!hasCuts || !isFinite(minX)) return null;

    const bitDiameter = tool.bitDiameter > 0 ? tool.bitDiameter : 6;
    const margin = bitDiameter * 2;
    minX -= margin; maxX += margin;
    minY -= margin; maxY += margin;

    const longest = Math.max(maxX - minX, maxY - minY, 1);
    // Target ~1 mm cells; cap at 300 cells on the long side so huge toolpaths
    // keep the vertex count reasonable (300² = 90k vertices).
    const cellSize = Math.max(0.8, longest / 300);
    const cols = Math.max(2, Math.ceil((maxX - minX) / cellSize) + 1);
    const rows = Math.max(2, Math.ceil((maxY - minY) / cellSize) + 1);
    return { minX, minY, cellSize, cols, rows };
  }, [segments, tool.bitDiameter]);

  const heightmapRef = useRef<Float32Array | null>(null);
  const lastProgressRef = useRef(0);
  const geometryRef = useRef<BufferGeometry | null>(null);

  // Build geometry when the grid changes. Returns a stable BufferGeometry that
  // `useEffect` mutates in place via setZ() — we never swap it under the mesh.
  const geometry = useMemo(() => {
    if (!grid) return null;
    const { cols, rows, cellSize, minX, minY } = grid;
    const vertCount = cols * rows;
    const positions = new Float32Array(vertCount * 3);
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const i = (iy * cols + ix) * 3;
        positions[i] = minX + ix * cellSize;
        positions[i + 1] = minY + iy * cellSize;
        positions[i + 2] = 0; // initial flat top surface
      }
    }

    // Use Uint32Array explicitly — vertex count exceeds Uint16 max (65535)
    // for grids over 256×256, and relying on Three.js autodetection has
    // surprised us before on some builds.
    const quadCount = (cols - 1) * (rows - 1);
    const indices = new Uint32Array(quadCount * 6);
    let q = 0;
    for (let iy = 0; iy < rows - 1; iy++) {
      for (let ix = 0; ix < cols - 1; ix++) {
        const a = iy * cols + ix;
        const b = iy * cols + (ix + 1);
        const c = (iy + 1) * cols + ix;
        const d = (iy + 1) * cols + (ix + 1);
        indices[q++] = a; indices[q++] = b; indices[q++] = c;
        indices[q++] = b; indices[q++] = d; indices[q++] = c;
      }
    }

    // Vertex-color buffer — filled in the update effect based on Z (depth).
    // Using vertex colors instead of uniform material color makes depth
    // IMMEDIATELY obvious: uncut stock = bright tan, shallow cuts = mid-brown,
    // full-depth cuts = dark chocolate. Without this every cut looks like the
    // same color as the uncut stock and the eye can't read the terrain.
    const colors = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      colors[i * 3 + 0] = 0.82;
      colors[i * 3 + 1] = 0.65;
      colors[i * 3 + 2] = 0.43;
    }

    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setIndex(new Uint32BufferAttribute(indices, 1));
    // Don't call computeVertexNormals — flatShading handles normals in shader.
    return g;
  }, [grid]);

  // Initialize the heightmap alongside the geometry. Done in an effect rather
  // than inside useMemo so React StrictMode's double-invoke doesn't leak
  // Float32Arrays. The effect's cleanup disposes the previous geometry.
  useEffect(() => {
    if (!grid || !geometry) {
      heightmapRef.current = null;
      geometryRef.current = null;
      return;
    }
    heightmapRef.current = new Float32Array(grid.cols * grid.rows);
    lastProgressRef.current = 0;
    geometryRef.current = geometry;
    return () => {
      geometry.dispose();
    };
  }, [grid, geometry]);

  // Apply segments [lastApplied .. simProgress) into the heightmap, then push
  // new Z values into the position buffer. Scrubbing backward resets and
  // replays — cuts can't be undone analytically.
  useEffect(() => {
    const data = heightmapRef.current;
    const geo = geometryRef.current;
    if (!grid || !geo || !data) return;

    const { cols, rows, cellSize, minX, minY } = grid;
    const bitDiameter = tool.bitDiameter > 0 ? tool.bitDiameter : 6;
    const radius = bitDiameter / 2;
    const minZ = -material.thickness;

    let from = lastProgressRef.current;
    if (simProgress < from) {
      data.fill(0);
      from = 0;
    }
    const to = Math.max(0, Math.min(simProgress, segments.length));

    for (let i = from; i < to; i++) {
      const seg = segments[i];
      if (!seg || seg.type !== 'cut') continue;
      stampSegment(data, cols, rows, minX, minY, cellSize, radius, minZ, seg);
    }
    lastProgressRef.current = to;

    // Push Z values AND depth-coded vertex colors into the geometry.
    const positions = geo.attributes.position;
    const colorAttr = geo.attributes.color;
    if (!positions) return;
    const thickness = material.thickness;
    // 3-stop gradient: uncut (z=0) → mid-depth → full-through.
    // RGB values are linear-light; Three.js StandardMaterial treats color
    // as sRGB by default so these render as roughly:
    //   uncut:  light tan   #d1a56e
    //   mid:    saddle brown #8a5a32
    //   bottom: dark cocoa   #3a2414
    const stop0 = [0.82, 0.65, 0.43]; // uncut
    const stop1 = [0.54, 0.35, 0.19]; // half-depth
    const stop2 = [0.23, 0.14, 0.08]; // full-through
    for (let i = 0; i < cols * rows; i++) {
      const z = data[i];
      positions.setZ(i, z);
      if (colorAttr) {
        // t: 0 at surface, 1 at full thickness
        const t = Math.max(0, Math.min(1, -z / thickness));
        let r: number, g: number, b: number;
        if (t < 0.5) {
          const k = t / 0.5;
          r = stop0[0] + (stop1[0] - stop0[0]) * k;
          g = stop0[1] + (stop1[1] - stop0[1]) * k;
          b = stop0[2] + (stop1[2] - stop0[2]) * k;
        } else {
          const k = (t - 0.5) / 0.5;
          r = stop1[0] + (stop2[0] - stop1[0]) * k;
          g = stop1[1] + (stop2[1] - stop1[1]) * k;
          b = stop1[2] + (stop2[2] - stop1[2]) * k;
        }
        colorAttr.setXYZ(i, r, g, b);
      }
    }
    positions.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
  }, [simProgress, segments, grid, geometry, tool.bitDiameter, material.thickness]);

  if (!geometry || !grid) return null;

  // Inside the parent rotated group, the toolpath uses (X, Y, topZ + segZ);
  // we offset our surface by topZ so everything aligns vertically.
  const topZ = material.thickness / 2;
  const w = material.width;
  const h = material.height;
  const th = material.thickness;

  return (
    <group position={[0, 0, topZ]}>
      {/* Full-material stock top fills the area outside the heightmap grid.
          Offset by -0.02 mm so uncut heightmap cells (z=0) paint on top.
          Matches the vertex-color gradient's "uncut" stop so there's no
          visible seam at the heightmap boundary. */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#d1a66e"
          roughness={0.75}
          side={FrontSide}
          flatShading
        />
      </mesh>

      {/* Heightmap — the live cut surface. Uses per-vertex colors so depth
          is immediately readable: tan = uncut, brown = mid, dark = deepest. */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.75}
          side={DoubleSide}
          flatShading
        />
      </mesh>

      {/* Stock bottom. */}
      <mesh position={[0, 0, -th - 0.02]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#6b4d36"
          roughness={1}
          side={FrontSide}
          flatShading
        />
      </mesh>

      {/* Side walls give visible 3D thickness off-axis. PlaneGeometry default
          is the XY plane; each wall is rotated so its normal points outward. */}
      <mesh position={[-w / 2, 0, -th / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[th, h]} />
        <meshStandardMaterial color="#a0785a" roughness={0.9} side={DoubleSide} flatShading />
      </mesh>
      <mesh position={[w / 2, 0, -th / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[th, h]} />
        <meshStandardMaterial color="#a0785a" roughness={0.9} side={DoubleSide} flatShading />
      </mesh>
      <mesh position={[0, -h / 2, -th / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, th]} />
        <meshStandardMaterial color="#a0785a" roughness={0.9} side={DoubleSide} flatShading />
      </mesh>
      <mesh position={[0, h / 2, -th / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, th]} />
        <meshStandardMaterial color="#a0785a" roughness={0.9} side={DoubleSide} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Rasterize one cut segment into the heightmap. Walks the segment in steps
 * of half a bit-radius and stamps a circular footprint at each step, marking
 * every cell within `radius` of the bit center to `min(current, segZ)`.
 * Z is interpolated linearly between segment endpoints.
 */
function stampSegment(
  data: Float32Array,
  cols: number,
  rows: number,
  gridMinX: number,
  gridMinY: number,
  cellSize: number,
  radius: number,
  minZ: number,
  seg: ToolpathSegment,
): void {
  const { from, to } = seg;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy);
  const stepSize = Math.max(0.5, radius * 0.5);
  const steps = Math.max(1, Math.ceil(len / stepSize));

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = Math.max(minZ, from.z + dz * t);
    if (z >= 0) continue; // above stock surface — no material removed
    stampCircle(data, cols, rows, gridMinX, gridMinY, cellSize, x, y, z, radius);
  }
}

function stampCircle(
  data: Float32Array,
  cols: number,
  rows: number,
  gridMinX: number,
  gridMinY: number,
  cellSize: number,
  cx: number,
  cy: number,
  z: number,
  radius: number,
): void {
  const minIX = Math.max(0, Math.floor((cx - radius - gridMinX) / cellSize));
  const maxIX = Math.min(cols - 1, Math.ceil((cx + radius - gridMinX) / cellSize));
  const minIY = Math.max(0, Math.floor((cy - radius - gridMinY) / cellSize));
  const maxIY = Math.min(rows - 1, Math.ceil((cy + radius - gridMinY) / cellSize));
  if (minIX > maxIX || minIY > maxIY) return;
  const r2 = radius * radius;
  for (let iy = minIY; iy <= maxIY; iy++) {
    const py = gridMinY + iy * cellSize;
    const ddy = py - cy;
    const ddy2 = ddy * ddy;
    for (let ix = minIX; ix <= maxIX; ix++) {
      const px = gridMinX + ix * cellSize;
      const ddx = px - cx;
      if (ddx * ddx + ddy2 > r2) continue;
      const idx = iy * cols + ix;
      if (z < data[idx]) data[idx] = z;
    }
  }
}

import { CatmullRomCurve3, Vector3 } from 'three';

export interface TrackSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  distance: number;
}

export const ROAD_HALF_WIDTH = 8.7;
export const TRACK_POINTS = 540;
export const GRID_POSITION = 1.8;

export interface Checkpoint {
  distance: number;
  label: string;
}

export class Track {
  readonly samples: TrackSample[];
  readonly length: number;
  readonly checkpoints: readonly Checkpoint[];

  constructor() {
    const layout = [
      [0, 90], [0, 20], [0, -57], [16, -111], [65, -129],
      [137, -126], [190, -103], [210, -59], [200, -18], [165, 4],
      [143, 33], [161, 63], [193, 90], [188, 132], [146, 157],
      [78, 158], [24, 144], [3, 118]
    ];
    const curve = new CatmullRomCurve3(
      layout.map(([x, z]) => new Vector3(x, 0, z)), true, 'catmullrom', 0.43
    );
    curve.arcLengthDivisions = 2400;
    this.length = curve.getLength();
    this.checkpoints = [
      { distance: 55, label: 'AFTERDARK' },
      { distance: 170, label: 'NORTH APPROACH' },
      { distance: 285, label: 'NORTH BANK' },
      { distance: 414, label: 'EAST SWITCHBACK' },
      { distance: 553, label: 'DATA DISTRICT' },
      { distance: this.length - 34, label: 'HOME STRAIGHT' }
    ];
    this.samples = Array.from({ length: TRACK_POINTS }, (_, index) => {
      const u = index / TRACK_POINTS;
      const { x, z } = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);
      return { x, z, tx: tangent.x, tz: tangent.z, distance: u * this.length };
    });
  }

  at(distance: number): TrackSample {
    const wrapped = ((distance % this.length) + this.length) % this.length;
    const position = wrapped / this.length * TRACK_POINTS;
    const index = Math.floor(position);
    const a = this.samples[index];
    const b = this.samples[(index + 1) % TRACK_POINTS];
    const t = position - index;
    const tx = a.tx + (b.tx - a.tx) * t;
    const tz = a.tz + (b.tz - a.tz) * t;
    const scale = 1 / Math.hypot(tx, tz);
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      tx: tx * scale,
      tz: tz * scale,
      distance: wrapped
    };
  }

  nearest(x: number, z: number, previousDistance: number): TrackSample {
    const center = Math.round(previousDistance / this.length * TRACK_POINTS);
    let best = Infinity;
    let bestDistance = previousDistance;
    for (let step = -8; step <= 8; step++) {
      const index = (center + step + TRACK_POINTS) % TRACK_POINTS;
      const a = this.samples[index];
      const b = this.samples[(index + 1) % TRACK_POINTS];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const gap = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
      if (gap < best) {
        best = gap;
        bestDistance = (index + t) / TRACK_POINTS * this.length;
      }
    }
    return this.at(bestDistance);
  }

  contains(x: number, z: number, clearance: number): boolean {
    return this.samples.some(sample => (sample.x - x) ** 2 + (sample.z - z) ** 2 < clearance ** 2);
  }
}

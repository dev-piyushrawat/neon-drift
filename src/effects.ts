import {
  AdditiveBlending, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh,
  LineSegments, MathUtils, MeshBasicMaterial, Object3D, PlaneGeometry, Points, PointsMaterial, ShaderMaterial
} from 'three';
import type { Track } from './track';
import type { Vehicle } from './vehicle';

const TRAIL_CAPACITY = 56;
const purple = new Color('#e26bff');
const cyan = new Color('#57ddff');

export class RaceEffects {
  readonly root = new Group();
  private readonly trails: InstancedMesh;
  private readonly particles: Points;
  private readonly streaks: LineSegments<BufferGeometry, ShaderMaterial>;
  private readonly transform = new Object3D();
  private readonly color = new Color();
  private readonly segments = Array.from({ length: TRAIL_CAPACITY }, () => ({
    x: 0, z: 0, yaw: 0, length: 0, time: 0, boost: false, life: 0
  }));
  private readonly previous = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
  private head = 0;
  private waiting = 0;
  private connected = false;
  private streakStrength = 0;

  constructor(track: Track) {
    this.trails = new InstancedMesh(new PlaneGeometry(), new MeshBasicMaterial({
      transparent: true, opacity: 0.72, depthWrite: false, blending: AdditiveBlending, toneMapped: false
    }), TRAIL_CAPACITY);
    this.trails.instanceMatrix.setUsage(DynamicDrawUsage);
    // Allocate instance colors before the first render so enabling trails does not recompile the material.
    this.trails.setColorAt(0, cyan);
    this.trails.instanceColor!.setUsage(DynamicDrawUsage);
    this.trails.count = 0;
    this.trails.frustumCulled = false;

    const points = new BufferGeometry();
    const position: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < 144; i++) {
      const sample = track.samples[(i * 67) % track.samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const offset = side * (4 + (i * 17 % 49));
      position.push(sample.x - sample.tz * offset, 0.55 + (i * 23 % 97) * 0.15, sample.z + sample.tx * offset);
      const tint = i % 3 === 0 ? purple : cyan;
      colors.push(tint.r, tint.g, tint.b);
    }
    points.setAttribute('position', new Float32BufferAttribute(position, 3));
    points.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.particles = new Points(points, new PointsMaterial({
      size: 0.32, transparent: true, opacity: 0.55, depthWrite: false, vertexColors: true,
      blending: AdditiveBlending, toneMapped: false
    }));

    const lines = new BufferGeometry();
    const directions: number[] = [];
    const endpoints: number[] = [];
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.39996;
      for (const end of [0, 1]) {
        directions.push(Math.cos(angle), Math.sin(angle), (i * 47 % 103) / 103);
        endpoints.push(end);
      }
    }
    lines.setAttribute('position', new Float32BufferAttribute(directions, 3));
    lines.setAttribute('endpoint', new Float32BufferAttribute(endpoints, 1));
    this.streaks = new LineSegments(lines, new ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
      uniforms: { strength: { value: 0 }, time: { value: 0 } },
      vertexShader: `
        uniform float time;
        uniform float strength;
        attribute float endpoint;
        varying float light;
        void main() {
          float phase = fract(position.z + time * (1.4 + position.z * 0.7));
          float radius = 0.44 + phase * phase * 1.05;
          vec2 ray = normalize(position.xy) * (radius + endpoint * (0.075 + 0.18 * phase));
          gl_Position = vec4(ray, 0.0, 1.0);
          light = strength * smoothstep(0.0, 0.34, phase) * (1.0 - smoothstep(0.73, 1.0, phase))
            * mix(0.05, 0.46, endpoint);
        }
      `,
      fragmentShader: `
        varying float light;
        void main() { gl_FragColor = vec4(0.38, 0.81, 1.0, light); }
      `
    }));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 10;
    this.root.add(this.trails, this.particles, this.streaks);
  }

  configure(enabled: boolean, low: boolean): void {
    this.root.visible = enabled;
    this.particles.geometry.setDrawRange(0, low ? 72 : 144);
    this.streaks.geometry.setDrawRange(0, low ? 36 : 72);
    if (!enabled) this.clear();
  }

  clear(): void {
    this.connected = false;
    this.waiting = 0;
    this.streakStrength = 0;
    this.trails.count = 0;
    this.streaks.visible = false;
    for (const segment of this.segments) segment.life = 0;
  }

  update(vehicle: Vehicle, dt: number, seconds: number, menu: boolean): void {
    if (!this.root.visible) return;
    this.particles.position.set(Math.sin(seconds * 0.36) * 1.6, Math.sin(seconds * 0.5) * 0.42, 0);
    this.streakStrength = MathUtils.damp(this.streakStrength, !menu && vehicle.boosting ? 1 : 0, 7, dt);
    this.streaks.visible = this.streakStrength > 0.008;
    this.streaks.material.uniforms.strength.value = this.streakStrength;
    this.streaks.material.uniforms.time.value = seconds;
    if (!menu && (vehicle.drifting || vehicle.boosting) && vehicle.speed > 8) {
      this.waiting += dt;
      if (this.waiting >= 0.027 || !this.connected) this.emit(vehicle);
    } else {
      this.connected = false;
      this.waiting = 0;
    }

    let count = 0;
    for (const segment of this.segments) {
      if (segment.life <= 0) continue;
      segment.time += dt;
      const remaining = 1 - segment.time / segment.life;
      if (remaining <= 0) {
        segment.life = 0;
        continue;
      }
      this.transform.position.set(segment.x, 0.077 + (segment.boost ? 0.025 : 0), segment.z);
      this.transform.rotation.set(-Math.PI / 2, 0, segment.yaw);
      this.transform.scale.set((segment.boost ? 0.19 : 0.13) * (0.7 + remaining), segment.length, 1);
      this.transform.updateMatrix();
      this.trails.setMatrixAt(count, this.transform.matrix);
      this.color.copy(segment.boost ? cyan : purple).multiplyScalar(remaining * remaining * 0.81);
      this.trails.setColorAt(count, this.color);
      count++;
    }
    this.trails.count = count;
    if (count > 0) {
      this.trails.instanceMatrix.needsUpdate = true;
      this.trails.instanceColor!.needsUpdate = true;
    }
  }

  private emit(vehicle: Vehicle): void {
    const sine = Math.sin(vehicle.heading);
    const cosine = Math.cos(vehicle.heading);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1.04 : 1.04;
      const x = vehicle.x + cosine * side - sine * 2.62;
      const z = vehicle.z + sine * side + cosine * 2.62;
      const previous = this.previous[i];
      const dx = x - previous.x;
      const dz = z - previous.z;
      const length = Math.hypot(dx, dz);
      if (this.connected && length > 0.04 && length < 9) {
        const segment = this.segments[this.head];
        this.head = (this.head + 1) % TRAIL_CAPACITY;
        segment.x = (x + previous.x) / 2;
        segment.z = (z + previous.z) / 2;
        segment.yaw = Math.atan2(-dx, -dz);
        segment.length = length + 0.035;
        segment.time = 0;
        segment.boost = vehicle.boosting;
        segment.life = vehicle.boosting ? 0.45 : 0.66;
      }
      previous.x = x;
      previous.z = z;
    }
    this.connected = true;
    this.waiting = 0;
  }
}

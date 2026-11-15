import {
  ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, FogExp2, HemisphereLight, InstancedMesh,
  MathUtils, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
  type BufferGeometry, type Material, type Mesh, type Texture, type WebGLRenderTarget
} from 'three';
import { RaceEffects } from './effects';
import type { Settings } from './settings';
import { Ship } from './ship';
import type { Track } from './track';
import { MAX_FORWARD, type Vehicle } from './vehicle';
import { createWorld } from './world';

const PRESETS = {
  low: { ratio: 0.86, budget: 1_050_000 },
  medium: { ratio: 1.35, budget: 1_900_000 }
};

export class RaceRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(56, 1, 0.16, 1000);
  private readonly ship = new Ship();
  private readonly aim = new Vector3();
  private readonly target = new Vector3();
  private readonly position = new Vector3();
  private readonly track: Track;
  private readonly effects: RaceEffects;
  private readonly world: ReturnType<typeof createWorld>;
  private readonly events = new AbortController();
  private settings: Settings;
  private reflection: WebGLRenderTarget | null = null;
  private resolutionScale = 1;
  private slowFrames = 0;
  private fastFrames = 0;
  private lastFrame = 0;
  private resizePending = true;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private lastSpeed = 0;
  private acceleration = 0;
  private bank = 0;

  constructor(canvas: HTMLCanvasElement, track: Track, settings: Settings) {
    this.track = track;
    this.settings = settings;
    this.renderer = new WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.10;
    this.scene.background = new Color('#111932');
    this.scene.fog = new FogExp2('#313453', 0.0063);
    const ambient = new HemisphereLight('#9acaff', '#492052', 1.7);
    const key = new DirectionalLight('#b5dbff', 2.07);
    key.position.set(-5, 12, -7);
    const rim = new DirectionalLight('#ff83cf', 1.20);
    rim.position.set(5, 5, 10);
    this.world = createWorld(track);
    this.effects = new RaceEffects(track);
    this.scene.add(this.world.root, this.ship.root, this.effects.root, ambient, key, rim);
    this.refreshReflection();
    this.configure(settings);
    const options = { signal: this.events.signal };
    window.addEventListener('resize', () => {
      this.resizePending = true;
    }, options);
    canvas.addEventListener('webglcontextlost', () => this.releaseSceneResources(), options);
    canvas.addEventListener('webglcontextrestored', () => this.refreshReflection(), options);
  }

  get needsRedraw(): boolean {
    return this.resizePending;
  }

  configure(settings: Settings): void {
    const changed = settings.preset !== this.settings.preset;
    this.settings = settings;
    const low = settings.preset === 'low';
    this.world.detail.visible = !low;
    this.effects.configure(settings.effects, low);
    if (changed) {
      this.resolutionScale = 1;
      this.slowFrames = this.fastFrames = 0;
    }
    this.resizePending = true;
  }

  private refreshReflection(): void {
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#12172f';
    ctx.fillRect(0, 0, 256, 128);
    const horizon = ctx.createLinearGradient(0, 0, 0, 128);
    horizon.addColorStop(0, '#28335a');
    horizon.addColorStop(0.34, '#182344');
    horizon.addColorStop(0.5, '#52618a');
    horizon.addColorStop(0.65, '#161b3a');
    horizon.addColorStop(1, '#0b1026');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#d7f5ff';
    ctx.fillRect(26, 21, 75, 15);
    ctx.fillStyle = '#44deff';
    ctx.fillRect(15, 53, 96, 5);
    ctx.fillStyle = '#f96fc8';
    ctx.fillRect(140, 48, 70, 8);
    ctx.fillStyle = '#9879ff';
    ctx.fillRect(187, 69, 48, 6);
    const source = new CanvasTexture(canvas);
    source.colorSpace = SRGBColorSpace;
    const generator = new PMREMGenerator(this.renderer);
    const reflection = generator.fromEquirectangular(source);
    source.dispose();
    generator.dispose();
    this.reflection?.dispose();
    this.reflection = reflection;
    this.ship.setEnvironment(reflection.texture);
  }

  private resize(): void {
    this.resizePending = false;
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const preset = PRESETS[this.settings.preset];
    const ratio = Math.min(window.devicePixelRatio, preset.ratio, Math.sqrt(preset.budget / (width * height)));
    const resolution = ratio * this.resolutionScale;
    if (width === this.viewportWidth && height === this.viewportHeight && this.renderer.getPixelRatio() === resolution) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setDrawingBufferSize(width, height, resolution);
  }

  draw(vehicle: Vehicle, dt: number, seconds: number, menu: boolean, snap: boolean): void {
    this.tuneResolution(menu, dt);
    if (this.resizePending) this.resize();
    if (snap) this.effects.clear();
    this.ship.update(vehicle, snap ? Math.max(dt, 0.6) : dt, seconds);
    this.placeCamera(vehicle, dt, menu, snap);
    this.effects.update(vehicle, dt, seconds, menu);
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(vehicle: Vehicle, dt: number, menu: boolean, snap: boolean): void {
    const sample = this.track.at(vehicle.distance);
    const fx = Math.sin(vehicle.heading);
    const fz = -Math.cos(vehicle.heading);
    const travel = Math.min(vehicle.speed / MAX_FORWARD, 1);
    const speed = vehicle.speed;
    const acceleration = dt > 0 && !snap ? MathUtils.clamp((speed - this.lastSpeed) / dt / 40, -1, 1) : 0;
    this.lastSpeed = speed;
    this.acceleration = snap ? 0 : MathUtils.damp(this.acceleration, acceleration, 3.9, dt);
    if (menu) {
      const narrow = this.camera.aspect < 1.12;
      this.position.set(vehicle.x - (narrow ? 3.0 : 7.2), narrow ? 4.2 : 3.55, vehicle.z + (narrow ? 15 : 13.0));
      this.target.set(vehicle.x + (narrow ? 2.3 : -5.9), narrow ? -2.5 : 3.5, vehicle.z - 18.0);
    } else {
      const followX = MathUtils.lerp(fx, sample.tx, 0.7);
      const followZ = MathUtils.lerp(fz, sample.tz, 0.7);
      const trail = 10.2 + travel * 2.2 + 0.42 * this.acceleration;
      this.position.set(vehicle.x - followX * trail, 4.7 + travel * 0.95 + this.acceleration * 0.13, vehicle.z - followZ * trail);
      this.target.set(vehicle.x + followX * 10.5, 1.12 + vehicle.impact * 0.17, vehicle.z + followZ * 10.5);
    }
    if (snap) {
      this.camera.position.copy(this.position);
      this.aim.copy(this.target);
    } else {
      this.camera.position.lerp(this.position, 1 - Math.exp(-7.5 * dt));
      this.aim.lerp(this.target, 1 - Math.exp(-11 * dt));
    }
    const nextFov = menu ? 55 : 56 + 7 * travel + (vehicle.boosting ? 4 : 0);
    const fov = snap ? nextFov : MathUtils.damp(this.camera.fov, nextFov, 5, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.aim);
    const lean = this.settings.effects && !menu && vehicle.drifting ? vehicle.steer * -0.035 : 0;
    this.bank = snap ? 0 : MathUtils.damp(this.bank, lean, 4.8, dt);
    this.camera.rotateZ(this.bank);
  }

  private tuneResolution(menu: boolean, dt: number): void {
    const now = performance.now();
    const interval = now - this.lastFrame;
    this.lastFrame = now;
    if (menu || dt === 0 || interval > 160) return;
    this.slowFrames = interval > 24 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    this.fastFrames = interval < 18.1 ? this.fastFrames + 1 : 0;
    const scale = this.slowFrames > 55 ? Math.max(0.64, this.resolutionScale - 0.12)
      : this.fastFrames > 360 ? Math.min(1, this.resolutionScale + 0.12) : this.resolutionScale;
    if (scale !== this.resolutionScale) {
      this.resolutionScale = scale;
      this.slowFrames = this.fastFrames = 0;
      this.resizePending = true;
    }
  }

  private releaseSceneResources(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.scene.traverse(object => {
      if (object instanceof InstancedMesh) object.dispose();
      if (!('geometry' in object)) return;
      const draw = object as Mesh;
      geometries.add(draw.geometry);
      for (const material of Array.isArray(draw.material) ? draw.material : [draw.material]) {
        materials.add(material);
        if ('map' in material && material.map) textures.add(material.map as Texture);
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.reflection?.dispose();
    this.reflection = null;
    this.ship.setEnvironment(null);
  }

  dispose(): void {
    this.events.abort();
    this.releaseSceneResources();
    this.scene.clear();
    this.renderer.dispose();
  }
}

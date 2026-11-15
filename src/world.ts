import {
  AdditiveBlending, BackSide, BoxGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute,
  GridHelper, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PlaneGeometry, RepeatWrapping, ShaderMaterial, SphereGeometry, SRGBColorSpace, type Material
} from 'three';
import { ROAD_HALF_WIDTH, Track } from './track';

const basic = (color: string) => new MeshBasicMaterial({ color });
const metal = (color: string) => new MeshStandardMaterial({ color, roughness: 0.83 });
const palette = {
  rail: metal('#273247'),
  curb: metal('#171e2e'),
  cyan: basic('#75f5ff'),
  blue: basic('#358bff'),
  pink: basic('#ff6fbe'),
  purple: basic('#9d64ff'),
  amber: basic('#ffc88e'),
  white: basic('#d5f1f6'),
  paint: basic('#566d8b'),
  dark: basic('#202b3b'),
  line: basic('#303e51'),
  shoulder: metal('#253555'),
  exterior: metal('#121725')
};

class Boxes {
  private readonly batches = new Map<Material, Matrix4[]>();
  private readonly transform = new Object3D();

  constructor(private readonly flat = false) {}

  add(material: Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0): void {
    this.transform.position.set(x, y, z);
    this.transform.rotation.y = yaw;
    this.transform.scale.set(w, h, d);
    this.transform.updateMatrix();
    const matrix = this.transform.matrix.clone();
    const batch = this.batches.get(material);
    if (batch) batch.push(matrix);
    else this.batches.set(material, [matrix]);
  }

  build(group: Group): void {
    const geometry = this.flat ? new PlaneGeometry() : new BoxGeometry();
    for (const [material, matrices] of this.batches) {
      const mesh = new InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
}

function roadMaterial(track: Track): MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const surface = ctx.createImageData(canvas.width, canvas.height);
  let random = 6971;
  for (let i = 0; i < surface.data.length; i += 4) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const grain = 173 + (random >>> 27);
    surface.data[i] = grain;
    surface.data[i + 1] = grain;
    surface.data[i + 2] = grain;
    surface.data[i + 3] = 255;
  }
  ctx.putImageData(surface, 0, 0);
  ctx.fillStyle = '#17233927';
  for (const x of [19, 42, 85, 108]) ctx.fillRect(x, 0, 3, 256);
  ctx.fillStyle = '#d8e6ff20';
  for (const x of [24, 48, 80, 104]) ctx.fillRect(x, 0, 1, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapT = RepeatWrapping;
  texture.repeat.y = Math.round(track.length / 14);
  texture.anisotropy = 2;
  return new MeshStandardMaterial({ color: '#314465', map: texture, roughness: 0.84 });
}

function ribbon(track: Track, material: Material, left: number, right: number, height: number): Mesh {
  const geometry = new PlaneGeometry(1, 1, 1, track.samples.length);
  const positions = geometry.attributes.position;
  for (let i = 0; i <= track.samples.length; i++) {
    const { x, z, tx, tz } = track.samples[i % track.samples.length];
    positions.setXYZ(i * 2, x - tz * right, height, z + tx * right);
    positions.setXYZ(i * 2 + 1, x - tz * left, height, z + tx * left);
  }
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

function edgeLight(track: Track, side: number): Mesh {
  const outside = ROAD_HALF_WIDTH - 0.18;
  const inside = outside - 3.8;
  const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const light = ribbon(track, material, side < 0 ? -outside : inside, side < 0 ? -inside : outside, 0.031);
  const { r, g, b } = new Color(side < 0 ? '#28cefa' : '#f148ac');
  const colors: number[] = [];
  for (let i = 0; i <= track.samples.length; i++) {
    colors.push(r, g, b, side > 0 ? 0.31 : 0, r, g, b, side < 0 ? 0.31 : 0);
  }
  light.geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  return light;
}

function trackBox(
  boxes: Boxes, track: Track, material: Material, distance: number, offset: number,
  y: number, width: number, height: number, depth: number, rotation = 0
): void {
  const { x, z, tx, tz } = track.at(distance);
  boxes.add(material, x - tz * offset, y, z + tx * offset, width, height, depth, Math.atan2(-tx, -tz) + rotation);
}

function trackSurface(group: Group, track: Track, boxes: Boxes): void {
  const edge = ROAD_HALF_WIDTH;
  group.add(ribbon(track, roadMaterial(track), -edge, edge, 0));
  for (const side of [-1, 1]) {
    const band = (material: Material, distance: number, width: number, height: number) => {
      const center = side * distance;
      group.add(ribbon(track, material, center - width / 2, center + width / 2, height));
    };
    band(palette.shoulder, edge - 0.6, 1.2, 0.014);
    band(palette.exterior, edge + 0.6, 1.2, -0.12);
    band(palette.paint, edge - 1.25, 0.075, 0.024);
    band(palette.rail, edge + 0.24, 0.49, 0.42);
    band(side < 0 ? palette.blue : palette.purple, edge - 0.1, 0.4, 0.028);
    band(side < 0 ? palette.cyan : palette.pink, edge - 0.1, 0.13, 0.035);
    band(side < 0 ? palette.cyan : palette.pink, edge + 0.19, 0.1, 0.427);
    band(side < 0 ? palette.blue : palette.purple, edge + 0.32, 0.07, 0.425);
    group.add(edgeLight(track, side));
  }

  const segments = Math.round(track.length / 5.3);
  for (let i = 0; i < segments; i++) {
    const distance = i * track.length / segments;
    trackBox(boxes, track, palette.line, distance, 0, 0.017, 14.4, 0.012, 0.045);
    for (const side of [-1, 1]) {
      trackBox(boxes, track, palette.curb, distance, side * (edge + 0.25), 0.22, 0.48, 0.44, 0.64);
      trackBox(boxes, track, palette.paint, distance, side * 7.92, 0.028, 0.26, 0.012, 1.45, side * 0.18);
      if (i % 4 === 0) {
        trackBox(boxes, track, palette.rail, distance, side * (edge + 1), 0.36, 0.55, 1.2, 0.55);
        trackBox(boxes, track, side < 0 ? palette.cyan : palette.pink, distance, side * (edge + 1), 0.98, 0.52, 0.13, 0.48);
      }
    }
    if (i % 6 === 3) {
      for (const side of [-1, 1]) {
        trackBox(boxes, track, palette.paint, distance, side * 0.46, 0.018, 0.10, 0.013, 1.45, side * 0.63);
        trackBox(boxes, track, palette.paint, distance - 0.76, side * 0.46, 0.018, 0.10, 0.013, 1.45, side * 0.63);
      }
    }
  }

  for (let column = -8; column < 8; column++) {
    for (let row = 0; row < 2; row++) {
      trackBox(boxes, track, (column + row) % 2 === 0 ? palette.white : palette.dark,
        row * 0.58 - 0.38, (column + 0.5) * 0.92, 0.024, 0.91, 0.02, 0.57);
    }
  }
}

function sign(label: string, sublabel: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 116;
  const ctx = canvas.getContext('2d')!;
  const face = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  face.addColorStop(0, '#0e2840');
  face.addColorStop(1, '#20163a');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#285c76';
  ctx.strokeRect(8, 8, 624, 100);
  ctx.fillStyle = '#ffcf9e';
  ctx.font = 'bold 19px monospace';
  ctx.fillText(sublabel, 31, 38);
  ctx.fillStyle = '#eafcff';
  ctx.font = 'italic 900 42px sans-serif';
  ctx.fillText(label, 28, 85);
  ctx.fillStyle = '#63edff';
  ctx.fillRect(21, 11, 145, 3);
  ctx.fillStyle = '#c881ff';
  ctx.fillRect(465, 100, 148, 3);
  ctx.fillStyle = '#f652aa';
  for (let i = 0; i < 3; i++) {
    const x = 529 + i * 24;
    ctx.beginPath();
    ctx.moveTo(x, 37);
    ctx.lineTo(x + 14, 37);
    ctx.lineTo(x + 27, 58);
    ctx.lineTo(x + 14, 80);
    ctx.lineTo(x, 80);
    ctx.lineTo(x + 13, 58);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function gates(group: Group, detail: Group, track: Track, boxes: Boxes): void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const wash = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  wash.addColorStop(0, 'rgba(255,255,255,0.63)');
  wash.addColorStop(0.46, 'rgba(255,255,255,0.22)');
  wash.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 64, 64);
  const gatePool = new MeshBasicMaterial({
    map: new CanvasTexture(canvas), color: '#9965f5', transparent: true, opacity: 0.42,
    blending: AdditiveBlending, depthWrite: false
  });
  const poolGeometry = new PlaneGeometry(17.4, 19);
  const signGeometry = new PlaneGeometry(10.9, 1.62);
  for (const [index, { distance, label }] of track.checkpoints.entries()) {
    for (const side of [-1, 1]) {
      const accent = side < 0 ? palette.cyan : palette.pink;
      trackBox(boxes, track, palette.curb, distance, side * 9.84, 3.16, 1.38, 7.62, 2.0);
      trackBox(boxes, track, palette.rail, distance, side * 9.84, 0.38, 2.0, 2.0, 2.6);
      trackBox(boxes, track, accent, distance, side * 9.84, 3.88, 0.15, 5.34, 2.04);
      trackBox(boxes, track, accent, distance, side * 9.14, 4.2, 0.12, 4.9, 0.15);
      trackBox(boxes, track, accent, distance, side * 7.43, 6.25, 3.16, 0.11, 2.02);
      trackBox(boxes, track, palette.amber, distance + 0.16, side * 7.34, 0.043, 1.05, 0.025, 0.22);
      trackBox(boxes, track, palette.amber, distance - 0.64, side * 9.04, 2.57, 0.08, 1.95, 0.15);
      trackBox(boxes, track, palette.rail, distance, side * 8.43, 6.23, 3.25, 0.85, 1.9, 0);
    }
    trackBox(boxes, track, palette.curb, distance, 0, 6.82, 20.6, 1.39, 2);
    trackBox(boxes, track, palette.cyan, distance, 0, 7.53, 20.9, 0.11, 2.05);
    for (const strip of [-0.71, 0.71]) {
      trackBox(boxes, track, palette.blue, distance + strip, 0, 6.09, 13.5, 0.055, 0.14);
    }
    const sample = track.at(distance);
    const board = new Mesh(signGeometry, new MeshBasicMaterial({
      map: sign(label, `CHECKPOINT ${index + 1} / ${track.checkpoints.length}`), side: DoubleSide
    }));
    board.position.set(sample.x - sample.tx * 1.015, 6.82, sample.z - sample.tz * 1.015);
    board.rotation.y = Math.atan2(-sample.tx, -sample.tz);
    group.add(board);
    const pool = new Mesh(poolGeometry, gatePool);
    pool.position.set(sample.x, 0.045, sample.z);
    pool.rotation.set(-Math.PI / 2, 0, Math.atan2(-sample.tx, -sample.tz));
    detail.add(pool);
  }

  for (let distance = 26; distance < track.length - 11; distance += 23) {
    for (const side of [-1, 1]) {
      const accent = side < 0 ? palette.cyan : palette.pink;
      trackBox(boxes, track, palette.curb, distance, 10.55 * side, 2.4, 0.22, 6.2, 0.26);
      trackBox(boxes, track, palette.rail, distance, 9.91 * side, 5.34, 1.55, 0.18, 0.34);
      trackBox(boxes, track, accent, distance, 9.64 * side, 5.23, 0.92, 0.08, 0.29);
    }
  }
}

function city(track: Track, boxes: Boxes, windows: Boxes, detail: Boxes): void {
  let seed = 7831;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const facades = ['#18273d', '#14192e', '#2d2547', '#121b31', '#30203c'].map(metal);
  const windowColors = ['#315c82', '#527da6', '#695396', '#43a2bf', '#a25796', '#1c2e4e'].map(basic);
  const tier = metal('#252945');
  for (let gx = -5; gx <= 11; gx++) {
    for (let gz = -10; gz <= 10; gz++) {
      const x = gx * 25 + (random() - 0.5) * 12;
      const z = gz * 25 + (random() - 0.5) * 12;
      if (track.contains(x, z, 25) || random() < 0.22) continue;
      if (x > 12 && x < 68 && z > 26 && z < 126) continue;
      const width = 7 + random() * 12;
      const depth = 7 + random() * 12;
      const height = 6 + random() ** 1.7 * 50;
      const facade = facades[Math.floor(random() * facades.length)];
      const accent = random() > 0.63 ? palette.purple : palette.blue;
      boxes.add(facade, x, height / 2 - 0.9, z, width, height, depth);
      boxes.add(facade, x, height - 0.32, z, width * 0.76, 1.5, depth * 0.75);
      if (random() > 0.49) {
        boxes.add(accent, x, height - 0.54, z + depth * 0.5, width, 0.15, 0.16);
        boxes.add(accent, x, height - 0.54, z - depth * 0.5, width, 0.15, 0.16);
      }
      if (height > 28 && random() > 0.48) {
        boxes.add(facade, x, height + 2.3, z, 0.52, 6, 0.52);
        boxes.add(palette.pink, x, height + 5.47, z, 0.29, 0.25, 0.29);
      }
      if (height > 26 && (gx - gz) % 3 === 0) {
        detail.add(tier, x, height + 2.1, z, width * 0.57, 5.0, depth * 0.50);
        detail.add(accent, x, height + 4.61, z, width * 0.57, 0.13, depth * 0.50);
        detail.add(accent, x - width * 0.41, height * 0.67, z + depth * 0.504, 0.12, height * 0.52, 0.08);
        detail.add(accent, x + width * 0.41, height * 0.67, z + depth * 0.504, 0.12, height * 0.52, 0.08);
      }
      for (let y = 2; y < height - 2; y += 2.75) {
        const material = windowColors[Math.floor(random() * windowColors.length)];
        for (const side of [-1, 1]) {
          for (let column = -1; column <= 1; column++) {
            if (random() > 0.3) {
              windows.add(material, x + column * width * 0.27, y, z + side * depth * 0.503, width * 0.19, 0.30, 1, side > 0 ? 0 : Math.PI);
            }
            if (random() > 0.43) {
              windows.add(material, x + side * width * 0.503, y, z + column * depth * 0.27, depth * 0.19, 0.30, 1, side * Math.PI / 2);
            }
          }
        }
      }
    }
  }

  for (const [x, z, height] of [[-27, 36, 26], [25, 12, 31], [-32, -32, 41], [31, -66, 37]]) {
    const accent = x < 0 ? palette.purple : palette.cyan;
    boxes.add(palette.curb, x, height / 2 - 0.6, z, 6.2, height, 5);
    boxes.add(palette.rail, x, height / 2, z, 4.9, height - 0.5, 5.2);
    boxes.add(accent, x - 2.6, height / 2 + 1.0, z + 2.64, 0.23, height - 3, 0.14);
    boxes.add(accent, x + 2.6, height / 2 + 1.0, z + 2.64, 0.23, height - 3, 0.14);
    boxes.add(accent, x, height - 0.68, z, 6.3, 0.18, 5.15);
    detail.add(x < 0 ? palette.pink : palette.blue, x, height * 0.56, z + 2.69, 0.48, height * 0.56, 0.08);
  }
}

export function createWorld(track: Track): { root: Group; detail: Group } {
  const root = new Group();
  const detail = new Group();
  const boxes = new Boxes();
  const windows = new Boxes(true);
  const trim = new Boxes();
  trackSurface(root, track, boxes);
  gates(root, detail, track, boxes);
  city(track, boxes, windows, trim);
  boxes.build(root);
  windows.build(root);
  trim.build(detail);
  root.add(detail);

  const ground = new Mesh(new PlaneGeometry(1600, 1600), basic('#09101e'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.91;
  root.add(ground);
  const grid = new GridHelper(840, 105, '#172037', '#172037');
  grid.position.y = -0.895;
  root.add(grid);

  const sky = new Mesh(new SphereGeometry(700, 28, 16), new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new Color('#080b24') },
      horizon: { value: new Color('#293d60') },
      haze: { value: new Color('#943965') },
      cobalt: { value: new Color('#224da0') }
    },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 direction;
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 haze;
      uniform vec3 cobalt;
      void main() {
        vec3 ray = normalize(direction);
        float band = exp(-max(ray.y, 0.0) * 6.5);
        float glow = pow(max(dot(ray, normalize(vec3(0.60, 0.10, -1.0))), 0.0), 7.0);
        float blue = pow(max(dot(ray, normalize(vec3(-0.9, 0.15, -0.6))), 0.0), 6.0);
        float clouds = sin(ray.x * 12.0 + ray.y * 37.0 + sin(ray.z * 9.0)) * 0.5 + 0.5;
        vec3 skyColor = mix(zenith, mix(horizon, haze, glow * (0.64 + clouds * 0.14)), band);
        skyColor = mix(skyColor, cobalt, blue * band * 0.54);
        gl_FragColor = vec4(skyColor, 1.0);
        #include <colorspace_fragment>
      }
    `
  }));
  sky.renderOrder = -10;
  root.add(sky);
  return { root, detail };
}

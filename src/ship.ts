import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, InstancedMesh,
  MathUtils, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry,
  SRGBColorSpace, type Material, type Texture
} from 'three';
import { MAX_BOOST_SPEED, type Vehicle } from './vehicle';

const dark = new MeshStandardMaterial({ color: '#202a3c', metalness: 0.53, roughness: 0.38 });
const trim = new MeshStandardMaterial({ color: '#344a6a', metalness: 0.64, roughness: 0.35 });
const silver = new MeshPhysicalMaterial({
  color: '#a9bed9', metalness: 0.68, roughness: 0.29, clearcoat: 0.36, clearcoatRoughness: 0.26
});
const glass = new MeshPhysicalMaterial({
  color: '#12224a', roughness: 0.19, metalness: 0.55, clearcoat: 0.68,
  clearcoatRoughness: 0.14, emissive: '#0d1841', emissiveIntensity: 0.47
});
const ivory = new MeshBasicMaterial({ color: '#d5faff' });
const cyan = new MeshBasicMaterial({ color: '#6effff' });
const pink = new MeshBasicMaterial({ color: '#ff3d8a' });
const shadowPlane = new PlaneGeometry(1, 1);
const plateGeometry = new BoxGeometry();

interface Section {
  z: number;
  bottomWidth: number;
  topWidth: number;
  bottom: number;
  top: number;
}

function hull(sections: Section[], material: MeshStandardMaterial): Mesh {
  const vertices = sections.flatMap(({ z, bottomWidth, topWidth, bottom, top }) => [
    -bottomWidth, bottom, z,
    bottomWidth, bottom, z,
    topWidth, top, z,
    -topWidth, top, z
  ]);
  const faces: number[] = [0, 1, 2, 0, 2, 3];
  for (let i = 0; i < sections.length - 1; i++) {
    for (let side = 0; side < 4; side++) {
      const a = i * 4 + side;
      const b = i * 4 + (side + 1) % 4;
      faces.push(a, a + 4, b, b, a + 4, b + 4);
    }
  }
  const end = (sections.length - 1) * 4;
  faces.push(end, end + 2, end + 1, end, end + 3, end + 2);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(faces);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return new Mesh(faceted, material);
}

function plate(material: MeshStandardMaterial | MeshBasicMaterial, width: number, height: number, depth: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(plateGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  return mesh;
}

function batchPlates(body: Group): void {
  const batches = new Map<Material, Mesh[]>();
  for (const child of body.children) {
    if (!(child instanceof Mesh) || child.geometry !== plateGeometry || Array.isArray(child.material)) continue;
    const plates = batches.get(child.material) ?? [];
    plates.push(child);
    batches.set(child.material, plates);
  }
  for (const [material, plates] of batches) {
    if (plates.length < 2) continue;
    const batch = new InstancedMesh(plateGeometry, material, plates.length);
    plates.forEach((part, index) => {
      part.updateMatrix();
      batch.setMatrixAt(index, part.matrix);
      body.remove(part);
    });
    batch.computeBoundingSphere();
    body.add(batch);
  }
}

function radialTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,.63)');
  gradient.addColorStop(0.61, 'rgba(255,255,255,.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class Ship {
  readonly root = new Group();
  private readonly chassis = new Group();
  private readonly body = new Group();
  private readonly aft: MeshBasicMaterial;
  private readonly thrust: MeshBasicMaterial;
  private readonly underglow: MeshBasicMaterial;
  private readonly plumeMaterial: MeshBasicMaterial;
  private readonly plumes: Mesh[] = [];

  constructor() {
    const texture = radialTexture();
    const shadow = new Mesh(shadowPlane, new MeshBasicMaterial({
      map: texture, color: '#030711', transparent: true, opacity: 0.76, depthWrite: false
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.048;
    shadow.scale.set(4.6, 7.8, 1);
    this.underglow = new MeshBasicMaterial({
      map: texture, color: '#17cfff', transparent: true, opacity: 0.62,
      blending: AdditiveBlending, depthWrite: false
    });
    const under = new Mesh(shadowPlane, this.underglow);
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, 0.066, 0.22);
    under.scale.set(6.0, 9.1, 1);
    const spill = new Mesh(shadowPlane, new MeshBasicMaterial({
      map: texture, color: '#5da8ff', transparent: true, opacity: 0.16,
      blending: AdditiveBlending, depthWrite: false
    }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, 0.065, -4.5);
    spill.scale.set(4.9, 6.1, 1);
    this.root.add(shadow, under, spill, this.chassis);
    this.chassis.add(this.body);

    this.body.add(hull([
      { z: 2.68, bottomWidth: 0.99, topWidth: 1.07, bottom: -0.13, top: 0.28 },
      { z: 1.82, bottomWidth: 1.34, topWidth: 1.17, bottom: -0.29, top: 0.51 },
      { z: -0.55, bottomWidth: 1.08, topWidth: 0.92, bottom: -0.24, top: 0.48 },
      { z: -2.4, bottomWidth: 1.00, topWidth: 0.66, bottom: -0.09, top: 0.17 },
      { z: -2.81, bottomWidth: 0.61, topWidth: 0.56, bottom: -0.02, top: 0.13 }
    ], silver));
    this.body.add(hull([
      { z: 1.64, bottomWidth: 0.74, topWidth: 0.66, bottom: 0.433, top: 0.54 },
      { z: 0.52, bottomWidth: 0.77, topWidth: 0.63, bottom: 0.44, top: 0.55 },
      { z: -1.64, bottomWidth: 0.51, topWidth: 0.39, bottom: 0.28, top: 0.43 }
    ], dark));
    this.body.add(hull([
      { z: 1.14, bottomWidth: 0.65, topWidth: 0.42, bottom: 0.44, top: 0.73 },
      { z: 0.26, bottomWidth: 0.68, topWidth: 0.47, bottom: 0.45, top: 0.96 },
      { z: -0.69, bottomWidth: 0.55, topWidth: 0.34, bottom: 0.36, top: 0.89 },
      { z: -1.62, bottomWidth: 0.31, topWidth: 0.20, bottom: 0.26, top: 0.42 }
    ], glass));
    this.body.add(plate(dark, 1.72, 0.28, 0.19, 0, 0.08, 2.7));
    this.body.add(plate(pink, 1.46, 0.073, 0.032, 0, 0.16, 2.805));
    this.body.add(plate(ivory, 0.64, 0.026, 0.035, 0, 0.175, 2.817));
    this.body.add(plate(dark, 0.22, 0.036, 1.20, 0, 0.48, 1.64));

    this.aft = new MeshBasicMaterial({ color: '#ff6ca5' });
    this.thrust = new MeshBasicMaterial({
      map: texture, color: '#4fecff', transparent: true, opacity: 0.82,
      blending: AdditiveBlending, depthWrite: false
    });
    this.plumeMaterial = new MeshBasicMaterial({
      map: texture, color: '#4fecff', transparent: true, opacity: 0.20,
      blending: AdditiveBlending, depthWrite: false
    });
    for (const side of [-1, 1]) {
      const engine = hull([
        { z: 2.80, bottomWidth: 0.34, topWidth: 0.32, bottom: -0.26, top: 0.29 },
        { z: 1.83, bottomWidth: 0.44, topWidth: 0.30, bottom: -0.33, top: 0.43 },
        { z: 0.2, bottomWidth: 0.27, topWidth: 0.19, bottom: -0.22, top: 0.32 }
      ], trim);
      engine.position.x = side * 1.07;
      this.body.add(engine);
      this.body.add(plate(dark, 0.65, 0.45, 0.12, side * 1.07, 0, 2.83));
      this.body.add(plate(this.aft, 0.56, 0.08, 0.026, side * 1.07, 0.121, 2.901));
      this.body.add(plate(cyan, 0.43, 0.089, 0.028, side * 1.07, -0.079, 2.903));
      this.body.add(plate(cyan, 0.044, 0.097, 1.65, side * 1.338, 0.029, 1.43));
      const wing = plate(dark, 0.38, 0.103, 2.29, side * 0.94, 0.28, -1.28);
      wing.rotation.y = side * -0.09;
      this.body.add(wing);
      this.body.add(plate(cyan, 0.39, 0.065, 0.051, side * 0.87, 0.28, -2.422));
      this.body.add(plate(ivory, 0.40, 0.057, 0.05, side * 0.42, 0.111, -2.83));
      this.body.add(plate(cyan, 0.22, 0.036, 0.45, side * 0.67, 0.189, -2.442));
      const shoulder = hull([
        { z: 2.28, bottomWidth: 0.29, topWidth: 0.16, bottom: 0.23, top: 0.46 },
        { z: 1.42, bottomWidth: 0.31, topWidth: 0.18, bottom: 0.28, top: 0.58 },
        { z: -0.44, bottomWidth: 0.24, topWidth: 0.11, bottom: 0.25, top: 0.37 }
      ], silver);
      shoulder.position.x = side * 1.10;
      this.body.add(shoulder);
      for (let slat = 0; slat < 3; slat++) {
        this.body.add(plate(dark, 0.30, 0.035, 0.065, side * 0.80, 0.535 - slat * 0.013, 1.35 + slat * 0.14));
      }
      const glow = new Mesh(shadowPlane, this.thrust);
      glow.position.set(side * 1.07, -0.05, 2.94);
      glow.scale.set(1.42, 0.8, 1);
      this.body.add(glow);
      const plume = new Mesh(shadowPlane, this.plumeMaterial);
      plume.rotation.x = -Math.PI / 2;
      plume.position.set(side * 1.07, -0.08, 3.1);
      this.plumes.push(plume);
      this.body.add(plume);
    }
    batchPlates(this.body);
  }

  setEnvironment(texture: Texture | null): void {
    for (const material of [silver, glass, trim]) {
      material.envMap = texture;
      material.envMapIntensity = material === silver ? 1.12 : 0.8;
      material.needsUpdate = true;
    }
  }

  update(vehicle: Vehicle, dt: number, seconds: number): void {
    this.root.position.set(vehicle.x, 0, vehicle.z);
    this.root.rotation.y = -vehicle.heading;
    this.body.position.y = 0.81 + Math.sin(seconds * 3.7) * 0.071;
    const driftLean = vehicle.drifting ? MathUtils.clamp(vehicle.slip * 0.008, -0.09, 0.09) : 0;
    this.chassis.rotation.z = MathUtils.damp(this.chassis.rotation.z, -vehicle.steer * 0.18 + driftLean, 7, dt);
    const pitch = vehicle.braking ? -0.07 : vehicle.boosting ? 0.094 : vehicle.throttle ? 0.055 : 0;
    this.chassis.rotation.x = MathUtils.damp(this.chassis.rotation.x, pitch, 7, dt);
    this.underglow.color.set(vehicle.boosting ? '#62eaff' : vehicle.drifting ? '#bc5aff' : '#17cfff');
    this.underglow.opacity = (vehicle.boosting ? 0.75 : 0.57) + Math.min(vehicle.speed / 120, 0.24);
    this.thrust.color.set(vehicle.boosting ? '#b2fbff' : '#4fecff');
    const speed = Math.min(1, vehicle.speed / MAX_BOOST_SPEED);
    const pulse = Math.sin(seconds * 24) * 0.034;
    this.thrust.opacity = vehicle.boosting ? 0.96 + pulse : 0.57 + speed * 0.31 + pulse;
    this.plumeMaterial.color.set(vehicle.boosting ? '#a5f4ff' : '#429fff');
    this.plumeMaterial.opacity = vehicle.boosting ? 0.64 + pulse : 0.10 + speed * 0.22;
    const length = (vehicle.boosting ? 2.8 : 0.58) + speed * 2.1 + pulse;
    for (const plume of this.plumes) {
      plume.scale.set(0.34 + speed * 0.21, length, 1);
      plume.position.z = 2.76 + length * 0.29;
    }
    this.aft.color.set(vehicle.braking ? '#ffccd7' : '#ff6ca5');
  }
}

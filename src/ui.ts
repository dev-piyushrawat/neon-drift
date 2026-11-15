import type { Track } from './track';
import type { Settings } from './settings';
import type { TimeTrial } from './time-trial';
import { MAX_BOOST_SPEED, MIN_BOOST_CHARGE, type Vehicle } from './vehicle';

export function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function setText(target: HTMLElement, text: string): void {
  if (target.textContent !== text) target.textContent = text;
}

function timecode(milliseconds: number): string {
  const ms = Math.floor(milliseconds);
  const minutes = Math.floor(ms / 60000).toString().padStart(2, '0');
  const remainder = Math.floor(ms / 1000 % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}.${(ms % 1000).toString().padStart(3, '0')}`;
}

class CourseMap {
  private readonly canvas = element<HTMLCanvasElement>('minimap');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly background = document.createElement('canvas');
  private readonly backgroundContext = this.background.getContext('2d')!;
  private readonly circuit = new Path2D();
  private readonly scale: number;
  private readonly centerX: number;
  private readonly centerZ: number;
  private readonly gates: [number, number][];
  private lastCleared = -1;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private lastHeading = Number.NaN;

  constructor(track: Track) {
    this.background.width = this.canvas.width;
    this.background.height = this.canvas.height;
    const samples = track.samples;
    const xs = samples.map(sample => sample.x);
    const zs = samples.map(sample => sample.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    this.centerX = (minX + maxX) / 2;
    this.centerZ = (minZ + maxZ) / 2;
    this.scale = Math.min((this.canvas.width - 25) / (maxX - minX), (this.canvas.height - 24) / (maxZ - minZ));

    for (let i = 0; i < samples.length; i += 3) {
      const [x, y] = this.point(samples[i].x, samples[i].z);
      if (i === 0) this.circuit.moveTo(x, y);
      else this.circuit.lineTo(x, y);
    }
    this.circuit.closePath();
    const sample = track.at(0);
    const [x, y] = this.point(sample.x, sample.z);
    this.circuit.moveTo(x + sample.tz * 8, y - sample.tx * 8);
    this.circuit.lineTo(x - sample.tz * 8, y + sample.tx * 8);
    this.gates = track.checkpoints.map(({ distance }) => {
      const gate = track.at(distance);
      return this.point(gate.x, gate.z);
    });
  }

  private point(x: number, z: number): [number, number] {
    return [
      this.canvas.width / 2 + (x - this.centerX) * this.scale,
      this.canvas.height / 2 + (z - this.centerZ) * this.scale
    ];
  }

  private drawBackground(cleared: number): void {
    const ctx = this.backgroundContext;
    ctx.clearRect(0, 0, this.background.width, this.background.height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#53758d';
    ctx.stroke(this.circuit);
    this.gates.forEach(([x, y], index) => {
      ctx.fillStyle = index === cleared ? '#ffc580' : index < cleared ? '#67efff' : '#8595ad';
      ctx.beginPath();
      ctx.arc(x, y, index === cleared ? 4.4 : 2.9, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  draw(vehicle: Vehicle, cleared: number): void {
    if (cleared === this.lastCleared && vehicle.x === this.lastX && vehicle.z === this.lastZ
      && vehicle.heading === this.lastHeading) return;
    if (cleared !== this.lastCleared) this.drawBackground(cleared);
    this.lastCleared = cleared;
    this.lastX = vehicle.x;
    this.lastZ = vehicle.z;
    this.lastHeading = vehicle.heading;

    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.background, 0, 0);
    const [x, y] = this.point(vehicle.x, vehicle.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(vehicle.heading);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fillStyle = '#67efff';
    ctx.fill();
    ctx.restore();
  }
}

export class RaceUI {
  readonly start = element('start-screen');
  readonly hud = element('hud');
  readonly controls = element<HTMLDialogElement>('controls-menu');
  readonly pause = element<HTMLDialogElement>('pause-menu');
  readonly finish = element<HTMLDialogElement>('finish-menu');
  readonly settings = element<HTMLDialogElement>('settings-menu');
  private readonly checkpoints = element('checkpoints');
  private readonly checkpointFeedback = element('checkpoint-feedback');
  private readonly time = element('time');
  private readonly best = element('best');
  private readonly speed = element('speed');
  private readonly speedFill = element('speed-fill');
  private readonly boostDisplay = element('boost-display');
  private readonly boostLabel = element('boost-label');
  private readonly boostMeter = element<HTMLMeterElement>('boost-meter');
  private readonly boostFill = element('boost-fill');
  private readonly drift = element('drift');
  private readonly wrongWay = element('wrong-way');
  private readonly map: CourseMap;

  constructor(track: Track) {
    this.map = new CourseMap(track);
    element('show-controls').addEventListener('click', () => this.controls.showModal());
    element('close-controls').addEventListener('click', () => this.controls.close());
  }

  bindSettings(initial: Settings, change: (settings: Settings) => void): void {
    const preset = element<HTMLSelectElement>('graphics-preset');
    const effects = element<HTMLInputElement>('visual-effects');
    const volume = element<HTMLInputElement>('sound-volume');
    const muted = element<HTMLInputElement>('sound-muted');
    const percent = element('sound-percent');
    preset.value = initial.preset;
    effects.checked = initial.effects;
    volume.value = String(Math.round(initial.volume * 100));
    muted.checked = initial.muted;
    setText(percent, `${volume.value}%`);

    const update = () => {
      setText(percent, `${volume.value}%`);
      change({
        preset: preset.value === 'low' ? 'low' : 'medium',
        effects: effects.checked,
        volume: volume.valueAsNumber / 100,
        muted: muted.checked
      });
    };
    for (const field of [preset, effects, muted]) field.addEventListener('change', update);
    volume.addEventListener('input', update);
    for (const id of ['show-settings', 'pause-settings']) {
      element(id).addEventListener('click', () => this.settings.showModal());
    }
    element('close-settings').addEventListener('click', () => this.settings.close());
  }

  showBest(best: number | null): void {
    element('title-best').hidden = best === null;
    setText(element('title-best-time'), best === null ? '—' : timecode(best));
  }

  showResults(time: number, best: number | null, newBest: boolean): void {
    setText(element('finish-time'), timecode(time));
    setText(element('finish-best'), best === null ? '—' : timecode(best));
    element('new-best').hidden = !newBest;
    this.showBest(best);
  }

  update(vehicle: Vehicle, trial: TimeTrial, best: number | null, elapsed: number): void {
    setText(this.checkpoints, `${trial.cleared}/${trial.track.checkpoints.length}`);
    setText(this.time, timecode(elapsed));
    setText(this.best, best === null ? '—' : timecode(best));
    setText(this.speed, Math.round(vehicle.speed * 3.6).toString().padStart(3, '0'));
    this.speedFill.style.transform = `scaleX(${Math.min(1, vehicle.speed / MAX_BOOST_SPEED).toFixed(3)})`;
    this.boostMeter.value = vehicle.boost;
    this.boostFill.style.transform = `scaleX(${vehicle.boost.toFixed(3)})`;
    this.boostDisplay.classList.toggle('ready', vehicle.boost >= MIN_BOOST_CHARGE);
    this.boostDisplay.classList.toggle('active', vehicle.boosting);
    this.boostDisplay.classList.toggle('charging', vehicle.charging);
    setText(this.boostLabel, vehicle.boosting ? 'Boost active' : `Boost ${Math.floor(vehicle.boost * 100)}%`);
    this.drift.hidden = !vehicle.drifting;
    this.drift.classList.toggle('charging', vehicle.charging);
    setText(this.drift, vehicle.charging ? 'Drift · charging boost' : 'Drifting');
    this.wrongWay.hidden = !vehicle.wrongWay;
    const feedback = trial.feedback;
    this.checkpointFeedback.hidden = !feedback || feedback.until < elapsed || vehicle.wrongWay || trial.finishTime !== null;
    setText(this.checkpointFeedback, this.checkpointFeedback.hidden ? '' : feedback?.text ?? '');
    this.map.draw(vehicle, trial.cleared);
  }
}

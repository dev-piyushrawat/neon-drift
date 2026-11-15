import type { Settings } from './settings';
import { MAX_BOOST_SPEED, type Vehicle } from './vehicle';

type Cue = 'button' | 'boost' | 'checkpoint' | 'finish';

const melodies: Record<Cue, readonly number[]> = {
  button: [480, 720],
  boost: [135, 220, 440, 660],
  checkpoint: [494, 740, 988],
  finish: [392, 494, 587, 784, 988]
};

export class RaceAudio {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private drive!: GainNode;
  private engine!: OscillatorNode;
  private harmonics!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private drift!: GainNode;
  private boost!: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private boosting = false;

  constructor(private settings: Settings) {}

  activate(): void {
    try {
      if (!this.context) {
        if (typeof AudioContext === 'undefined') return;
        this.initialize(new AudioContext());
      }
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      this.dispose();
    }
  }

  configure(settings: Settings): void {
    this.settings = settings;
    if (this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.035);
  }

  private get volume(): number {
    return this.settings.muted ? 0 : this.settings.volume * 0.68;
  }

  private initialize(context: AudioContext): void {
    this.context = context;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.ratio.value = 4;
    limiter.connect(context.destination);
    this.master = context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(limiter);

    this.drive = context.createGain();
    this.drive.gain.value = 0;
    this.drive.connect(this.master);
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 190;
    this.engineFilter.Q.value = 0.8;
    const engineLevel = context.createGain();
    engineLevel.gain.value = 0.28;
    this.engineFilter.connect(engineLevel).connect(this.drive);
    this.engine = this.oscillator('triangle', 46);
    this.engine.connect(this.engineFilter);
    this.harmonics = this.oscillator('sawtooth', 93);
    const harmonicLevel = context.createGain();
    harmonicLevel.gain.value = 0.28;
    this.harmonics.connect(harmonicLevel).connect(this.engineFilter);

    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = 0.63 * last + (Math.random() * 2 - 1) * 0.37;
      data[i] = last;
    }
    const wind = context.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    this.drift = this.noiseLayer(wind, 'bandpass', 780, 0.82);
    this.boost = this.noiseLayer(wind, 'highpass', 550, 0.65);
    wind.start();
    this.sources.push(wind);
  }

  private oscillator(type: OscillatorType, frequency: number): OscillatorNode {
    const oscillator = this.context!.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.start();
    this.sources.push(oscillator);
    return oscillator;
  }

  private noiseLayer(source: AudioBufferSourceNode, type: BiquadFilterType, frequency: number, resonance: number): GainNode {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.drive);
    return gain;
  }

  update(vehicle: Vehicle): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const travel = Math.min(1, vehicle.speed / MAX_BOOST_SPEED);
    const pitch = 45 + travel * 138 + (vehicle.throttle ? 12 : 0) + (vehicle.boosting ? 24 : 0);
    this.engine.frequency.setTargetAtTime(pitch, now, 0.08);
    this.harmonics.frequency.setTargetAtTime(pitch * 2.015, now, 0.1);
    this.engineFilter.frequency.setTargetAtTime(155 + travel * 380 + (vehicle.throttle ? 100 : 0), now, 0.09);
    this.drive.gain.setTargetAtTime(0.42 + travel * 0.43 + (vehicle.throttle ? 0.13 : 0), now, 0.05);
    this.drift.gain.setTargetAtTime(vehicle.drifting ? Math.min(0.13, 0.023 + Math.abs(vehicle.slip) * 0.008) : 0, now, 0.055);
    this.boost.gain.setTargetAtTime(vehicle.boosting ? 0.21 : 0, now, 0.065);
    if (vehicle.boosting && !this.boosting) this.play('boost');
    this.boosting = vehicle.boosting;
  }

  quiet(resetBoost = false): void {
    if (this.context) this.drive.gain.setTargetAtTime(0, this.context.currentTime, 0.038);
    if (resetBoost) this.boosting = false;
  }

  play(cue: Cue): void {
    const context = this.context;
    if (!context || this.settings.muted || this.settings.volume <= 0) return;
    const now = context.currentTime;
    const gap = cue === 'button' ? 0.025 : cue === 'finish' ? 0.115 : 0.057;
    const duration = cue === 'button' ? 0.07 : cue === 'finish' ? 0.46 : 0.22;
    melodies[cue].forEach((frequency, index) => {
      const start = now + index * gap;
      const tone = context.createOscillator();
      const level = context.createGain();
      tone.type = cue === 'boost' || index === 0 ? 'triangle' : 'sine';
      tone.frequency.setValueAtTime(frequency, start);
      if (cue === 'boost') tone.frequency.exponentialRampToValueAtTime(frequency * 1.56, start + duration);
      level.gain.setValueAtTime(0.0001, start);
      level.gain.exponentialRampToValueAtTime(cue === 'button' ? 0.076 : 0.15, start + 0.014);
      level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      tone.connect(level).connect(this.master);
      tone.start(start);
      tone.stop(start + duration);
      tone.onended = () => {
        tone.disconnect();
        level.disconnect();
      };
    });
  }

  dispose(): void {
    if (!this.context) return;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources = [];
    void this.context.close().catch(() => {});
    this.context = null;
  }
}

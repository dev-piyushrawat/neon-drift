import { RaceAudio } from './audio';
import { Controls } from './controls';
import { RaceRenderer } from './renderer';
import { loadSettings, saveSettings } from './settings';
import { GRID_POSITION, Track } from './track';
import { element, RaceUI } from './ui';
import { PersonalBest, TimeTrial } from './time-trial';
import { Vehicle } from './vehicle';

type State = 'title' | 'racing' | 'paused' | 'finished';

const STEP = 1 / 120;
const canvas = element<HTMLCanvasElement>('race-view');
canvas.tabIndex = -1;
const track = new Track();
const vehicle = new Vehicle(track);
const ui = new RaceUI(track);
const record = new PersonalBest();
let settings = loadSettings();
const audio = new RaceAudio(settings);
const play = element<HTMLButtonElement>('play');
const replay = element<HTMLButtonElement>('replay');
const resume = element<HTMLButtonElement>('resume');
const pauseRestart = element<HTMLButtonElement>('pause-restart');
const graphicsControls = [play, replay, resume, pauseRestart];
const graphicsNotices = document.querySelectorAll<HTMLElement>('[data-graphics-status]');
let trial: TimeTrial | null = null;
let state: State = 'title';
let resetCamera = true;
let contextLost = false;
let accumulator = 0;
let frameTime = performance.now();

ui.showBest(record.time);

function startRun(): void {
  if (contextLost) return;
  vehicle.restart();
  trial = new TimeTrial(track, vehicle.distance, performance.now());
  resetCamera = true;
  setState('racing');
  ui.update(vehicle, trial, record.time, 0);
}

function resetVehicle(): void {
  if (!trial || ui.settings.open || (state !== 'racing' && state !== 'paused')) return;
  vehicle.reset();
  controls.clear();
  resetCamera = true;
  ui.update(vehicle, trial, record.time, trial.elapsed(performance.now()));
  if (state === 'racing') canvas.focus();
}

function setState(next: State): void {
  if (next !== 'racing') audio.quiet(next !== 'paused');
  state = next;
  frameTime = performance.now();
  accumulator = 0;
  controls.clear();
  ui.start.hidden = next !== 'title';
  ui.hud.hidden = next === 'title';
  if (next !== 'paused' && ui.pause.open) ui.pause.close();
  if (next !== 'finished' && ui.finish.open) ui.finish.close();

  if (next === 'paused') {
    ui.pause.showModal();
    resume.focus();
  } else if (next === 'finished') {
    ui.finish.showModal();
    replay.focus();
  } else if (next === 'racing') canvas.focus();
  else play.focus();
}

function togglePause(): void {
  if (!trial || ui.settings.open) return;
  if (state === 'racing') {
    trial.pause(performance.now());
    ui.update(vehicle, trial, record.time, trial.elapsed(performance.now()));
    setState('paused');
  } else if (state === 'paused' && !contextLost) {
    trial.resume(performance.now());
    setState('racing');
  }
}

const controls = new Controls(
  () => state === 'racing' && !contextLost,
  togglePause,
  resetVehicle,
  () => {
    if (state !== 'title' && !ui.settings.open) startRun();
  },
  () => {
    controls.clear();
    if (state === 'racing') togglePause();
  }
);

function run(renderer: RaceRenderer): void {
  let animation = 0;
  ui.bindSettings(settings, next => {
    if (next.preset !== settings.preset || next.effects !== settings.effects) {
      renderer.configure(next);
    }
    settings = next;
    audio.configure(next);
    saveSettings(next);
  });
  document.addEventListener('click', event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    audio.activate();
    audio.play('button');
  }, true);
  window.addEventListener('keydown', event => {
    if (event.isTrusted && !event.repeat && state === 'racing') audio.activate();
  }, true);
  for (const button of [play, replay, pauseRestart]) button.addEventListener('click', startRun);
  for (const id of ['pause', 'resume']) element(id).addEventListener('click', togglePause);
  for (const id of ['reset', 'pause-reset']) element(id).addEventListener('click', resetVehicle);
  for (const id of ['exit-race', 'finish-exit']) {
    element(id).addEventListener('click', () => {
      trial = null;
      vehicle.reset(GRID_POSITION);
      resetCamera = true;
      setState('title');
    });
  }
  for (const dialog of [ui.pause, ui.finish]) {
    dialog.addEventListener('cancel', event => event.preventDefault());
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    for (const button of graphicsControls) button.disabled = true;
    for (const notice of graphicsNotices) {
      notice.textContent = 'Graphics connection lost. If it does not recover, reload the page.';
      notice.hidden = false;
    }
    if (state === 'racing') togglePause();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    for (const button of graphicsControls) button.disabled = false;
    for (const notice of graphicsNotices) notice.hidden = true;
    resetCamera = true;
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) {
      audio.quiet();
      return;
    }
    cancelAnimationFrame(animation);
    audio.dispose();
    renderer.dispose();
  });

  let elapsed = 0;
  let nextHudUpdate = 0;
  function frame(now: number): void {
    animation = requestAnimationFrame(frame);
    const dt = Math.min(Math.max(0, (now - frameTime) / 1000), 0.1);
    frameTime = now;
    if (document.hidden || contextLost) return;

    const running = state === 'racing';
    if (running && trial) {
      accumulator += dt;
      while (accumulator >= STEP) {
        vehicle.update(STEP, controls.read());
        accumulator -= STEP;
        const cleared = trial.cleared;
        trial.advance(vehicle.distance, now - accumulator * 1000);
        if (trial.cleared > cleared) audio.play('checkpoint');
        if (trial.finishTime !== null) {
          audio.play('finish');
          const isRecord = record.submit(trial.finishTime);
          ui.showResults(trial.finishTime, record.time, isRecord);
          ui.update(vehicle, trial, record.time, trial.finishTime);
          setState('finished');
          break;
        }
      }
      if (now >= nextHudUpdate) {
        ui.update(vehicle, trial, record.time, trial.elapsed(now));
        if (state === 'racing') audio.update(vehicle);
        nextHudUpdate = now + 32;
      }
    }
    if (state === 'title' || running || resetCamera || renderer.needsRedraw) {
      if (state === 'title' || running) elapsed += dt;
      renderer.draw(vehicle, state === 'title' || running ? dt : 0, elapsed, state === 'title', resetCamera);
      resetCamera = false;
    }
  }
  animation = requestAnimationFrame(frame);
}

export function initialize(): void {
  const renderer = new RaceRenderer(canvas, track, settings);
  try {
    renderer.draw(vehicle, 0, 0, true, true);
    resetCamera = false;
    run(renderer);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

export interface DrivingInput {
  throttle: boolean;
  brake: boolean;
  steer: number;
  drift: boolean;
  boost: boolean;
}

const drivingKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'ShiftLeft'
]);

export class Controls {
  private readonly pressed = new Set<string>();
  private boostRequested = false;

  constructor(isDriving: () => boolean, onPause: () => void, onReset: () => void, onRestart: () => void, onBlur: () => void) {
    window.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (drivingKeys.has(event.code)) {
        if (!isDriving()) return;
        event.preventDefault();
        if (event.code === 'Space') {
          if (!event.repeat) this.boostRequested = true;
        } else {
          this.pressed.add(event.code);
        }
      }
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') onPause();
      if (event.code === 'KeyR') onReset();
      if (event.code === 'KeyT') onRestart();
    });
    window.addEventListener('keyup', event => this.pressed.delete(event.code));
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onBlur();
    });
  }

  read(): DrivingInput {
    const left = this.pressed.has('KeyA') || this.pressed.has('ArrowLeft');
    const right = this.pressed.has('KeyD') || this.pressed.has('ArrowRight');
    const boost = this.boostRequested;
    this.boostRequested = false;
    return {
      throttle: this.pressed.has('KeyW') || this.pressed.has('ArrowUp'),
      brake: this.pressed.has('KeyS') || this.pressed.has('ArrowDown'),
      steer: Number(right) - Number(left),
      drift: this.pressed.has('ShiftLeft'),
      boost
    };
  }

  clear(): void {
    this.pressed.clear();
    this.boostRequested = false;
  }
}

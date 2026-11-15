const progress = document.getElementById('startup-status')!;
const errorNotice = document.getElementById('graphics-error')!;
const touchNotice = document.getElementById('touch-notice')!;

const touch = matchMedia('(any-pointer: coarse)');
const finePointer = matchMedia('(any-pointer: fine)');
function showInputNotice(): void {
  touchNotice.hidden = !touch.matches || finePointer.matches;
}
showInputNotice();
touch.addEventListener('change', showInputNotice);
finePointer.addEventListener('change', showInputNotice);

async function start(): Promise<void> {
  try {
    if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) {
      throw new Error('This browser does not support modal dialogs.');
    }
    const { initialize } = await import('./main');
    progress.textContent = 'Preparing the circuit…';
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    initialize();
    for (const id of ['play', 'show-controls', 'show-settings']) {
      (document.getElementById(id) as HTMLButtonElement).disabled = false;
    }
  } catch (error) {
    console.error('Unable to start NEON DRIFT.', error);
    errorNotice.hidden = false;
  } finally {
    progress.hidden = true;
  }
}

void start();

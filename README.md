# NEON DRIFT

NEON DRIFT is a single-player hover racing time trial on the Afterdark Circuit. Drift to earn boost, clear all six checkpoints, and beat your best lap.
 https://dev-piyushrawat.github.io/neon-drift/
## Features

- Procedural neon city, hovercraft, and chase camera
- Arcade driving, drift-to-boost handling, and six ordered checkpoints
- Timed laps, instant Retry, and a personal best stored in the browser
- Low and Medium graphics presets, optional visual effects, and synthesized audio with volume and mute

Built with TypeScript, Three.js, Vite, and the Web Audio API. The production build is a static website.

## Start on Windows

Install Node.js 22.12 or newer on a supported release line. Open PowerShell in the project folder. For the original Windows workspace, use:

```powershell
Set-Location -LiteralPath 'D:\SELF MADE APPS\NEON DRIFT'
npm.cmd ci
npm.cmd run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) or the alternate address Vite prints, then select **Play**. Keep the terminal open. Press **Ctrl+C** in that terminal to stop the server.

If the address refuses to connect, run `npm.cmd run dev` again and open the URL printed by Vite. On other operating systems, use `npm` in place of `npm.cmd`.

## Controls

| Action | Keys |
| --- | --- |
| Accelerate | W or ↑ |
| Brake, then reverse | S or ↓ |
| Steer | A / D or ← / → |
| Drift | Hold Left Shift while steering at speed |
| Boost | Press Space when the meter is charged |
| Reset to the center of the track | R or the HUD's Reset button |
| Restart from the grid | T, the pause menu, or Retry at the finish |
| Pause or resume | Esc or P |

The clock starts when you select **Play** or restart. Follow the painted arrows through all six numbered gates and cross the checkered finish line. The minimap highlights your next checkpoint in amber. The results panel freezes your time and shows whether you set a new personal best.

Brake before a corner, then hold **Left Shift** and steer into the bend. Clean forward drifts charge boost and turn the hovercraft glow purple. At **12%** charge, press **Space** to start a burst that spends the available energy. Braking cancels the burst. **R** recenters the craft while preserving your timer, progress, and charge. **T** resets the run and leaves your personal best intact.

## Graphics and sound

Open **Settings** from the title screen or the pause menu. **Medium** shows extra skyline detail and checkpoint light pools. **Low** lowers the render resolution and reduces scenery detail and particle counts. Both presets adapt resolution under sustained load. Turning **Visual effects** off hides the drifting trails, floating particles, boost streaks, and camera roll.

The game synthesizes its engine and sound effects in the browser. Audio unlocks after your first menu click or keyboard activation. Volume, mute, graphics preset, and effects preferences are saved locally when browser storage is available.

## Production build

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Build output is in `dist`. Open [http://127.0.0.1:4173](http://127.0.0.1:4173) to play the preview.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run check` | Type-check the project |
| `npm test` | Run control, vehicle, checkpoint, timer, and record regression tests |
| `npm run build` | Type-check and produce static files in `dist` |
| `npm run preview` | Serve the built site locally |

## Deploy to GitHub Pages

Vite's relative base (`./`) lets the same build run at a site root or under any repository subpath. The included workflow publishes only when you run it manually. [Vite production build guide](https://vite.dev/guide/build.html#relative-base)

1. Choose a GitHub repository that supports Pages. Add the project source and lockfile to its default branch, including `.github/workflows/pages.yml`. Leave `dist` and `node_modules` out of version control.
2. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, select **GitHub Actions**. [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. Open **Actions → Deploy NEON DRIFT to GitHub Pages → Run workflow**, select the default branch, and confirm. The workflow installs the locked dependencies, runs tests and the build, and uploads `dist` to the `github-pages` environment. Approve any review requested by that environment. [GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. Open the site URL from the successful **Deploy to Pages** job or **Settings → Pages**.

## Known limitations

- A physical keyboard is required. Touch-only browsers show a keyboard requirement notice.
- Use a current desktop browser with WebGL 2. The game is tested on Windows Chrome and Edge. Enable hardware acceleration for the best performance.
- Personal bests and settings are local to the browser profile and site origin. When storage is blocked, they are kept until reload. Localhost records and settings do not transfer to GitHub Pages.
- Frame rate depends on GPU, drivers, and viewport size. Select **Low** or switch off **Visual effects** if the game stutters.

Track sampling and checkpoint placement are in `src/track.ts`. Vehicle dynamics and boost are in `src/vehicle.ts`, and checkpoint validation, race timing, and personal bests are in `src/time-trial.ts`. The camera and procedural scene live in `src/renderer.ts`, `src/world.ts`, and `src/ship.ts`.

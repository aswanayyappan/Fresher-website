# Project Tracker

## Completed Tasks

- [x] Initial Next.js 14 setup and configuration.
- [x] Setup Tailwind CSS and clear default styling for full-screen dark mode (`#050505`).
- [x] Pre-process all image frames across `inst-1`, `inst-2`, `insta-3`, `insta-4` (rotated 90° left).
- [x] Remove the first 36 frames of `inst-1`.
- [x] Remove frames beyond 70 in `insta-4`.
- [x] Replace `ezgif-frame-049.jpg` in `inst-2` with `insta2.png`.
- [x] Replace frames 50-109 in `inst-2` with `inst1.png` duplicates.
- [x] Replace frame 110 in `inst-2` with `insta2.png`.
- [x] Remove 30 alternating frames between 50 and 109 in `inst-2` to speed up that sub-sequence.
- [x] Remove another 15 frames between 50 and 110 in `inst-2`.
- [x] Reverted intro text to keep the UI clean as requested.
- [x] Added `man` folder frames to the absolute beginning of the animation sequence.
- [x] Build sticky HTML5 Canvas in `page.js` linked to `framer-motion` scroll progress.
- [x] Documented user manual frame deletions/removals across sequences.
- [x] Added a beautiful "Wishing you the best" outro section signed by "Second Year EEE".
- [x] **Full UI/UX overhaul (v2)** — details below.

### v2 Overhaul Changes

- **Loading screen**: Added a real loading screen with progress % that preloads the first 40 critical frames before showing the page. Prevents blank/broken canvas on first load.
- **Black screen fix**: Canvas now uses `alpha: false` context (faster compositing), fills `#050505` before every draw (no flash), deduplicates frames to avoid wasted draws, and only evicts cache when it grows too large.
- **Mobile fixes**: DPR capped at 2 (prevents memory crash on 3x phones), orientation change listener, `overscroll-behavior: none` (prevents iOS bounce-flash), `user-scalable=no` viewport, hidden scrollbar, tap-highlight disabled.
- **Smoother scrolling**: requestAnimationFrame is now deduplicated (cancels stale frames), frame index uses `frameCount - 1` for correct mapping.
- **Hero section redesign**: Added grid texture overlay, staggered fade-in-up animations, `gradient-text` CSS class, ambient glow with blue-cyan gradient, smaller department subtitle.
- **Outro section redesign**: Added `whileInView` reveal animation, decorative vertical lines, grid overlay matching hero, responsive text sizing with clamp().
- **Typography**: Inter font loaded from Google Fonts for premium feel.
- **SEO**: Title and description updated for the EEE department.

## Current Working Items

- [ ] _Waiting for next user instruction..._

## Recently Added Features

- [x] **Background Music** — `raga_of_revenge_from_dc.mp3` plays on loop with a glassmorphic toggle button (bottom-left). Starts muted; tap to play. Shows speaker icon with X when muted, sound waves when playing.
- [x] **Scroll Progress Bar** — A thin blue-cyan gradient line at the very top of the viewport that fills as you scroll through the entire page.
- [x] **Floating Particles** — 6 small blue dots that gently float upward on the hero section, adding subtle depth and life.

## Future Ideas / Roadmap

- [x] Add interactive UI/typography overlapping the scroll sequence (REMOVED: Kept canvas frames clean without text).
- [x] Add navigation and footer components.
- [x] Add confetti or spark effect on the outro wishing section (REMOVED: Kept wishing section simple and typographic).

## Design Constraints / Rules
- **Do not overlay text** on top of the scrolling canvas image sequence. The canvas frames must remain completely pure and unobstructed.


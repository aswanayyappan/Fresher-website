# EEE Department Freshers '26 Welcome Page

An ultra-clean, high-performance, and cinematic scroll-based interactive landing page built to welcome the Freshers '26 to the Department of Electrical & Electronics Engineering.

Developed with **Next.js**, **Framer Motion**, and **HTML5 Canvas**.

---

## ⚡ Key Highlights & Features

- **Double-Buffered Canvas Rendering Engine (v2):** Eliminates all black screens, flickers, and visual frame tearing by dynamically drawing loaded neighbor frames or last-drawn canvas states during high-speed scrolls.
- **Background Audio with Ambient Autoplay:** Loops a premium sound track (`raga_of_revenge_from_dc.mp3`) with an ambient fade-in when the scroll canvas starts. Includes a sleek, glassmorphic mute/unmute toggle.
- **Scroll Progress Visualizer:** A clean blue-to-cyan gradient progress bar pinned to the top of the viewport indicating overall scroll progress.
- **Background Idle Preloader:** Progressively preloads all 1,100+ frames using browser idle cycles (`requestIdleCallback`), ensuring a buttery-smooth frame sequence when scrolling.
- **Fully Responsive Layout:**
  - Centered typographic welcome sections specifically optimized for mobile devices.
  - Brutalist bottom-aligned layout on desktop viewports.
- **Zero CLS & Visual Polish:** Custom Inter typeface, ambient radial glows, and floating background particles.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed (version 18+ recommended).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/aswanayyappan/Fresher-website.git
   cd Fresher-website
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to experience the landing page.

---

## 🏗️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS (Vanilla CSS fallbacks in global styles)
- **Animation:** Framer Motion
- **Rendering:** HTML5 Canvas Context (2D, double-buffered, CPU-offloaded image decoding)

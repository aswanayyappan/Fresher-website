"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useScroll, motion, useTransform, AnimatePresence } from "framer-motion";
export default function Home() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const [paths, setPaths] = useState([]);
  const [frameCount, setFrameCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [globalProgress, setGlobalProgress] = useState(0);
  const lastRenderedFrame = useRef(-1);
  const rafId = useRef(null);
  const lastGoodImageData = useRef(null); // stores last successfully drawn ImageData as fallback

  // Image cache
  const imageCache = useRef(new Map());
  // Track which frames are currently being fetched to avoid duplicate requests
  const loadingSet = useRef(new Set());
  // Eviction counter — only evict every N renders to reduce GC stutter
  const evictCounter = useRef(0);

  // Scroll tracking for the canvas section
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Helper: load a single image with decode() for non-blocking decoding
  const loadImage = useCallback((index, src) => {
    if (imageCache.current.has(index) || loadingSet.current.has(index)) return;
    loadingSet.current.add(index);

    const img = new window.Image();
    img.src = src;

    const onReady = () => {
      imageCache.current.set(index, img);
      loadingSet.current.delete(index);
    };

    // Use decode() API if available (prevents jank on main thread)
    if (img.decode) {
      img.decode().then(onReady).catch(onReady);
    } else {
      img.onload = onReady;
      img.onerror = () => loadingSet.current.delete(index);
    }
  }, []);

  // --- IMAGE LOADING ---
  useEffect(() => {
    let cancelled = false;

    fetch("/image_sequence.json")
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        setPaths(data);
        setFrameCount(data.length);

        // Preload the first 60 critical frames before showing canvas
        const CRITICAL = Math.min(60, data.length);
        let loaded = 0;

        const promises = [];
        for (let i = 0; i < CRITICAL; i++) {
          promises.push(
            new Promise((resolve) => {
              const img = new window.Image();
              img.onload = () => {
                if (!cancelled) {
                  imageCache.current.set(i, img);
                  loaded++;
                  setLoadProgress(Math.round((loaded / CRITICAL) * 100));
                }
                resolve();
              };
              img.onerror = resolve;
              img.src = data[i];
            })
          );
        }
        await Promise.all(promises);

        if (!cancelled) {
          // Kick off next batch in background
          for (let i = CRITICAL; i < Math.min(CRITICAL + 80, data.length); i++) {
            const img = new window.Image();
            img.src = data[i];
            imageCache.current.set(i, img);
          }
          setIsLoading(false);
        }
      })
      .catch((err) => console.error("Error loading image sequence:", err));

    return () => { cancelled = true; };
  }, []);

  // --- DRAW FUNCTION ---
  const drawToCanvas = useCallback((ctx, canvas, imageToDraw) => {
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = imageToDraw.naturalWidth;
    const ih = imageToDraw.naturalHeight;

    if (!iw || !ih) return false;

    // Cover-fit scaling
    const scale = Math.max(cw / iw, ch / ih);
    const dx = (cw - iw * scale) / 2;
    const dy = (ch - ih * scale) / 2;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(imageToDraw, 0, 0, iw, ih, dx, dy, iw * scale, ih * scale);
    return true;
  }, []);

  // --- RENDER FRAME ---
  const renderFrame = useCallback(
    (index) => {
      if (paths.length === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      // Skip if same frame
      if (lastRenderedFrame.current === index) return;

      // --- Preload: 100 ahead, 20 behind ---
      const AHEAD = 100;
      const BEHIND = 20;

      for (let i = Math.max(0, index - BEHIND); i < Math.min(frameCount, index + AHEAD); i++) {
        if (!imageCache.current.has(i) && paths[i]) {
          loadImage(i, paths[i]);
        }
      }

      // Throttled eviction — only every 120 renders, keep 400 frames to prevent GC stutter and dropped frames
      evictCounter.current++;
      if (evictCounter.current >= 120) {
        evictCounter.current = 0;
        const KEEP = 400;
        if (imageCache.current.size > KEEP * 1.5) {
          const toDelete = [];
          for (const key of imageCache.current.keys()) {
            if (key < index - KEEP || key > index + KEEP) {
              toDelete.push(key);
            }
          }
          toDelete.forEach(k => imageCache.current.delete(k));
        }
      }

      // Try to get the exact frame
      const img = imageCache.current.get(index);

      if (img && img.complete && img.naturalWidth > 0) {
        drawToCanvas(ctx, canvas, img);
        lastRenderedFrame.current = index;
      } else {
        // Frame not ready — find nearest loaded neighbor (search ±5 instead of 10 for performance)
        let drawn = false;
        for (let offset = 1; offset <= 5; offset++) {
          for (const n of [index - offset, index + offset]) {
            if (n < 0 || n >= frameCount) continue;
            const nImg = imageCache.current.get(n);
            if (nImg && nImg.complete && nImg.naturalWidth > 0) {
              drawToCanvas(ctx, canvas, nImg);
              drawn = true;
              break;
            }
          }
          if (drawn) break;
        }

        // Schedule a redraw when the target frame loads
        // IMPORTANT: Only draw if the user is STILL on this exact frame to prevent out-of-order stutter!
        if (img) {
          const onReady = () => {
            const p = scrollYProgress.get();
            const curr = Math.min(frameCount - 1, Math.max(0, Math.floor(p * (frameCount - 1))));
            if (curr === index && drawToCanvas(ctx, canvas, img)) {
              lastRenderedFrame.current = index;
            }
          };
          if (img.decode) {
            img.decode().then(onReady).catch(() => {});
          } else {
            img.onload = onReady;
          }
        } else {
          // Image wasn't even in cache — create it now
          const newImg = new window.Image();
          newImg.src = paths[index];
          imageCache.current.set(index, newImg);
          newImg.onload = () => {
            const p = scrollYProgress.get();
            const curr = Math.min(frameCount - 1, Math.max(0, Math.floor(p * (frameCount - 1))));
            if (curr === index && drawToCanvas(ctx, canvas, newImg)) {
              lastRenderedFrame.current = index;
            }
          };
        }
      }
    },
    [paths, frameCount, scrollYProgress, loadImage, drawToCanvas]
  );

  // --- SCROLL → FRAME BINDING ---
  useEffect(() => {
    if (frameCount === 0 || isLoading) return;

    const unsubscribe = scrollYProgress.on("change", (latest) => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const idx = Math.min(frameCount - 1, Math.max(0, Math.floor(latest * (frameCount - 1))));
        renderFrame(idx);
      });
    });

    // Render first frame immediately
    renderFrame(0);

    return () => {
      unsubscribe();
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [frameCount, isLoading, scrollYProgress, renderFrame]);

  // --- BACKGROUND IDLE PRELOADER ---
  // Progressively loads ALL frames in the background when browser is idle
  useEffect(() => {
    if (frameCount === 0 || isLoading || paths.length === 0) return;

    let cancelled = false;
    let batchIndex = 0;
    const BATCH_SIZE = 15;

    const preloadBatch = () => {
      if (cancelled) return;
      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, frameCount);

      for (let i = start; i < end; i++) {
        if (!imageCache.current.has(i) && paths[i]) {
          loadImage(i, paths[i]);
        }
      }

      batchIndex++;
      if (batchIndex * BATCH_SIZE < frameCount) {
        // Use requestIdleCallback if available, otherwise setTimeout
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => preloadBatch(), { timeout: 2000 });
        } else {
          setTimeout(preloadBatch, 200);
        }
      }
    };

    // Start idle preloading after a short delay
    const timer = setTimeout(preloadBatch, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [frameCount, isLoading, paths, loadImage]);

  // --- CANVAS RESIZE (handles DPR + mobile orientation change) ---
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Cap DPR at 2 to save memory on 3x phones
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // Re-render current frame at new size
      lastRenderedFrame.current = -1; // force redraw
      if (frameCount > 0 && !isLoading) {
        const p = scrollYProgress.get();
        const idx = Math.min(frameCount - 1, Math.max(0, Math.floor(p * (frameCount - 1))));
        renderFrame(idx);
      }
    };

    window.addEventListener("resize", resizeCanvas);
    // Also listen for orientation change on mobile
    window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 150));
    resizeCanvas();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [scrollYProgress, frameCount, isLoading, renderFrame]);

  // Scroll-aware opacity for hero section fade-out
  const heroOpacity = useTransform(scrollYProgress, [0, 0.02], [1, 0]);

  // Track global scroll for progress bar
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setGlobalProgress(docHeight > 0 ? scrollTop / docHeight : 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-play music when the scroll canvas section begins (man folder starts)
  const hasAutoPlayed = useRef(false);
  useEffect(() => {
    if (frameCount === 0 || isLoading) return;

    const unsubAutoPlay = scrollYProgress.on("change", (v) => {
      if (v > 0.001 && !hasAutoPlayed.current && isMuted) {
        hasAutoPlayed.current = true;
        const audio = audioRef.current;
        if (audio) {
          audio.volume = 0;
          audio.play().then(() => {
            // Fade in smoothly over 1 second
            let vol = 0;
            const fadeIn = setInterval(() => {
              vol = Math.min(vol + 0.02, 0.4);
              audio.volume = vol;
              if (vol >= 0.4) clearInterval(fadeIn);
            }, 50);
            setIsMuted(false);
          }).catch(() => {});
        }
      }
    });

    return () => unsubAutoPlay();
  }, [frameCount, isLoading, scrollYProgress, isMuted]);

  // Manual audio toggle
  const toggleAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.play().catch(() => {});
      audio.volume = 0.4;
      setIsMuted(false);
    } else {
      audio.pause();
      setIsMuted(true);
    }
  }, [isMuted]);



  return (
    <main className="bg-[#050505] no-select min-h-screen">

      {/* ═══════════ GLOBAL NAVIGATION ═══════════ */}
      <div className="fixed top-0 left-0 z-50 w-full px-6 py-6 md:px-12 md:py-8 flex justify-between items-start pointer-events-auto mix-blend-difference">
        <div className="flex flex-col">
          <div className="text-white font-extrabold tracking-tight text-lg md:text-2xl uppercase">
            EEE DEPT<span className="text-blue-400">.</span>
          </div>
          <div className="text-white/60 text-[9px] md:text-[10px] font-mono tracking-[0.25em] uppercase mt-1">
            Freshers &apos;26
          </div>
        </div>
        <div className="text-white/90 text-xs md:text-sm font-medium tracking-[0.15em] uppercase cursor-pointer hover:text-blue-400 transition-colors duration-300">
          Menu
        </div>
      </div>

      {/* ═══════════ AUDIO ═══════════ */}
      <audio ref={audioRef} src="/raga_of_revenge_from_dc.mp3" loop preload="auto" />

      {/* ═══════════ SCROLL PROGRESS BAR ═══════════ */}
      <div className="fixed top-0 left-0 w-full h-[2px] z-[90] bg-transparent">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500"
          style={{ width: `${globalProgress * 100}%`, transition: "width 0.1s linear" }}
        />
      </div>

      {/* ═══════════ MUSIC TOGGLE ═══════════ */}
      <button
        onClick={toggleAudio}
        className="fixed bottom-6 left-6 z-[80] w-11 h-11 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all duration-300 group"
        aria-label={isMuted ? "Play music" : "Pause music"}
      >
        {isMuted ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:stroke-blue-400 transition-colors">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      {/* ═══════════ LOADING SCREEN ═══════════ */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="loader"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-[100] bg-[#020202] flex flex-col items-center justify-center gap-8"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-blue-500/30 pulse-ring" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-mono text-sm font-bold">{loadProgress}%</span>
              </div>
            </div>
            <div className="w-48 h-[2px] bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                style={{ width: `${loadProgress}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
            <p className="text-white/40 font-mono text-[10px] tracking-[0.3em] uppercase">
              Loading Experience
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ SECTION 1 — HERO ═══════════ */}
      <section className="relative w-full h-screen flex flex-col justify-between overflow-hidden bg-[#020202]">

        {/* Ambient glow */}
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.18, 0.08] }}
            transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
            className="w-[90vw] h-[90vw] md:w-[45vw] md:h-[45vw] rounded-full blur-3xl"
            style={{
              background: "radial-gradient(circle, rgba(59,130,246,0.2) 0%, rgba(34,211,238,0.08) 40%, transparent 70%)",
            }}
          />
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-blue-400/30"
              style={{
                left: `${15 + i * 14}%`,
                top: `${20 + (i % 3) * 25}%`,
              }}
              animate={{
                y: [0, -40, 0],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: 4 + i * 0.7,
                delay: i * 0.5,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        {/* Grid overlay for texture */}
        <div
          className="absolute inset-0 z-[1] opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />


        {/* Hero content */}
        <div className="relative z-10 w-full px-6 md:px-12 flex-1 flex flex-col justify-center md:justify-end pb-10 md:pb-28 pointer-events-none">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-12 w-full text-center md:text-left items-center md:items-end">
            {/* Title */}
            <div className="fade-in-up flex flex-col items-center md:items-start w-full md:w-auto">
              <p className="text-blue-400/80 text-xs md:text-sm font-mono tracking-[0.3em] uppercase mb-4 fade-in-up fade-in-up-delay-1 text-center md:text-left">
                Department of Electrical &amp; Electronics
              </p>
              <h1
                className="text-white font-black tracking-tighter text-center md:text-left"
                style={{
                  fontSize: "clamp(3rem, 11vw, 12rem)",
                  lineHeight: "0.88",
                }}
              >
                <span className="fade-in-up fade-in-up-delay-2 inline-block">WELCOME</span>
                <br />
                <span className="gradient-text fade-in-up fade-in-up-delay-3 inline-block">TO EEE</span>
              </h1>
            </div>

            {/* Side description */}
            <div className="max-w-xs md:max-w-sm mb-2 md:mb-6 fade-in-up fade-in-up-delay-4 flex flex-col items-center md:items-start">
              <p className="text-white/50 text-sm md:text-base font-light leading-relaxed text-center md:text-left">
                Where circuits meet creativity and ideas spark into reality. Your journey of innovation begins now.
              </p>
              <div className="mt-5 flex items-center gap-3 justify-center md:justify-start">
                <div className="w-10 h-px bg-white/20" />
                <span className="text-white/30 text-[9px] tracking-[0.2em] uppercase font-mono">
                  Scroll to explore
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right-edge scroll indicator */}
        <div className="absolute bottom-10 right-6 md:right-12 z-20 flex flex-col items-center">
          <motion.span
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            className="text-white/50 text-[9px] md:text-[10px] font-bold tracking-[0.3em] uppercase mb-5"
            style={{ writingMode: "vertical-rl" }}
          >
            Scroll
          </motion.span>
          <motion.div
            animate={{ scaleY: [0, 1, 0], y: [0, 0, 30] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="w-px bg-blue-400/60 origin-top"
            style={{ height: 50 }}
          />
        </div>
      </section>

      {/* ═══════════ SECTION 2 — SCROLL CANVAS ═══════════ */}
      <section
        ref={containerRef}
        className="relative w-full bg-[#050505]"
        style={{ height: "2000vh" }}
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full block animate-fade-in" />
        </div>
      </section>

      {/* ═══════════ SECTION 3 — WISHING / OUTRO ═══════════ */}
      <section className="relative w-full min-h-screen flex flex-col items-center justify-between overflow-hidden bg-[#020202] pt-20 pb-8">
        
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {/* Ambient glow */}
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.06, 0.2, 0.06] }}
              transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
              className="w-[80vw] h-[80vw] md:w-[35vw] md:h-[35vw] rounded-full blur-3xl"
              style={{
                background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(34,211,238,0.06) 50%, transparent 70%)",
              }}
            />
          </div>

          {/* Grid overlay */}
          <div
            className="absolute inset-0 z-[1] opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            viewport={{ once: true, amount: 0.3 }}
            className="relative z-10 text-center px-6 md:px-12 flex flex-col items-center"
          >
            {/* Decorative line */}
            <div className="w-px h-20 bg-gradient-to-b from-transparent via-blue-400/60 to-transparent mb-10" />

            <h2
              className="text-white font-black tracking-tighter mb-5"
              style={{ fontSize: "clamp(2.5rem, 8vw, 7rem)", lineHeight: "0.9" }}
            >
              WISHING YOU
              <br />
              <span className="gradient-text">THE BEST</span>
            </h2>

            <p className="text-white/50 text-sm md:text-lg font-light tracking-wide max-w-lg mb-14 leading-relaxed">
              Welcome to the EEE family. Here&apos;s to a brilliant journey filled with innovation, learning, and unforgettable memories.
            </p>

            <div className="flex flex-col items-center gap-3">
              <div className="w-px h-12 bg-gradient-to-b from-blue-400/50 to-transparent" />
              <p className="text-white/30 font-mono text-[10px] md:text-xs tracking-[0.3em] uppercase">
                With warm regards,
              </p>
              <p className="text-white/80 font-bold tracking-[0.2em] text-base md:text-lg mt-1 uppercase">
                Second Year EEE
              </p>
            </div>
          </motion.div>
        </div>

        {/* ═══════════ FOOTER ═══════════ */}
        <div className="relative z-10 w-full px-6 flex justify-between items-center mt-20 border-t border-white/5 pt-6 text-white/30 text-[10px] font-mono tracking-widest uppercase">
          <p>© 2026 EEE Dept</p>
          <div className="flex gap-4">
            <span className="hover:text-blue-400 cursor-pointer transition-colors">Instagram</span>
            <span className="hover:text-blue-400 cursor-pointer transition-colors">GitHub</span>
          </div>
        </div>
      </section>

    </main>
  );
}

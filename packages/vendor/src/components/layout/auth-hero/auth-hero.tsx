import { useEffect, useRef } from "react";

import i18n from "i18next";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { TOTAL_STEPS, WIZARD_STEPS } from "../../onboarding-wizard/constants";

// DFACTORIES (isolated): animated "glowy waves" marketing aside that replaces
// the static onboarding illustration on every auth/onboarding screen. Kept in
// its own file so upstream merges only ever touch the tiny call sites in
// auth-layout / wizard-preview / invite (each tagged `// DFACTORIES`).
//
// Theme-aware: dark canvas + white/grey waves in dark mode, light canvas +
// dark/grey waves in light mode (brand "white canvas, black actions"). The wave
// geometry is the source "Glowy Waves Hero" (amplitudes/frequencies/offsets
// verbatim). Centered copy sits on a radial scrim so it stays readable where a
// wave passes behind it. Copy is i18n-driven (en + fa).

export type HeroVariant =
  | "login"
  | "register"
  | "reset"
  | "invite"
  | "onboarding"
  | "store-select";

type WaveConfig = {
  offset: number;
  amplitude: number;
  frequency: number;
  color: string;
  opacity: number;
};

type Palette = { bgTop: string; bgBottom: string; waves: WaveConfig[] };

const DARK: Palette = {
  bgTop: "#0a0a0a",
  bgBottom: "#101012",
  waves: [
    { offset: 0, amplitude: 70, frequency: 0.003, color: "rgba(250,250,250,0.9)", opacity: 0.45 },
    { offset: Math.PI / 2, amplitude: 90, frequency: 0.0026, color: "rgba(228,228,231,0.85)", opacity: 0.35 },
    { offset: Math.PI, amplitude: 60, frequency: 0.0034, color: "rgba(244,244,245,0.8)", opacity: 0.3 },
    { offset: Math.PI * 1.5, amplitude: 80, frequency: 0.0022, color: "rgba(161,161,170,0.7)", opacity: 0.25 },
    { offset: Math.PI * 2, amplitude: 55, frequency: 0.004, color: "rgba(250,250,250,0.7)", opacity: 0.2 },
  ],
};

const LIGHT: Palette = {
  bgTop: "#ffffff",
  bgBottom: "#f4f4f5",
  waves: [
    { offset: 0, amplitude: 70, frequency: 0.003, color: "rgba(24,24,27,0.8)", opacity: 0.32 },
    { offset: Math.PI / 2, amplitude: 90, frequency: 0.0026, color: "rgba(39,39,42,0.75)", opacity: 0.26 },
    { offset: Math.PI, amplitude: 60, frequency: 0.0034, color: "rgba(24,24,27,0.7)", opacity: 0.22 },
    { offset: Math.PI * 1.5, amplitude: 80, frequency: 0.0022, color: "rgba(82,82,91,0.7)", opacity: 0.18 },
    { offset: Math.PI * 2, amplitude: 55, frequency: 0.004, color: "rgba(24,24,27,0.65)", opacity: 0.14 },
  ],
};

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, staggerChildren: 0.12 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const detectVariant = (pathname: string): HeroVariant => {
  const p = pathname.toLowerCase();
  if (p.includes("/onboarding")) return "onboarding";
  if (p.includes("/register")) return "register";
  if (p.includes("/reset-password")) return "reset";
  if (p.includes("/invite")) return "invite";
  if (p.includes("/store-select")) return "store-select";
  return "login";
};

const localizeNumber = (value: number) =>
  i18n.language?.startsWith("fa")
    ? String(value).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
    : String(value);

const SparkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2l1.8 5.5L19.5 9l-5.7 1.5L12 16l-1.8-5.5L4.5 9l5.7-1.5L12 2z"
      fill="currentColor"
    />
  </svg>
);

type AuthHeroProps = {
  /** Overrides route detection (used by the onboarding wizard). */
  variant?: HeroVariant;
  /** 0-based active step (onboarding only). */
  currentStep?: number;
};

export const AuthHero = ({ variant, currentStep = 0 }: AuthHeroProps) => {
  const location = useLocation();
  const { t } = useTranslation();
  const resolved = variant ?? detectVariant(location.pathname);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let time = 0;
    let width = 0;
    let height = 0;

    // Track the active theme (Medusa toggles `.dark` on <html>) and switch the
    // wave palette live so the aside matches light/dark mode.
    const isDark = () => document.documentElement.classList.contains("dark");
    let palette: Palette = isDark() ? DARK : LIGHT;
    const themeObserver = new MutationObserver(() => {
      palette = isDark() ? DARK : LIGHT;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const mouseInfluence = prefersReducedMotion ? 10 : 70;
    const influenceRadius = prefersReducedMotion ? 160 : 320;
    const smoothing = prefersReducedMotion ? 0.04 : 0.1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const recenter = () => {
      mouseRef.current = { x: width / 2, y: height / 2 };
      targetMouseRef.current = { x: width / 2, y: height / 2 };
    };
    const handleMouseMove = (event: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      targetMouseRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    resize();
    recenter();
    const resizeObserver = new ResizeObserver(() => {
      resize();
      recenter();
    });
    resizeObserver.observe(parent);
    window.addEventListener("mousemove", handleMouseMove);

    const drawWave = (wave: WaveConfig) => {
      ctx.save();
      ctx.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const dx = x - mouseRef.current.x;
        const dy = height / 2 - mouseRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - distance / influenceRadius);
        const mouseEffect =
          influence *
          mouseInfluence *
          Math.sin(time * 0.001 + x * 0.01 + wave.offset);
        const y =
          height / 2 +
          Math.sin(x * wave.frequency + time * 0.002 + wave.offset) *
            wave.amplitude +
          Math.sin(x * wave.frequency * 0.4 + time * 0.003) *
            (wave.amplitude * 0.45) +
          mouseEffect;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = wave.color;
      ctx.globalAlpha = wave.opacity;
      ctx.shadowBlur = 35;
      ctx.shadowColor = wave.color;
      ctx.stroke();
      ctx.restore();
    };

    const animate = () => {
      time += 1;
      mouseRef.current.x +=
        (targetMouseRef.current.x - mouseRef.current.x) * smoothing;
      mouseRef.current.y +=
        (targetMouseRef.current.y - mouseRef.current.y) * smoothing;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, palette.bgTop);
      gradient.addColorStop(1, palette.bgBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      palette.waves.forEach(drawWave);
      animationId = window.requestAnimationFrame(animate);
    };
    animationId = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      cancelAnimationFrame(animationId);
    };
  }, []);

  const base = `authHero.${resolved}`;
  const rawItems = t(`${base}.items`, { returnObjects: true });
  const isOnboarding = resolved === "onboarding";
  // DFACTORIES: on the onboarding screen the pills must mirror the REAL wizard
  // steps (store → address → company → payment), not the static marketing
  // items — otherwise the highlighted pill never matches the current step.
  const items = isOnboarding
    ? WIZARD_STEPS.map((step) => t(step.labelKey))
    : Array.isArray(rawItems)
      ? (rawItems as string[])
      : [];
  const total = isOnboarding ? TOTAL_STEPS : items.length || 1;
  const percent = isOnboarding
    ? Math.round((Math.min(currentStep + 1, total) / total) * 100)
    : 0;

  return (
    <div className="df-auth-hero relative hidden flex-1 items-center justify-center overflow-hidden bg-white dark:bg-[#0a0a0a] lg:flex">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[460px] w-[460px] -translate-x-1/2 rounded-full bg-black/[0.04] blur-[130px] dark:bg-white/[0.05]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-black/[0.03] blur-[120px] dark:bg-white/[0.035]" />
      </div>

      {/* Readability scrim: dims the waves directly behind the copy while leaving
          them visible toward the edges. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_52%_46%_at_center,rgba(255,255,255,0.72),transparent_74%)] dark:bg-[radial-gradient(ellipse_52%_46%_at_center,rgba(10,10,10,0.6),transparent_74%)]" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex w-full flex-col items-center px-10 text-center text-zinc-900 dark:text-white"
      >
        <motion.span
          variants={itemVariants}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/[0.04] px-4 py-2 text-xs font-semibold tracking-wide text-zinc-600 backdrop-blur dark:border-white/15 dark:bg-white/[0.06] dark:text-white/80"
        >
          <SparkIcon />
          {t(`${base}.eyebrow`)}
        </motion.span>

        <motion.h2
          variants={itemVariants}
          className="mb-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl"
        >
          {t(`${base}.title`)}
        </motion.h2>

        <motion.p
          variants={itemVariants}
          className="mb-8 max-w-[42ch] text-base leading-7 text-zinc-600 dark:text-white/70"
        >
          {t(`${base}.description`)}
        </motion.p>

        {items.length > 0 && (
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {items.map((label, index) => {
              const state = isOnboarding
                ? index < currentStep
                  ? "done"
                  : index === currentStep
                    ? "active"
                    : "todo"
                : "static";
              const cls =
                state === "active"
                  ? "border-transparent bg-zinc-900 text-white dark:bg-white dark:text-[#0a0a0a]"
                  : state === "done"
                    ? "border-black/15 bg-black/10 text-zinc-700 dark:border-white/25 dark:bg-white/15 dark:text-white"
                    : state === "todo"
                      ? "border-black/10 bg-black/[0.04] text-zinc-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55"
                      : "border-black/10 bg-black/[0.05] text-zinc-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-white/85";
              return (
                <span
                  key={label}
                  className={`rounded-full border px-4 py-2 text-xs font-medium backdrop-blur ${cls}`}
                >
                  {label}
                </span>
              );
            })}
          </motion.div>
        )}

        {isOnboarding && (
          <motion.div variants={itemVariants} className="mt-7 w-full max-w-[320px]">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-zinc-900 transition-[width] duration-500 dark:bg-white"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-2 text-xs font-medium text-zinc-600 dark:text-white/70">
              {t("authHero.progress", { percent: localizeNumber(percent) })}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

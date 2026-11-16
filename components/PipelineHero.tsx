"use client";
/**
 * Dossier pipeline hero. New work, in the spirit of two lookap entries (principles, proportions
 * and timing only; no pixels or copy):
 *  - Boomtax Hero Section, https://www.boomtax.com/  (centered serif headline over a belt that carries tiles through one machine;
 *    fade-up 12px / 320ms on cubic-bezier(0.2,0.8,0.2,1); short 50ms nudges and long holds; partner strip between text and scene)
 *  - Chatsheet Automation Landing Page, https://x.com/marcelkargul/status/2107447434175488339  (a soft lit hub, dashed wires with a
 *    pulse travelling along them, one slow ambient drift instead of many small motions)
 * Geometry follows the "isometric illustrations as one plane matrix" note: U=(0.857,-0.514), V=(0.857,0.514).
 * The memorable thing: seven official records ride the belt, go in grey, and come out green with a source tick.
 */
import { motion, useReducedMotion, useTime, useTransform } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const Ux = 0.857, Uy = -0.514, Vx = 0.857, Vy = 0.514;
const M = `matrix(${Ux} ${Uy} ${Vx} ${Vy} 0 0)`; // draw flat in (u,v), wrap in this for a top face
const iso = (u: number, v: number) => [u * Ux + v * Vx, u * Uy + v * Vy] as const;

const CX = 560, CY = 270; // machine centre in the 1100 x 470 scene
const LOOP = 8.4; // seconds for one tile to cross the belt
const TILES = ["PERMITS", "VIOLATIONS", "HPD", "ZONING", "TAX", "FLOOD", "SCHOOLS"];
const STRIP = ["NYC Buildings", "HPD", "City Planning", "Finance", "FEMA", "Education"];

const fadeUp = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, delay: 0.08 * i, ease: EASE },
});

/** A slab: top face in (u,v) with a few offset copies underneath for thickness. */
function Slab({ w, d, h, top, side, rx = 6, children }: { w: number; d: number; h: number; top: string; side: string; rx?: number; children?: ReactNode }) {
  return (
    <g>
      {[h, h * 0.66, h * 0.33].map((k) => (
        <g key={k} transform={`translate(0 ${k})`}>
          <g transform={M}><rect x={-w / 2} y={-d / 2} width={w} height={d} rx={rx} fill={side} /></g>
        </g>
      ))}
      <g transform={M}>
        <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={rx} fill={top} stroke="var(--line)" strokeWidth={1} />
        {children}
      </g>
    </g>
  );
}

function Tile({ label, i, still }: { label: string; i: number; still: boolean }) {
  const s0 = -520, s1 = 430; // belt distance from machine centre
  const time = useTime(); // one clock drives position and colour, so they can never drift apart
  const offset = (i * LOOP) / TILES.length;
  const stillP = (-300 + i * 120 - s0) / (s1 - s0);
  const p = useTransform(time, (t) => (still ? stillP : (((t / 1000 + offset) % LOOP) / LOOP)));
  const x = useTransform(p, (q) => (s0 + (s1 - s0) * q) * Vx);
  const y = useTransform(p, (q) => (s0 + (s1 - s0) * q) * Vy);
  // raw record: grey until it reaches the machine; processed record: green once it has left it
  const raw = useTransform(p, [0, 0.05, 0.4, 0.46, 1], [0, 1, 1, 0, 0]);
  const done = useTransform(p, [0, 0.52, 0.58, 0.94, 1], [0, 0, 1, 1, 0]);
  return (
    <g transform={`translate(${CX} ${CY})`}>
      <motion.g style={{ x, y }}>
        <motion.g style={{ opacity: raw }}>
          <Slab w={64} d={44} h={9} top="var(--card)" side="color-mix(in srgb, var(--ink) 16%, var(--card))">
            <rect x={-26} y={-14} width={52} height={5} rx={2} fill="var(--line)" />
            <rect x={-26} y={-5} width={36} height={4} rx={2} fill="var(--line)" opacity={0.7} />
            <text x={-26} y={14} fontSize={7.6} fontWeight={700} letterSpacing={0.6} fill="var(--mute)" fontFamily="system-ui,sans-serif">{label}</text>
          </Slab>
        </motion.g>
        <motion.g style={{ opacity: done }}>
          <Slab w={64} d={44} h={9} top="var(--brand)" side="color-mix(in srgb, var(--brand) 55%, #000)">
            <rect x={-26} y={-14} width={52} height={5} rx={2} fill="#fff" opacity={0.5} />
            <path d="M-24 8 l5 5 l10 -11" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <text x={-6} y={13} fontSize={7.4} fontWeight={700} letterSpacing={0.6} fill="#fff" fontFamily="system-ui,sans-serif">{label}</text>
          </Slab>
        </motion.g>
      </motion.g>
    </g>
  );
}

function Machine({ still }: { still: boolean }) {
  const T = 70; // height
  const [lx, ly] = iso(-60, -60), [tx, ty] = iso(60, -60), [rx, ry] = iso(60, 60), [bx, by] = iso(-60, 60);
  const P = (x: number, y: number, z = 0) => `${CX + x},${CY + y - z}`;
  const top = [P(lx, ly, T), P(tx, ty, T), P(rx, ry, T), P(bx, by, T)].join(" ");
  const left = [P(lx, ly, T), P(bx, by, T), P(bx, by), P(lx, ly)].join(" ");
  const right = [P(bx, by, T), P(rx, ry, T), P(rx, ry), P(bx, by)].join(" ");
  // opening on the front-right face (edge v = 60), where finished records leave
  const [ax, ay] = iso(-34, 60), [bx2, by2] = iso(34, 60);
  const open = [P(ax, ay, 4), P(bx2, by2, 4), P(bx2, by2, 40), P(ax, ay, 40)].join(" ");
  const pulse = still ? {} : { animate: { opacity: [0.55, 1, 0.55] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const } };
  const [mx, my] = iso(0, 60);
  return (
    <g>
      {/* soft lit hub, the quiet ambient glow */}
      <motion.ellipse cx={CX + mx * 0.6} cy={CY + my * 0.6 + 20} rx={190} ry={90} fill="url(#glow)" {...pulse} />
      <polygon points={left} fill="color-mix(in srgb, var(--ink) 9%, var(--card))" stroke="var(--line)" />
      <polygon points={right} fill="color-mix(in srgb, var(--ink) 15%, var(--card))" stroke="var(--line)" />
      <polygon points={open} fill="#0b2a18" />
      <motion.polygon points={open} fill="url(#slot)" {...pulse} />
      <polygon points={top} fill="var(--card)" stroke="var(--line)" />
      {/* mark on the top face: a lot outline with a tick */}
      <g transform={`translate(${CX} ${CY - T}) ${M}`}>
        <rect x={-22} y={-22} width={44} height={44} rx={8} fill="var(--brand)" />
        <path d="M-10 0 l7 8 l14 -16" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {[-34, -22].map((u, k) => {
        const [x, y] = iso(u, -48);
        return <motion.circle key={u} cx={CX + x} cy={CY + y - T} r={3} fill="#4ade80" animate={still ? undefined : { opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, delay: k * 0.5, repeat: Infinity }} />;
      })}
    </g>
  );
}

/** Side module: a small slab joined to the machine by a dashed wire with a pulse of light travelling along it. */
function Module({ x, y, label, wire, delay, still, children }: { x: number; y: number; label: string; wire: string; delay: number; still: boolean; children: ReactNode }) {
  return (
    <g>
      <path d={wire} fill="none" stroke="var(--line)" strokeWidth={1.5} strokeDasharray="3 4" />
      {!still && (
        <motion.path d={wire} fill="none" stroke="var(--brand)" strokeWidth={2.2} strokeLinecap="round" pathLength={1}
          strokeDasharray="0.07 0.93" initial={{ strokeDashoffset: 0.07 }} animate={{ strokeDashoffset: -0.93 }}
          transition={{ duration: 3.2, delay, repeat: Infinity, ease: "linear" }} />
      )}
      <g transform={`translate(${x} ${y})`}>
        <Slab w={110} d={70} h={12} top="var(--card)" side="color-mix(in srgb, var(--ink) 14%, var(--card))" rx={8}>
          {children}
          <text x={-44} y={30} fontSize={8.6} fontWeight={700} letterSpacing={0.8} fill="var(--mute)" fontFamily="system-ui,sans-serif">{label}</text>
        </Slab>
      </g>
    </g>
  );
}

function Scene() {
  const still = !!useReducedMotion();
  const pt = (n: number, du: number) => `${CX + n * Vx + du * Ux},${CY + n * Vy + du * Uy}`;
  const belt = [pt(-560, -35), pt(-560, 35), pt(520, 35), pt(520, -35)].join(" ");
  const beltLow = [pt(-560, -35), pt(-560, 35), pt(520, 35), pt(520, -35)].map((q) => { const [x, y] = q.split(",").map(Number); return `${x},${y + 8}`; }).join(" ");
  return (
    <svg viewBox="0 0 1100 470" className="block h-auto w-full" role="img" aria-label="Seven official records on a conveyor pass through the dossier machine and come out verified, each with a link to its source.">
      <defs>
        <radialGradient id="glow"><stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} /><stop offset="100%" stopColor="#4ade80" stopOpacity={0} /></radialGradient>
        <linearGradient id="slot" x1="0" x2="1"><stop offset="0%" stopColor="#4ade80" stopOpacity={0.15} /><stop offset="100%" stopColor="#bbf7d0" stopOpacity={0.9} /></linearGradient>
        <clipPath id="frame"><rect width="1100" height="470" /></clipPath>
      </defs>
      <g clipPath="url(#frame)">
        <polygon points={beltLow} fill="color-mix(in srgb, var(--ink) 18%, var(--card))" />
        <polygon points={belt} fill="color-mix(in srgb, var(--ink) 5%, var(--card))" stroke="var(--line)" />
        {/* the belt's centre dashes slide at a steady speed so the belt reads as moving */}
        <motion.line x1={CX - 560 * Vx} y1={CY - 560 * Vy} x2={CX + 520 * Vx} y2={CY + 520 * Vy} stroke="var(--line)" strokeWidth={2} strokeDasharray="14 22"
          animate={still ? undefined : { strokeDashoffset: [0, -36] }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />

        <Module x={830} y={110} label="RE-CHECKED LIVE" wire={`M ${CX + 60} ${CY - 90} L 700 160 L 790 118`} delay={0.6} still={still}>
          <circle r={14} fill="var(--brand-soft)" /><path d="M-6 0 l4 5 l9 -10" fill="none" stroke="var(--brand)" strokeWidth={3} strokeLinecap="round" />
        </Module>
        <Module x={300} y={400} label="WATCHING" wire={`M ${CX - 80} ${CY + 40} L 470 380 L 360 392`} delay={1.8} still={still}>
          <motion.circle r={8} fill="none" stroke="var(--brand)" strokeWidth={2} animate={still ? undefined : { scale: [1, 2.3], opacity: [0.8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} />
          <circle r={7} fill="var(--brand)" />
        </Module>

        <Machine still={still} />
        {TILES.map((t, i) => <Tile key={t} label={t} i={i} still={still} />)}
      </g>
    </svg>
  );
}

export default function PipelineHero({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <header className="relative isolate overflow-hidden pt-10">
      {/* fine vertical hairlines fading out downward, the quiet texture behind the scene */}
      {!compact && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 -z-10 opacity-60"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px 7px)", maskImage: "linear-gradient(to bottom, transparent, #000 40%, #000)" }} />}
      <div className="mx-auto max-w-[720px] text-center">
        <motion.h1 {...fadeUp(0)} className="!mx-auto !mb-4 !max-w-[22ch] text-[clamp(38px,6.2vw,64px)] font-normal leading-[1.02] tracking-[-0.02em]"
          style={{ fontFamily: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif' }}>
          Know the property before you sign anything.
        </motion.h1>
        <motion.p {...fadeUp(1)} className="mx-auto max-w-[56ch] text-[17px] leading-relaxed text-[var(--mute)]">
          Enter a New York City address. In a few minutes you get one report with its permits, violations, zoning, tax record, flood zone and zoned schools, each linked to the government page it came from.
        </motion.p>
        <motion.div {...fadeUp(2)} className="mt-7 text-left">{children}</motion.div>
      </div>
      {!compact && (
        <>
          <motion.ul {...fadeUp(4)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }} className="mx-auto mt-10 max-w-[1040px] list-none border-y border-[var(--line)] p-0 text-center text-[13px] font-semibold tracking-wide text-[var(--mute)]">
            {STRIP.map((s) => <li key={s} className="border-l border-[var(--line)] py-4 first:border-l-0">{s}</li>)}
          </motion.ul>
          <motion.div {...fadeUp(5)} className="mx-auto -mb-6 max-w-[1100px]"><Scene /></motion.div>
        </>
      )}
    </header>
  );
}

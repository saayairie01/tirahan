import { X } from 'lucide-react';
import { APP_VERSION } from '../game/types';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
    >
      <div className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-baseline gap-2.5">
            <h2 id="rules-modal-title" className="text-lg font-semibold text-zinc-100">
              How to Play Tirahan
            </h2>
            <span className="text-xs font-mono text-zinc-500">{APP_VERSION}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-300">
          <p>
            Inspired by the classic Filipino pen-and-paper game <strong className="text-zinc-100">Tirahan</strong>,
            two fleets face off from opposing corners of the sheet.
          </p>

          <div className="space-y-2.5 border-t border-zinc-900 pt-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Fleet Stats, Solid Shields &amp; Asteroids
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
              <li>
                <strong className="text-zinc-100">Mother Ships (20 HP):</strong> Fire heavy <span className="font-mono text-zinc-200">10 HP</span> projectiles up to <span className="font-mono text-zinc-200">784px</span> range with zero overheat risk.
              </li>
              <li>
                <strong className="text-zinc-100">Fighter Ships (3 HP):</strong> Fire <span className="font-mono text-zinc-200">3 HP</span> projectiles up to <span className="font-mono text-zinc-200">392px</span> range. Charging above <span className="font-mono text-zinc-200">75%</span> risks overheating unless Overcharge is armed.
              </li>
              <li>
                <strong className="text-zinc-100">Unified Solid Shield (10 HP):</strong> One continuous ring protects each Mother Ship (blocks incoming shots and collisions; Energy cells rebuild or over-shield above <span className="font-mono text-zinc-200">100%</span> up to <span className="font-mono text-zinc-200">200%</span>).
              </li>
              <li>
                <strong className="text-zinc-100">Atari Gravity Asteroids:</strong> Configurable rocks (<span className="font-mono text-zinc-200">Low 6 · Medium 10 · High 16</span>) bend shots with gravity, absorb hits, and can hide Power Cells inside.
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 border-t border-zinc-900 pt-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Power Cells &amp; Tactical Charges
            </h3>
            <p className="text-xs text-zinc-400">
              Power Cells spawn in open space and emerge from shattered asteroids. Collect them by shooting through them or colliding in Move/spawn flight.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
              <li>
                <strong className="text-emerald-300">Repair / Energy (Instant):</strong> Repair restores <span className="font-mono text-zinc-200">+4 Mother Ship HP</span>; Energy restores or over-shields your ring by <span className="font-mono text-zinc-200">+4 HP</span> (does not repair Fighter Shields).
              </li>
              <li>
                <strong className="text-rose-400">Proximity Mines (Hazard):</strong> Detonate on projectile hit or ship contact for <span className="font-mono text-zinc-200">4 HP</span> blast damage across a <span className="font-mono text-zinc-200">90px</span> radius.
              </li>
              <li>
                <strong className="text-violet-300">[1–4] Stackable Fire Mods:</strong> Arm any combination together before firing (except Trident &amp; Flak, which are mutually exclusive):
                <span className="block mt-1 text-xs text-zinc-400">
                  <strong className="text-violet-300">[1] Trident</strong> (3-way split &amp; spawn) · <strong className="text-orange-300">[2] Flak</strong> (8× radial 3 HP burst, no spawn) · <strong className="text-yellow-300">[3] Overcharge</strong> (2× damage, 0% overheat) · <strong className="text-sky-200">[4] Piercer</strong> (bypasses Mother Ship &amp; Fighter shields).
                </span>
              </li>
              <li>
                <strong className="text-teal-300">[5] Hyper Move (Standalone):</strong> Doubles Fighter Move-mode drag range for one maneuver (does not stack with Fire Mods).
              </li>
              <li>
                <strong className="text-rose-300">[6–8] Free Ship Buffs:</strong> Select a friendly ship and apply without ending your turn — still fire or move afterward:
                <span className="block mt-1 text-xs text-zinc-400">
                  <strong className="text-cyan-300">[6] Laser Sight</strong> (permanent max-range aim line until destroyed) · <strong className="text-red-400">[7] Laser Dot</strong> (permanent invisible beam projecting a glowing red contact dot) · <strong className="text-indigo-300">[8] Fighter Shield</strong> (5 HP ring around selected Fighter; replace with a new Fighter Shield cell to repair).
                </span>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 border-t border-zinc-900 pt-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Controls, Kamikaze &amp; Online
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
              <li>
                <strong className="text-zinc-100">Aim &amp; Fire:</strong> Click a friendly ship to activate, sweep mouse L/R (or <span className="font-mono text-zinc-200">A/D</span>, Arrows) to aim, hold click or <span className="font-mono text-zinc-200">Space</span> to charge and release. Toggle Fire/Move mods with <span className="font-mono text-zinc-200">1–5</span>; apply free Ship Buffs with <span className="font-mono text-zinc-200">6–8</span>.
              </li>
              <li>
                <strong className="text-zinc-100">Kamikaze Hit (Bonus Turn):</strong> Ramming an enemy ship in Move mode (<span className="font-mono text-zinc-200">M</span>) or spawning on one deals <span className="font-mono text-zinc-200">5 HP</span> mutual damage and grants a bonus turn.
              </li>
              <li>
                <strong className="text-zinc-100">2-Player Online:</strong> Play via Match Server or Direct P2P WebRTC with live turn sync and <span className="font-mono text-zinc-200">60s</span> reconnect grace.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-black hover:bg-white transition-colors cursor-pointer"
          >
            Back to Arena
          </button>
        </div>
      </div>
    </div>
  );
}

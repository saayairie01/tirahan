import { X } from 'lucide-react';

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
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <h2 id="rules-modal-title" className="text-lg font-semibold text-zinc-100">
            How to Play Tirahan (Space Battle)
          </h2>
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
              Fleet Stats &amp; Damage
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
              <li>
                <strong className="text-zinc-100">Mother Ships (20 HP):</strong> Fire heavy <span className="font-mono text-zinc-200">10 HP</span> projectiles up to <span className="font-mono text-zinc-200">784px</span> range and can safely charge to <span className="font-mono text-zinc-200">100%</span> power with zero overheat risk.
              </li>
              <li>
                <strong className="text-zinc-100">Fighter Ships (3 HP):</strong> Fire <span className="font-mono text-zinc-200">3 HP</span> projectiles up to <span className="font-mono text-zinc-200">392px</span> range. Charging above <span className="font-mono text-zinc-200">75%</span> follows an asymptotic overheat curve up to <span className="font-mono text-zinc-200">95%</span> at 100%.
              </li>
              <li>
                <strong className="text-zinc-100">Piercing Shots:</strong> Projectiles pierce through Fighter Ships (enemy or friendly in path), damaging every fighter crossed on their way to max range. Shields (<span className="font-mono text-zinc-200">6 HP</span> per arc), asteroids, and Mother Ships stop shots.
              </li>
              <li>
                <strong className="text-zinc-100">Atari Gravity Asteroids:</strong> Configurable rocks bend nearby shots with size-scaled gravitational fields. Asteroids have HP proportionate to size (<span className="font-mono text-zinc-200">0 HP</span> shatters them) and destroy colliding ships (<span className="font-mono text-zinc-200">5 dmg</span>).
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 border-t border-zinc-900 pt-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Controls, Barriers &amp; Kamikaze Hits
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-300">
              <li>
                <strong className="text-zinc-100">Coin Flip &amp; Aim:</strong> Who shoots first is randomized each match. Click a friendly ship to activate it, sweep the mouse left or right (or <span className="font-mono text-zinc-200">A/D</span>, Arrows) to rotate, then hold click or <span className="font-mono text-zinc-200">Space</span> to charge and release to fire exact range.
              </li>
              <li>
                <strong className="text-zinc-100">Shield, Asteroid &amp; Border Destruction:</strong> Moving or spawning against the paper border, an intact shield arc, or an asteroid destroys the ship immediately. Destroying a Mother Ship triggers a chain collapse across its fleet.
              </li>
              <li>
                <strong className="text-zinc-100">Kamikaze Hit (Bonus Turn):</strong> Ramming a Fighter into an enemy ship in Move mode (<span className="font-mono text-zinc-200">M</span>) or spawning a Fighter on an enemy ship inflicts <span className="font-mono text-zinc-200">5 HP</span> mutual damage and grants a bonus turn to fire again.
              </li>
              <li>
                <strong className="text-zinc-100">2-Player Online:</strong> Create a 6-character private room or join the Quick Match queue (via Direct P2P WebRTC or Match Server). Live ship rotation syncs as you aim, and disconnected players have <span className="font-mono text-zinc-200">60s</span> to reconnect before forfeit.
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

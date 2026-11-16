import { Check, Copy, Download, X } from 'lucide-react';
import { useState } from 'react';
import { GODOT_TIRAHAN_SCRIPT } from '../game/godotTemplate';

interface GodotModalProps {
  open: boolean;
  onClose: () => void;
}

export function GodotModal({ open, onClose }: GodotModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(GODOT_TIRAHAN_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures in restricted frames
    }
  };

  const handleDownload = () => {
    const blob = new Blob([GODOT_TIRAHAN_SCRIPT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tirahan_arena.gd';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="godot-modal-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="godot-modal-title" className="text-base font-semibold text-zinc-100">
              Godot 4 GDScript · Pure Vector Implementation
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Attach <span className="font-mono text-zinc-300">tirahan_arena.gd</span> to a{' '}
              <span className="font-mono text-zinc-300">Node2D</span> in a 1280×760 Godot 4 scene. Uses{' '}
              <span className="font-mono text-zinc-300">_draw()</span> vector primitives with zero image assets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Godot script modal"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-black p-4">
          <pre className="text-xs leading-relaxed font-mono text-zinc-300 whitespace-pre">
            {GODOT_TIRAHAN_SCRIPT}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-6 py-3.5">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download .gd</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-black hover:bg-white transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Script'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function stripGodotForItchPlugin(enabled: boolean): Plugin {
  return {
    name: 'strip-godot-for-itch',
    load(id) {
      if (!enabled) return null;
      const normalized = id.replace(/\\/g, '/');
      if (normalized.endsWith('/src/game/godotTemplate.ts')) {
        return 'export const GODOT_TIRAHAN_SCRIPT = "";';
      }
      if (normalized.endsWith('/src/components/GodotModal.tsx')) {
        return 'export function GodotModal() { return null; }';
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  const isItchExport = process.env.VITE_ITCH_EXPORT === 'true';

  return {
    base: isItchExport ? './' : '/',
    plugins: [stripGodotForItchPlugin(isItchExport), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

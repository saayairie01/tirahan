import { Code2, HelpCircle, Music, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { ActionMode, GameMode, GameState, PlayerId } from '../game/types';

const IS_ITCH_EXPORT = import.meta.env.VITE_ITCH_EXPORT === 'true';

interface TopBarProps {
  gameState: GameState;
  gameMode: GameMode;
  currentTurn: PlayerId;
  actionMode: ActionMode;
  onActionModeChange: (mode: ActionMode) => void;
  p1MotherHp: number;
  p1MotherMaxHp: number;
  p1Fighters: number;
  p1ShieldPct: number;
  p2MotherHp: number;
  p2MotherMaxHp: number;
  p2Fighters: number;
  p2ShieldPct: number;
  muted: boolean;
  onToggleMute: () => void;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  hideGodot?: boolean;
  onlineSeat?: PlayerId | null;
  onlineRoomCode?: string | null;
  onOpenRules: () => void;
  onOpenGodot: () => void;
  onRestart: () => void;
}

export function TopBar({
  gameState,
  gameMode,
  currentTurn,
  actionMode,
  onActionModeChange,
  p1MotherHp,
  p1MotherMaxHp,
  p1Fighters,
  p1ShieldPct,
  p2MotherHp,
  p2MotherMaxHp,
  p2Fighters,
  p2ShieldPct,
  muted,
  onToggleMute,
  musicEnabled,
  onToggleMusic,
  hideGodot = false,
  onlineSeat = null,
  onlineRoomCode = null,
  onOpenRules,
  onOpenGodot,
  onRestart,
}: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/90 bg-black px-4 sm:px-6">
      {/* Zone 1: Brand + optional active room code */}
      <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
        <span className="text-lg font-semibold tracking-tight text-zinc-100">
          Tirahan
        </span>
        {gameMode === 'online' && onlineRoomCode && gameState !== 'TITLE_MENU' && (
          <span className="hidden sm:inline text-xs font-mono text-zinc-400">
            Room {onlineRoomCode}
          </span>
        )}
      </div>

      {/* Zone 2: Unboxed Match HUD with explicit text + shape + tabular numerals */}
      <div className="hidden lg:flex items-center gap-6 text-xs font-mono tabular-nums">
        <div
          className={`flex items-center gap-2.5 transition-opacity duration-150 ${
            gameState === 'PLAYING' && currentTurn === 1 ? 'text-sky-300' : 'text-zinc-400'
          }`}
        >
          <svg width="14" height="14" viewBox="-16 -16 32 32" className="shrink-0" aria-hidden="true">
            <polygon
              points="13,0 -9,-10 -5,0 -9,10"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-semibold text-sky-400">
            P1{gameMode === 'online' && onlineSeat === 1 ? ' (You)' : ''}
          </span>
          <span>Hull {p1MotherHp}/{p1MotherMaxHp}</span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span>Shield {p1ShieldPct}%</span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span>Fighters {p1Fighters}</span>
        </div>

        <span aria-hidden="true" className="text-zinc-800">|</span>

        <div
          className={`flex items-center gap-2.5 transition-opacity duration-150 ${
            gameState === 'PLAYING' && currentTurn === 2 ? 'text-orange-300' : 'text-zinc-400'
          }`}
        >
          <svg width="14" height="14" viewBox="-16 -16 32 32" className="shrink-0" aria-hidden="true">
            <polygon
              points="12,-4 3,-5 -6,-11 -9,0 -6,11 3,5 12,4 6,0"
              fill="none"
              stroke="#FB923C"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-semibold text-orange-400">
            {gameMode === 'cpu'
              ? 'CPU'
              : `P2${gameMode === 'online' && onlineSeat === 2 ? ' (You)' : ''}`}
          </span>
          <span>Hull {p2MotherHp}/{p2MotherMaxHp}</span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span>Shield {p2ShieldPct}%</span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span>Fighters {p2Fighters}</span>
        </div>
      </div>

      {/* Zone 3: Actions & Action Mode Switch */}
      <div className="flex items-center gap-2 shrink-0">
        {gameState === 'PLAYING' && (
          <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5 mr-1">
            <button
              type="button"
              onClick={() => onActionModeChange('fire')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                actionMode === 'fire'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Fire
            </button>
            <button
              type="button"
              onClick={() => onActionModeChange('move')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                actionMode === 'move'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Move
            </button>
          </div>
        )}

        {!IS_ITCH_EXPORT && !hideGodot && (
          <button
            type="button"
            onClick={onOpenGodot}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-900 hover:border-zinc-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Code2 className="h-3.5 w-3.5 text-zinc-400" />
            <span>Godot 4 Script</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenRules}
          aria-label="Game Rules"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Rules</span>
        </button>

        <button
          type="button"
          onClick={onToggleMusic}
          aria-label={musicEnabled ? 'Turn Music Off' : 'Turn Music On'}
          title={musicEnabled ? 'Background Music: On' : 'Background Music: Off'}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            musicEnabled
              ? 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
              : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
          }`}
        >
          <Music className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{musicEnabled ? 'Music On' : 'Music Off'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          title={muted ? 'Sound Effects: Off' : 'Sound Effects: On'}
          className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors shrink-0 cursor-pointer"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        {gameState !== 'TITLE_MENU' && (
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-black hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{gameMode === 'online' ? 'Leave Room' : 'New Match'}</span>
          </button>
        )}
      </div>
    </header>
  );
}

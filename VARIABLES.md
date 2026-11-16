# Tirahan (Space Battle) — Variables Reference

Complete reference of all constants, data model fields, UI state variables, audio fields, and Godot 4 GDScript equivalents used in **Tirahan**.

---

## 1. Engine Constants (`src/game/engine.ts`)

### Arena, Geometry & Controls

| Variable | Type | Value | Unit / Purpose |
| --- | --- | --- | --- |
| `LOGICAL_WIDTH` | `number` | `1280` | Logical canvas width in pixels |
| `LOGICAL_HEIGHT` | `number` | `760` | Logical canvas height in pixels |
| `PAPER_MARGIN` | `number` | `26` | Inset border margin from canvas edge (px) |
| `SHIELD_RADIUS` | `number` | `104` | Circular shield ring radius around each Mother Ship (px) |
| `SHIELD_SEGMENTS` | `number` | `12` | Number of arc segments per player's circular shield |
| `FIGHTER_ORBIT_RADIUS` | `number` | `148` | Initial spawn radius of the 5 starting Fighter Ships around each Mother Ship (px) |
| `MAX_MOVE_DISTANCE` | `number` | `155` | Maximum Move-mode drag distance for a Fighter Ship (px) |
| `ROTATION_SENSITIVITY` | `number` | `0.006` | Mouse horizontal movement sensitivity (`radians / px`) |
| `KEY_ROTATION_SPEED` | `number` | `2.1` | Keyboard (`A`/`D`, Left/Right) rotation speed (`radians / s`) |
| `P1_BASE` | `{ x: number; y: number }` | `{ x: 146, y: 614 }` | Player 1 corner Mother Ship & shield center coordinates (px) |
| `P2_BASE` | `{ x: number; y: number }` | `{ x: 1134, y: 146 }` | Player 2 / CPU corner Mother Ship & shield center coordinates (px) |
| `P1_COLOR` | `string` | `'#38BDF8'` | Player 1 vector stroke/glow, projectile, and Kamikaze color (Cyan) |
| `P2_COLOR` | `string` | `'#FB923C'` | Player 2 / CPU vector stroke/glow, projectile, and Kamikaze color (Amber-Orange) |

### Power, Charging, Overheat & Range

| Variable | Type | Value | Unit / Purpose |
| --- | --- | --- | --- |
| `CHARGE_FILL_DURATION` | `number` | `1.640625` (`1.3125 / 0.8`) | Seconds for one 10% -> 100% power charge half-cycle |
| `MIN_POWER` | `number` | `0.1` | Minimum shot power (`10%`) |
| `SAFE_POWER_LIMIT` | `number` | `0.75` | Fighter safe power ceiling (`75%`) with `0%` overheat risk |
| `MAX_OVERHEAT_CHANCE` | `number` | `0.95` | Maximum overheat probability (`95%`) at `100%` Fighter power |
| `ASYMPTOTE_K` | `number` | `0.88` | Asymptotic curvature factor for Fighter overheat curve above `75%` |
| `FIGHTER_MAX_RANGE` | `number` | `392` | Maximum Fighter projectile range at `100%` power (px) |
| `MOTHERSHIP_MAX_RANGE` | `number` | `784` (`FIGHTER_MAX_RANGE * 2`) | Maximum Mother Ship projectile range at `100%` power (px) |
| `PROJECTILE_SPEED` | `number` | `780` | Projectile travel speed (`px / s`) |

### Combat, Hull, Shield, Asteroids & Collapse Sequence

| Variable | Type | Value | Unit / Purpose |
| --- | --- | --- | --- |
| `FIGHTER_HP` | `number` | `3` | Starting & spawned Fighter Ship HP |
| `MOTHERSHIP_HP` | `number` | `20` | Starting Mother Ship HP |
| `SHIELD_SEGMENT_HP` | `number` | `6` | Starting HP for each of the 12 shield arcs |
| `FIGHTER_PROJECTILE_DAMAGE` | `number` | `3` | Damage dealt per hit by a Fighter Ship projectile |
| `MOTHERSHIP_PROJECTILE_DAMAGE` | `number` | `10` | Damage dealt per hit by a Mother Ship projectile |
| `KAMIKAZE_DAMAGE` | `number` | `5` | Mutual HP damage dealt to both ships on Move-ram or spawn overlap |
| `SHIELD_COLLISION_DAMAGE` | `number` | `5` | Damage dealt to an intact shield arc when a moving or spawned ship collides with it |
| `ASTEROID_COLLISION_DAMAGE` | `number` | `5` | Damage dealt to an asteroid when a moving or spawned ship collides with it |
| `ASTEROID_COUNTS` | `Record<AsteroidDensity, number>` | `{ off: 0, low: 3, medium: 5, high: 8 }` | Number of asteroids generated per density setting |
| `ASTEROID_MIN_RADIUS` | `number` | `20` | Minimum asteroid collision radius (px) |
| `ASTEROID_MAX_RADIUS` | `number` | `46` | Maximum asteroid collision radius (px) |
| `ASTEROID_GRAVITY_RADIUS_MULT` | `number` | `3.4` | Gravitational well radius multiplier (`gravityRadius = radius * 3.4`) |
| `ASTEROID_GRAVITY_CONSTANT` | `number` | `4500` | Gravity strength scaling constant (`gravityStrength = 4500 * radius^2`) |
| `COLLAPSE_INTERVAL` | `number` | `0.16` | Split-second interval (s) between sequential Fighter explosions after Mother Ship destruction |
| `VICTORY_SETTLE_DELAY` | `number` | `0.35` | Settle pause (s) after final Fighter explodes before showing Game Over |

### Local Engine / Effect Tuning Parameters (`src/game/engine.ts`)

| Variable | Scope | Value | Purpose |
| --- | --- | --- | --- |
| `fighterOffsets` | `createWorld` | `[-0.92, -0.46, 0, 0.46, 0.92]` | Angular offsets (radians) of the 5 starting Fighters per corner |
| `startingTurn` | `createWorld` | `Math.random() < 0.5 ? 1 : 2` | Coin-flip randomized first shooter (`1` or `2`) |
| `mothership.radius` | `createWorld` | `34` | Mother Ship collision radius (px) |
| `fighter.radius` | `createWorld` | `15` | Fighter Ship collision radius (px) |
| `subSteps` | `stepWorld` | `6` | Physics sub-steps per frame for curved gravity flight and swept collisions |
| `floatingText.vy` | `spawnFloatingText` | `-28` | Upward drift speed of `"Kamikaze"` callout (`px / s`) |
| `floatingText.life` / `maxLife` | `spawnFloatingText` | `0.95` | Lifetime of `"Kamikaze"` callout (`s`); holds full opacity until `ratio <= 0.65`, then fades to `0` |

---

## 2. Core Data Types & World State (`src/game/types.ts`)

### Union Types

| Type | Values | Purpose |
| --- | --- | --- |
| `PlayerId` | `1 \| 2` | Identifies Player 1 (`1`) or Player 2 / CPU (`2`) |
| `GameMode` | `'pvp' \| 'cpu' \| 'online'` | Local 2-player, vs CPU opponent, or 2-player online WebSocket match |
| `GameState` | `'TITLE_MENU' \| 'PLAYING' \| 'GAME_OVER'` | High-level screen state |
| `ActionMode` | `'fire' \| 'move'` | Current turn interaction mode |
| `ShipKind` | `'mothership' \| 'fighter'` | Ship class |
| `AsteroidDensity` | `'off' \| 'low' \| 'medium' \| 'high'` | Match asteroid generation preset |
| `MoveOutcome` | `'move' \| 'kamikaze' \| 'friendly' \| 'shield' \| 'border' \| 'asteroid'` | Predicted/resolved outcome of Move-mode drag |

### `GameWorld`

| Field | Type | Default / Initial | Purpose |
| --- | --- | --- | --- |
| `ships` | `Ship[]` | `12` ships (`2` Mother Ships, `10` Fighters) | All active and destroyed ships |
| `shields` | `ShieldSegment[]` | `24` segments (`12` per corner) | Circular shield arcs around both Mother Ships |
| `asteroids` | `Asteroid[]` | `generateAsteroids(rules.asteroidDensity)` | Retro Atari destructible gravity asteroids |
| `projectiles` | `Projectile[]` | `[]` | Active in-flight projectiles |
| `particles` | `VectorParticle[]` | `[]` | Transient vector burst line fragments |
| `shockwaves` | `ShockwaveRing[]` | `[]` | Expanding vector impact rings |
| `floatingTexts` | `FloatingText[]` | `[]` | Transient floating world-space labels (`"Kamikaze"`) |
| `pendingDestructions` | `string[]` | `[]` | Ordered queue of defeated Fighter IDs awaiting staggered destruction |
| `destructionTimer` | `number` | `0` | Countdown timer (s) to the next Fighter explosion in collapse chain |
| `victoryDelay` | `number` | `0` | Settle countdown (s) after final collapse before displaying Game Over |
| `currentTurn` | `PlayerId` | `1` or `2` (coin flip) | Player whose turn is currently active |
| `turnCount` | `number` | `1` | Monotonic turn counter (increments on turn advance and bonus turns) |
| `actionLocked` | `boolean` | `false` | Locks player input while projectiles resolve, fleet collapses, or match ends |
| `winner` | `PlayerId \| null` | `null` | Winning player once opposing Mother Ship reaches `0 HP` |
| `lastEventText` | `string` | `'Coin flip: Player X shoots first...'` | Latest combat/turn summary shown in footer |
| `screenShake` | `number` | `0` | Decaying camera shake amplitude (px) |
| `rules` | `MatchRules` | `{ ricochetWalls: false, asteroidDensity: 'medium' }` | Match rules configuration |

### `Asteroid`

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | `string` | Unique asteroid identifier |
| `x`, `y` | `number` | World-space center coordinates (px) |
| `radius` | `number` | Collision radius (`20..46px`) |
| `gravityRadius` | `number` | Outer boundary of gravitational pull (`radius * 3.4`) |
| `gravityStrength` | `number` | Gravitational force coefficient (`4500 * radius^2`) |
| `hp`, `maxHp` | `number` | Current and max HP proportionate to size (`Math.round(radius * 0.3)` = `6..14 HP`) |
| `vertices` | `Vec2[]` | Jagged Atari *Asteroids* polygon vertex offsets |
| `rotation`, `rotSpeed` | `number` | Static orientation angle (rad) and `0` spin (`rad / s`) |
| `flashTimer` | `number` | White impact-flash timer (`s`) |

### `Ship`, `ShieldSegment`, `Projectile`

| Struct | Key Fields | Purpose |
| --- | --- | --- |
| `Ship` | `id, owner, kind, x, y, angle, radius, hp, maxHp, alive, flashTimer` | Mother Ships (`34px`, `20 HP`) and Fighter Ships (`15px`, `3 HP`) |
| `ShieldSegment` | `id, owner, index, centerX, centerY, radius, startAngle, endAngle, hp, maxHp, flashTimer` | `12` circular shield segments (`6 HP` each) per corner |
| `Projectile` | `id, owner, sourceShipId, hitShipIds, x, y, vx, vy, power, damage, distanceTraveled, maxRange, bounces, maxBounces, trail, active` | Attacker-colored shot with gravity deflection, piercing through Fighters, and range-end Fighter spawning |

### `VectorParticle`, `ShockwaveRing`, `FloatingText`, `ActiveFireState`, `MoveDraft`, `MatchRules`

| Struct | Fields | Purpose |
| --- | --- | --- |
| `VectorParticle` | `x, y, vx, vy, angle, spin, length, life, maxLife, color` | Rotating vector explosion/spark lines |
| `ShockwaveRing` | `x, y, radius, maxRadius, life, maxLife, color` | Expanding circular impact shockwaves |
| `FloatingText` | `text, x, y, vy, life, maxLife, color` | Floating world-space `"Kamikaze"` callout matched to attacker's color |
| `ActiveFireState` | `shipId, isCharging, chargeTime, power` | Tracks active ship selection and power charging |
| `MoveDraft` | `shipId, targetX, targetY, outcome, cancelled` | Tracks live Move-mode drag preview and predicted outcome |
| `MatchRules` | `ricochetWalls: boolean, asteroidDensity: AsteroidDensity` | Enables wall bounces and selects asteroid field density |

---

## 3. React App & UI State (`src/App.tsx`, Modals & Audio)

### React State & HUD (`src/App.tsx`)

| Variable | Type | Initial Value | Purpose |
| --- | --- | --- | --- |
| `gameState` | `GameState` | `'TITLE_MENU'` | Current UI screen (`TITLE_MENU`, `PLAYING`, `GAME_OVER`) |
| `gameMode` | `GameMode` | `'pvp'` | Active match mode (`pvp`, `cpu`, or `online`) |
| `rules` | `MatchRules` | `{ ricochetWalls: false, asteroidDensity: 'medium' }` | Selected match rules |
| `actionMode` | `ActionMode` | `'fire'` | Active player action mode (`fire` or `move`) |
| `muted` | `boolean` | `false` | Sound effects mute toggle |
| `musicEnabled` | `boolean` | `true` | Looping background music on/off toggle |
| `musicStatus` | `'checking' \| 'bundled' \| 'custom' \| 'missing'` | `'checking'` | Indicates whether `mattoglseby-3.ogg` is bundled or attached |
| `musicFileName` | `string` | `'mattoglseby-3.ogg'` | Active background music filename |
| `exportStatus`, `isExportingZip` | `string \| null`, `boolean` | `null`, `false` | Authoring-only itch.io `.zip` packaging feedback |
| `IS_ITCH_EXPORT` | `boolean` | `import.meta.env.VITE_ITCH_EXPORT === 'true'` | Strips Godot 4 script UI and authoring export tools from itch.io builds (Online mode stays active) |
| `transportMode` | `OnlineTransportMode` | `getDefaultTransportMode()` (`'p2p'` in itch export, `'ws'` on web) | Active multiplayer transport (`Direct P2P` vs `Match Server`) |
| `serverSettingsOpen`, `wsUrlInput`, `wsUrlSavedNotice` | `boolean / string / string \| null` | `false / resolveWebSocketUrl() / null` | Controls inline WebSocket Server URL editor and save/reset feedback |
| `onlinePhase` | `OnlinePhase` | `'idle'` | Lobby/match connection state (`idle`, `waiting_room`, `queueing`, `playing`) |
| `onlineRoomCode` | `string \| null` | `null` | Active 6-character private/match room code |
| `onlineSeat` | `PlayerId \| null` | `null` | Assigned online fleet seat (`1` or `2`) |
| `onlineError`, `joinCodeInput`, `copiedInvite` | `string \| null / string / boolean` | `null / '' / false` | Online room error feedback, join code input, and invite copy confirmation |
| `opponentDisconnectedSeconds` | `number \| null` | `null` | Live 60s reconnect grace countdown when opponent drops mid-match |
| `rematchRequested`, `opponentWantsRematch` | `boolean` | `false` | Mutual rematch vote flags in Online Game Over overlay |
| `rulesOpen`, `godotOpen` | `boolean` | `false` | Controls visibility of `RulesModal` and `GodotModal` |
| `hud` | `HudSnapshot` | `readHudSnapshot(...)` | Includes `currentTurn, turnCount, p1/p2MotherHp, p1/p2MotherMaxHp, p1/p2Fighters, p1/p2ShieldPct, winner, victoryReady, pendingCollapseCount, lastEventText` |
| `activeShipStatus` | `object` | `{ active: false, charging: false, powerPct: 10, rangePx: 39, overheatPct: 0 }` | Footer live charge readout |

### React Refs & Audio (`src/App.tsx`, `GodotModal.tsx`, `sound.ts`)

| Variable | File | Type | Purpose |
| --- | --- | --- | --- |
| `worldRef`, `containerRef`, `canvasRef`, `musicInputRef` | `src/App.tsx` | Refs | Simulation state, layout box, 2D canvas, and `.ogg` file picker |
| `activeFireRef`, `moveDraftRef`, `hoveredShipIdRef` | `src/App.tsx` | Refs | Live aim/charge, Move drag preview, and hover state |
| `chargePointerIdRef`, `movePointerIdRef`, `spaceChargingRef`, `lastClientXRef`, `keysHeldRef` | `src/App.tsx` | Refs | Input capture and keyboard/pointer tracking |
| `cpuTimerRef`, `cpuFireTimerRef`, `cpuAimTweenRef` | `src/App.tsx` | Refs | CPU turn timers and rotation easing tween |
| `onlineClientRef`, `remoteAimRef`, `lastAimSentAtRef`, `reconnectRetryTimerRef`, `p2pGuestCountdownRef` | `src/App.tsx` | Refs | Active `OnlineTransport` (`OnlineSocketClient` or `PeerOnlineClient`), synced opponent aim reticle, 30 Hz aim throttle timestamp, and reconnect/grace timers |
| `copied` | `src/components/GodotModal.tsx` | `boolean` | `"Copied"` feedback state |
| `ctx`, `muted`, `musicAudio`, `musicEnabled`, `musicStatus`, `customMusicBytes`, `onCue` | `src/game/sound.ts` | Audio state | Web Audio SFX engine, looping `mattoglseby-3.ogg` player & zip bytes, and SFX cue emitter (`onCue`) |

---

## 4. Online Multiplayer Protocol, P2P & Server (`onlineTypes.ts`, `onlineClient.ts`, `peerOnlineClient.ts`, `server.ts`)

| Variable / Type | File | Value / Schema | Purpose |
| --- | --- | --- | --- |
| `PORT` | `server.ts` | `Number(process.env.PORT \|\| 3000)` | Express HTTP & `/ws` WebSocket server port |
| `DISCONNECT_GRACE_SECONDS` | `server.ts`, `peerOnlineClient.ts` | `60` | Seconds before an unexpected mid-match disconnect awards forfeit victory |
| `CODE_CHARS` | `server.ts`, `peerOnlineClient.ts` | `'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` | Ambiguity-free 6-character room code alphabet |
| `PEER_PREFIX` | `src/game/peerOnlineClient.ts` | `'tirahan-p2p-'` | PeerJS room host ID prefix (`tirahan-p2p-CODE`) for standalone WebRTC play |
| `rooms` | `server.ts` | `Map<string, OnlineRoom>` | Active private lobbies and ongoing authoritative online matches |
| `quickMatchQueue` | `server.ts` | `{ ws: WebSocket; rules: MatchRules }[]` | FIFO quick-match pairing queue |
| `socketMeta` | `server.ts` | `WeakMap<WebSocket, SocketMeta>` | Maps each socket to its active `{ roomCode, seat }` |
| `SESSION_KEY`, `WS_URL_OVERRIDE_KEY` | `src/game/onlineClient.ts` | `'tirahan_online_session'`, `'tirahan_ws_url_override'` | `sessionStorage` match recovery (WS & P2P) and `localStorage` custom WebSocket URL override |
| `RuntimeOnlineConfig` | `src/game/onlineTypes.ts` | `{ defaultTransport?, defaultWsUrl? }` | Schema for `online-config.json` auto-embedded inside downloaded itch.io `.zip` bundles |
| `OnlineTransportMode` | `src/game/onlineTypes.ts` | `'ws' \| 'p2p'` | Selects Match Server (WebSocket) vs Direct P2P (WebRTC) transport |
| `OpponentAimState` | `src/game/onlineTypes.ts` | `{ shipId, angle, isCharging }` | Opponent's live ship rotation & subtle charge status (`aim:update` / `aim:sync`) |
| `OnlineSfxCue` | `src/game/onlineTypes.ts` | `'select' \| 'fire' \| 'fire_heavy' \| 'move' \| 'bounce' \| 'shield' \| 'shield_break' \| 'explosion' \| 'mothership_explosion' \| 'asteroid_hit' \| 'asteroid_break' \| 'victory'` | Captured sound cues replayed locally on the remote client |
| `ClientToServerMessage` | `src/game/onlineTypes.ts` | Union (`room:create`, `room:join`, `room:reconnect`, `queue:join`, `queue:leave`, `aim:update`, `action:fire`, `action:move`, `match:rematch`, `room:leave`) | Shared WebSocket & WebRTC client-to-host protocol messages |
| `ServerToClientMessage` | `src/game/onlineTypes.ts` | Union (`room:created`, `queue:waiting`, `queue:cancelled`, `room:started`, `room:resynced`, `aim:sync`, `world:state`, `opponent:disconnected`, `opponent:reconnected`, `match:forfeit`, `rematch:status`, `room:error`) | Shared WebSocket & WebRTC host-to-client protocol messages |

---

## 5. Godot 4 GDScript Variables (`src/game/godotTemplate.ts` -> `tirahan_arena.gd`)

### Export & Constants

| Constant / Export | Type | Value | Purpose |
| --- | --- | --- | --- |
| `asteroid_count` | `@export_enum int` | `5` (`Off:0, Low:3, Medium:5, High:8`) | Inspector setting for random asteroid count |
| `music_enabled`, `music_path` | `@export bool / String` | `true`, `"res://mattoglseby-3.ogg"` | Background music toggle & bundled resource path |
| `ARENA_SIZE` | `Vector2` | `Vector2(1280, 760)` | Viewport logical dimensions |
| `MARGIN`, `SHIELD_RADIUS`, `SHIELD_SEGMENTS` | `float / int` | `26.0`, `104.0`, `12` | Arena border & circular shield geometry |
| `FIGHTER_ORBIT`, `MAX_MOVE_DISTANCE` | `float` | `148.0`, `155.0` | Starting Fighter orbit & max Move drag |
| `ROTATION_SENSITIVITY`, `CHARGE_FILL_DURATION` | `float` | `0.006`, `1.640625` | Aim sensitivity & full power sweep duration |
| `MIN_POWER`, `SAFE_POWER_LIMIT`, `MAX_OVERHEAT_CHANCE`, `ASYMPTOTE_K` | `float` | `0.10`, `0.75`, `0.95`, `0.88` | Charging & asymptotic overheat parameters |
| `FIGHTER_MAX_RANGE`, `MOTHERSHIP_MAX_RANGE`, `PROJECTILE_SPEED` | `float` | `392.0`, `784.0`, `780.0` | Range limits & projectile speed |
| `FIGHTER_HP`, `MOTHERSHIP_HP`, `SHIELD_HP` | `int` | `3`, `20`, `6` | Hull & shield HP values |
| `FIGHTER_DAMAGE`, `MOTHERSHIP_DAMAGE`, `KAMIKAZE_DAMAGE`, `SHIELD_COLLISION_DAMAGE`, `ASTEROID_COLLISION_DAMAGE` | `int` | `3`, `10`, `5`, `5`, `5` | Combat & collision damage values |
| `ASTEROID_MIN_RADIUS`, `ASTEROID_MAX_RADIUS`, `ASTEROID_GRAVITY_RADIUS_MULT`, `ASTEROID_GRAVITY_CONSTANT` | `float` | `20.0`, `46.0`, `3.4`, `4500.0` | Asteroid sizing & gravity field math |
| `COLLAPSE_INTERVAL` | `float` | `0.16` | Seconds between Fighter collapse explosions |
| `P1_COLOR`, `P2_COLOR`, `OVERHEAT_COLOR`, `ASTEROID_COLOR` | `Color` | `#38BDF8`, `#FB923C`, `#EF4444`, `#E4E4E7` | Vector color palette |
| `P1_BASE`, `P2_BASE` | `Vector2` | `Vector2(146, 614)`, `Vector2(1134, 146)` | Opposing corner base positions |

### Runtime Variables

| Variable | Type | Initial | Purpose |
| --- | --- | --- | --- |
| `ships`, `shield_segments`, `asteroids` | `Array[Dictionary]` | `[]` | Active ships, shield arcs, and stationary Atari gravity asteroids |
| `projectiles`, `floating_texts`, `shockwaves` | `Array[Dictionary]` | `[]` | Active shots, attacker-colored `"Kamikaze"` callouts, and shockwave rings |
| `pending_destructions`, `destruction_timer` | `Array[int]`, `float` | `[]`, `0.0` | Split-second Fighter collapse queue and timer |
| `current_turn` | `int` | `1` or `2` (random) | Randomized active player per match |
| `active_ship_idx`, `move_mode`, `dragging_move_idx`, `move_drag_pos` | `int / bool / Vector2` | `-1 / false / -1 / ZERO` | Selection & Move-mode drag state |
| `is_charging`, `charge_time`, `charge_power`, `winner` | `bool / float / int` | `false / 0.0 / MIN_POWER / 0` | Charging state & winner (`0` during play) |
| `music_player` | `AudioStreamPlayer` | `null` | Plays & loops `res://mattoglseby-3.ogg`, toggled via `B` key |

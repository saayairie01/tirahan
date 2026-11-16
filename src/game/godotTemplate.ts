export const GODOT_TIRAHAN_SCRIPT = `extends Node2D
class_name TirahanArena

# Tirahan (Space Battle) — Pure Vector Godot 4.x Prototype
# Attach this script to a Node2D in a 1280x760 viewport.
# Uses only Godot's _draw() vector primitives (no image files) on a black background.
#
# Rules & Controls:
# - Starting player is randomized via coin flip each match.
# - Click a friendly ship to activate it (click another to switch; Right-click / Esc to deselect).
# - Move mouse L/R (or A/D, Left/Right arrows) to rotate counter-clockwise / clockwise.
# - Hold Left Click or Spacebar to charge power (1.64s full cycle), release to fire at exact range.
# - Ranges: Fighters up to 392px at 100%, Mother Ships up to 784px at 100%.
# - Fighters >75% power follow an asymptotic overheat curve (up to 95% at 100%); Mother Ships safely use 100%.
# - Projectiles pierce Fighter Ships (3 dmg / 10 dmg) and spawn a 3 HP Fighter at max range.
# - Retro Atari asteroids curve projectiles via size-scaled gravity, have HP proportionate to size,
#   stop shots on impact, and destroy colliding ships (5 dmg).
# - Ships colliding with active shields (5 shield dmg), asteroids, or paper borders are destroyed.
# - Destroying a Mother Ship locks firing and explodes its surviving Fighters one by one.
# - Press M for Move Mode: drag a Fighter to reposition or ram an enemy for a Kamikaze Hit (5 HP mutual dmg + bonus turn).
# - Press B to toggle looping background music (res://mattoglseby-3.ogg).

@export_enum("Off:0", "Low:3", "Medium:5", "High:8") var asteroid_count: int = 5
@export var music_enabled: bool = true
@export var music_path: String = "res://mattoglseby-3.ogg"

const ARENA_SIZE := Vector2(1280, 760)
const MARGIN := 26.0
const SHIELD_RADIUS := 104.0
const SHIELD_SEGMENTS := 12
const FIGHTER_ORBIT := 148.0
const MAX_MOVE_DISTANCE := 155.0
const ROTATION_SENSITIVITY := 0.006
const CHARGE_FILL_DURATION := 1.640625
const MIN_POWER := 0.10
const SAFE_POWER_LIMIT := 0.75
const MAX_OVERHEAT_CHANCE := 0.95
const ASYMPTOTE_K := 0.88
const FIGHTER_MAX_RANGE := 392.0
const MOTHERSHIP_MAX_RANGE := 784.0
const PROJECTILE_SPEED := 780.0

const FIGHTER_HP := 3
const MOTHERSHIP_HP := 20
const SHIELD_HP := 6
const FIGHTER_DAMAGE := 3
const MOTHERSHIP_DAMAGE := 10
const KAMIKAZE_DAMAGE := 5
const SHIELD_COLLISION_DAMAGE := 5
const ASTEROID_COLLISION_DAMAGE := 5

const ASTEROID_MIN_RADIUS := 20.0
const ASTEROID_MAX_RADIUS := 46.0
const ASTEROID_GRAVITY_RADIUS_MULT := 3.4
const ASTEROID_GRAVITY_CONSTANT := 4500.0
const COLLAPSE_INTERVAL := 0.16

const P1_COLOR := Color("#38BDF8")
const P2_COLOR := Color("#FB923C")
const OVERHEAT_COLOR := Color("#EF4444")
const ASTEROID_COLOR := Color("#E4E4E7")

const P1_BASE := Vector2(146, 614)
const P2_BASE := Vector2(1134, 146)

var ships: Array[Dictionary] = []
var shield_segments: Array[Dictionary] = []
var asteroids: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []
var floating_texts: Array[Dictionary] = []
var shockwaves: Array[Dictionary] = []
var pending_destructions: Array[int] = []
var destruction_timer: float = 0.0

var current_turn: int = 1
var active_ship_idx: int = -1
var move_mode: bool = false
var dragging_move_idx: int = -1
var move_drag_pos: Vector2 = Vector2.ZERO
var is_charging: bool = false
var charge_time: float = 0.0
var charge_power: float = MIN_POWER
var winner: int = 0
var music_player: AudioStreamPlayer

func _ready() -> void:
\trandomize()
\tRenderingServer.set_default_clear_color(Color.BLACK)
\t_setup_music()
\t_setup_match()

func _setup_music() -> void:
\tmusic_player = AudioStreamPlayer.new()
\tmusic_player.volume_db = -8.0
\tadd_child(music_player)
\tif ResourceLoader.exists(music_path):
\t\tvar stream := load(music_path)
\t\tif stream is AudioStreamOggVorbis:
\t\t\tstream.loop = true
\t\tmusic_player.stream = stream
\t\tif music_enabled:
\t\t\tmusic_player.play()

func _setup_match() -> void:
\tships.clear()
\tshield_segments.clear()
\tasteroids.clear()
\tprojectiles.clear()
\tfloating_texts.clear()
\tshockwaves.clear()
\tpending_destructions.clear()
\tdestruction_timer = 0.0
\tcurrent_turn = 1 if randf() < 0.5 else 2
\tactive_ship_idx = -1
\tmove_mode = false
\tdragging_move_idx = -1
\tis_charging = false
\tcharge_time = 0.0
\tcharge_power = MIN_POWER
\twinner = 0

\tvar p1_angle := (P2_BASE - P1_BASE).angle()
\tvar p2_angle := (P1_BASE - P2_BASE).angle()

\tships.append({ "owner": 1, "kind": "mothership", "pos": P1_BASE, "angle": p1_angle, "radius": 34.0, "hp": MOTHERSHIP_HP })
\tships.append({ "owner": 2, "kind": "mothership", "pos": P2_BASE, "angle": p2_angle, "radius": 34.0, "hp": MOTHERSHIP_HP })

\tvar seg_step := TAU / float(SHIELD_SEGMENTS)
\tfor owner in [1, 2]:
\t\tvar base: Vector2 = P1_BASE if owner == 1 else P2_BASE
\t\tfor i in range(SHIELD_SEGMENTS):
\t\t\tshield_segments.append({
\t\t\t\t"owner": owner,
\t\t\t\t"center": base,
\t\t\t\t"start": float(i) * seg_step,
\t\t\t\t"end": float(i + 1) * seg_step,
\t\t\t\t"hp": SHIELD_HP
\t\t\t})

\tvar offsets := [-0.92, -0.46, 0.0, 0.46, 0.92]
\tfor offset in offsets:
\t\tvar a1: float = p1_angle + offset
\t\tships.append({
\t\t\t"owner": 1, "kind": "fighter",
\t\t\t"pos": P1_BASE + Vector2.from_angle(a1) * FIGHTER_ORBIT,
\t\t\t"angle": p1_angle, "radius": 15.0, "hp": FIGHTER_HP
\t\t})
\t\tvar a2: float = p2_angle + offset
\t\tships.append({
\t\t\t"owner": 2, "kind": "fighter",
\t\t\t"pos": P2_BASE + Vector2.from_angle(a2) * FIGHTER_ORBIT,
\t\t\t"angle": p2_angle, "radius": 15.0, "hp": FIGHTER_HP
\t\t})

\t_generate_asteroids()
\tqueue_redraw()

func _generate_asteroids() -> void:
\tfor _i in range(asteroid_count):
\t\tfor _attempt in range(90):
\t\t\tvar radius := roundf(randf_range(ASTEROID_MIN_RADIUS, ASTEROID_MAX_RADIUS))
\t\t\tvar pad := MARGIN + radius + 34.0
\t\t\tvar pos := Vector2(randf_range(pad, ARENA_SIZE.x - pad), randf_range(pad, ARENA_SIZE.y - pad))
\t\t\tif pos.distance_to(P1_BASE) < FIGHTER_ORBIT + radius + 72.0:
\t\t\t\tcontinue
\t\t\tif pos.distance_to(P2_BASE) < FIGHTER_ORBIT + radius + 72.0:
\t\t\t\tcontinue
\t\t\tvar overlaps := false
\t\t\tfor other in asteroids:
\t\t\t\tif pos.distance_to(other["pos"]) < radius + float(other["radius"]) + 54.0:
\t\t\t\t\toverlaps = true
\t\t\t\t\tbreak
\t\t\tif overlaps:
\t\t\t\tcontinue
\t\t\tvar v_count := randi_range(10, 12)
\t\t\tvar verts := PackedVector2Array()
\t\t\tfor v in range(v_count):
\t\t\t\tvar a := (float(v) / float(v_count)) * TAU + randf_range(-0.09, 0.09)
\t\t\t\tvar jag := randf_range(0.72, 1.14)
\t\t\t\tverts.append(Vector2.from_angle(a) * (radius * jag))
\t\t\tverts.append(verts[0])
\t\t\tvar max_hp := maxi(3, roundi(radius * 0.3))
\t\t\tasteroids.append({
\t\t\t\t"pos": pos,
\t\t\t\t"radius": radius,
\t\t\t\t"gravity_radius": radius * ASTEROID_GRAVITY_RADIUS_MULT,
\t\t\t\t"gravity_strength": ASTEROID_GRAVITY_CONSTANT * radius * radius,
\t\t\t\t"hp": max_hp,
\t\t\t\t"max_hp": max_hp,
\t\t\t\t"verts": verts,
\t\t\t\t"rotation": randf() * TAU,
\t\t\t\t"rot_speed": 0.0
\t\t\t})
\t\t\tbreak

func _input(event: InputEvent) -> void:
\tif event is InputEventKey and not event.echo and event.pressed and event.keycode == KEY_B:
\t\tmusic_enabled = not music_enabled
\t\tif music_player and music_player.stream:
\t\t\tif music_enabled:
\t\t\t\tif not music_player.playing:
\t\t\t\t\tmusic_player.play()
\t\t\t\tmusic_player.stream_paused = false
\t\t\telse:
\t\t\t\tmusic_player.stream_paused = true
\t\treturn

\tif winner != 0 or not projectiles.is_empty():
\t\treturn

\tif event is InputEventMouseButton:
\t\tif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
\t\t\tactive_ship_idx = -1
\t\t\tdragging_move_idx = -1
\t\t\tis_charging = false
\t\t\tqueue_redraw()
\t\t\treturn

\t\tif event.button_index == MOUSE_BUTTON_LEFT:
\t\t\tif move_mode:
\t\t\t\tif event.pressed:
\t\t\t\t\tvar idx := _find_ship(event.position, current_turn)
\t\t\t\t\tif idx != -1 and ships[idx]["kind"] == "fighter":
\t\t\t\t\t\tdragging_move_idx = idx
\t\t\t\t\t\tmove_drag_pos = event.position
\t\t\t\telif dragging_move_idx != -1:
\t\t\t\t\t_execute_move(dragging_move_idx, event.position)
\t\t\t\t\tdragging_move_idx = -1
\t\t\t\t\tmove_mode = false
\t\t\t\tqueue_redraw()
\t\t\t\treturn

\t\t\tif event.pressed:
\t\t\t\tvar clicked_idx := _find_ship(event.position, current_turn)
\t\t\t\tif clicked_idx != -1 and clicked_idx != active_ship_idx:
\t\t\t\t\tactive_ship_idx = clicked_idx
\t\t\t\t\tis_charging = false
\t\t\t\t\tcharge_time = 0.0
\t\t\t\t\tcharge_power = MIN_POWER
\t\t\t\telif active_ship_idx != -1:
\t\t\t\t\tis_charging = true
\t\t\t\t\tcharge_time = 0.0
\t\t\t\t\tcharge_power = MIN_POWER
\t\t\telif is_charging and active_ship_idx != -1:
\t\t\t\t_fire_active_ship()
\t\t\tqueue_redraw()

\telif event is InputEventMouseMotion:
\t\tif dragging_move_idx != -1:
\t\t\tmove_drag_pos = event.position
\t\t\tqueue_redraw()
\t\telif not move_mode and active_ship_idx != -1 and not is_charging:
\t\t\tships[active_ship_idx]["angle"] = float(ships[active_ship_idx]["angle"]) + event.relative.x * ROTATION_SENSITIVITY
\t\t\tqueue_redraw()

\telif event is InputEventKey and not event.echo:
\t\tif event.keycode == KEY_M and event.pressed and not is_charging:
\t\t\tmove_mode = not move_mode
\t\t\tactive_ship_idx = -1
\t\t\tdragging_move_idx = -1
\t\t\tqueue_redraw()
\t\telif event.keycode == KEY_ESCAPE and event.pressed:
\t\t\tactive_ship_idx = -1
\t\t\tdragging_move_idx = -1
\t\t\tis_charging = false
\t\t\tqueue_redraw()
\t\telif event.keycode == KEY_SPACE and not move_mode and active_ship_idx != -1:
\t\t\tif event.pressed and not is_charging:
\t\t\t\tis_charging = true
\t\t\t\tcharge_time = 0.0
\t\t\t\tcharge_power = MIN_POWER
\t\t\telif not event.pressed and is_charging:
\t\t\t\t_fire_active_ship()
\t\t\tqueue_redraw()

func _is_touching_border(pos: Vector2, radius: float) -> bool:
\treturn pos.x - radius <= MARGIN or pos.x + radius >= ARENA_SIZE.x - MARGIN or pos.y - radius <= MARGIN or pos.y + radius >= ARENA_SIZE.y - MARGIN

func _find_shield_at(pos: Vector2, radius: float) -> int:
\tfor i in range(shield_segments.size()):
\t\tvar seg: Dictionary = shield_segments[i]
\t\tif int(seg["hp"]) <= 0:
\t\t\tcontinue
\t\tif absf(pos.distance_to(seg["center"]) - SHIELD_RADIUS) <= radius:
\t\t\tvar a := fposmod((pos - Vector2(seg["center"])).angle(), TAU)
\t\t\tif a >= float(seg["start"]) and a <= float(seg["end"]):
\t\t\t\treturn i
\treturn -1

func _find_asteroid_at(pos: Vector2, radius: float) -> int:
\tfor i in range(asteroids.size()):
\t\tvar ast: Dictionary = asteroids[i]
\t\tif int(ast["hp"]) <= 0:
\t\t\tcontinue
\t\tif pos.distance_to(ast["pos"]) <= float(ast["radius"]) + radius:
\t\t\treturn i
\treturn -1

func _damage_asteroid(idx: int, dmg: int) -> void:
\tvar ast: Dictionary = asteroids[idx]
\tast["hp"] = maxi(0, int(ast["hp"]) - dmg)
\tif int(ast["hp"]) <= 0:
\t\tshockwaves.append({ "pos": ast["pos"], "radius": 6.0, "max_radius": float(ast["radius"]) * 1.9, "life": 0.4, "max_life": 0.4, "color": ASTEROID_COLOR })
\t\tasteroids.remove_at(idx)

func _trigger_mothership_collapse(defeated_owner: int, mother_pos: Vector2) -> void:
\twinner = 2 if defeated_owner == 1 else 1
\tactive_ship_idx = -1
\tis_charging = false
\tdragging_move_idx = -1
\tmove_mode = false
\tprojectiles.clear()
\tpending_destructions.clear()
\tfor k in range(ships.size()):
\t\tif int(ships[k]["hp"]) > 0 and int(ships[k]["owner"]) == defeated_owner and ships[k]["kind"] == "fighter":
\t\t\tpending_destructions.append(k)
\tpending_destructions.sort_custom(func(a: int, b: int) -> bool: return Vector2(ships[a]["pos"]).distance_to(mother_pos) < Vector2(ships[b]["pos"]).distance_to(mother_pos))
\tdestruction_timer = COLLAPSE_INTERVAL if not pending_destructions.is_empty() else 0.0

func _execute_move(ship_idx: int, raw_target: Vector2) -> void:
\tif winner != 0:
\t\treturn
\tvar ship: Dictionary = ships[ship_idx]
\tvar origin: Vector2 = ship["pos"]
\tvar delta := raw_target - origin
\tif delta.length() < 12.0:
\t\treturn
\tvar target := origin + delta.limit_length(MAX_MOVE_DISTANCE)
\tvar steps := maxi(1, ceili((target - origin).length() / 3.0))
\tvar radius := float(ship["radius"])
\tvar attacker_col: Color = P1_COLOR if int(ship["owner"]) == 1 else P2_COLOR

\tfor i in range(1, steps + 1):
\t\tvar pt := origin.lerp(target, float(i) / float(steps))
\t\tif _is_touching_border(pt, radius):
\t\t\tship["hp"] = 0
\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\treturn
\t\tvar sh_idx := _find_shield_at(pt, radius)
\t\tif sh_idx != -1:
\t\t\tship["hp"] = 0
\t\t\tshield_segments[sh_idx]["hp"] = maxi(0, int(shield_segments[sh_idx]["hp"]) - SHIELD_COLLISION_DAMAGE)
\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\treturn
\t\tvar ast_idx := _find_asteroid_at(pt, radius)
\t\tif ast_idx != -1:
\t\t\tship["hp"] = 0
\t\t\t_damage_asteroid(ast_idx, ASTEROID_COLLISION_DAMAGE)
\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\treturn
\t\tvar hit_enemy := false
\t\tvar hit_any := false
\t\tfor j in range(ships.size()):
\t\t\tif j == ship_idx or int(ships[j]["hp"]) <= 0:
\t\t\t\tcontinue
\t\t\tif pt.distance_to(ships[j]["pos"]) <= radius + float(ships[j]["radius"]):
\t\t\t\thit_any = true
\t\t\t\tif int(ships[j]["owner"]) != int(ship["owner"]):
\t\t\t\t\thit_enemy = true
\t\t\t\tships[j]["hp"] = int(ships[j]["hp"]) - KAMIKAZE_DAMAGE
\t\t\t\tif ships[j]["kind"] == "mothership" and int(ships[j]["hp"]) <= 0:
\t\t\t\t\t_trigger_mothership_collapse(int(ships[j]["owner"]), ships[j]["pos"])
\t\tif hit_any:
\t\t\tship["pos"] = pt
\t\t\tship["hp"] = int(ship["hp"]) - KAMIKAZE_DAMAGE
\t\t\tif hit_enemy:
\t\t\t\t_spawn_floating_text("Kamikaze", pt + Vector2(0, -12), attacker_col)
\t\t\tif winner == 0 and not hit_enemy:
\t\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\treturn

\tship["pos"] = target
\tvar enemy_base := P2_BASE if int(ship["owner"]) == 1 else P1_BASE
\tship["angle"] = (enemy_base - target).angle()
\tcurrent_turn = 2 if current_turn == 1 else 1

func _get_overheat_chance(power: float, kind: String) -> float:
\tif kind == "mothership":
\t\treturn 0.0
\tvar pct := roundi(clampf(power, 0.0, 1.0) * 100.0)
\tif pct <= 75:
\t\treturn 0.0
\tvar t := float(pct - 75) / 25.0
\tvar raw := 1.0 / (1.0 - ASYMPTOTE_K * t) - 1.0
\tvar max_raw := 1.0 / (1.0 - ASYMPTOTE_K) - 1.0
\treturn (raw / max_raw) * MAX_OVERHEAT_CHANCE

func _fire_active_ship() -> void:
\tif active_ship_idx == -1 or winner != 0:
\t\treturn
\tvar ship: Dictionary = ships[active_ship_idx]
\tvar overheat_chance := _get_overheat_chance(charge_power, str(ship["kind"]))

\tif overheat_chance > 0.0 and randf() < overheat_chance:
\t\tship["hp"] = 0
\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\tactive_ship_idx = -1
\t\tis_charging = false
\t\tcharge_time = 0.0
\t\treturn

\tvar is_mother := ship["kind"] == "mothership"
\tvar max_range := (MOTHERSHIP_MAX_RANGE if is_mother else FIGHTER_MAX_RANGE) * charge_power
\tvar dmg := MOTHERSHIP_DAMAGE if is_mother else FIGHTER_DAMAGE
\tvar angle := float(ship["angle"])
\tvar dir := Vector2.from_angle(angle)
\tprojectiles.append({
\t\t"owner": current_turn,
\t\t"source_idx": active_ship_idx,
\t\t"hit_indices": [],
\t\t"pos": Vector2(ship["pos"]) + dir * (float(ship["radius"]) + 8.0),
\t\t"vel": dir * PROJECTILE_SPEED,
\t\t"damage": dmg,
\t\t"traveled": 0.0,
\t\t"max_range": max_range
\t})
\tactive_ship_idx = -1
\tis_charging = false
\tcharge_time = 0.0

func _spawn_fighter_at_end(owner: int, pos: Vector2) -> bool:
\tvar spawn_radius := 15.0
\tif _is_touching_border(pos, spawn_radius):
\t\treturn false
\tvar sh_idx := _find_shield_at(pos, spawn_radius)
\tif sh_idx != -1:
\t\tshield_segments[sh_idx]["hp"] = maxi(0, int(shield_segments[sh_idx]["hp"]) - SHIELD_COLLISION_DAMAGE)
\t\treturn false
\tvar ast_idx := _find_asteroid_at(pos, spawn_radius)
\tif ast_idx != -1:
\t\t_damage_asteroid(ast_idx, ASTEROID_COLLISION_DAMAGE)
\t\treturn false

\tvar enemy_base := P2_BASE if owner == 1 else P1_BASE
\tvar attacker_col: Color = P1_COLOR if owner == 1 else P2_COLOR
\tvar spawned := {
\t\t"owner": owner,
\t\t"kind": "fighter",
\t\t"pos": pos,
\t\t"angle": (enemy_base - pos).angle(),
\t\t"radius": spawn_radius,
\t\t"hp": FIGHTER_HP
\t}
\tvar overlapped := false
\tvar hit_enemy := false
\tfor other in ships:
\t\tif int(other["hp"]) <= 0:
\t\t\tcontinue
\t\tif pos.distance_to(other["pos"]) <= spawn_radius + float(other["radius"]):
\t\t\toverlapped = true
\t\t\tif int(other["owner"]) != owner:
\t\t\t\thit_enemy = true
\t\t\tother["hp"] = int(other["hp"]) - KAMIKAZE_DAMAGE
\t\t\tif other["kind"] == "mothership" and int(other["hp"]) <= 0:
\t\t\t\t_trigger_mothership_collapse(int(other["owner"]), other["pos"])
\tif overlapped:
\t\tspawned["hp"] = int(spawned["hp"]) - KAMIKAZE_DAMAGE
\tif hit_enemy:
\t\t_spawn_floating_text("Kamikaze", pos + Vector2(0, -12), attacker_col)
\tif int(spawned["hp"]) > 0:
\t\tships.append(spawned)
\treturn hit_enemy and winner == 0

func _spawn_floating_text(text: String, pos: Vector2, col: Color) -> void:
\tfloating_texts.append({
\t\t"text": text,
\t\t"pos": pos,
\t\t"vy": -28.0,
\t\t"life": 0.95,
\t\t"max_life": 0.95,
\t\t"color": col
\t})

func _process(delta: float) -> void:
\tvar redraw_needed := false

\tfor sw_idx in range(shockwaves.size() - 1, -1, -1):
\t\tvar sw: Dictionary = shockwaves[sw_idx]
\t\tsw["life"] = float(sw["life"]) - delta
\t\tvar progress := 1.0 - maxf(0.0, float(sw["life"]) / float(sw["max_life"]))
\t\tsw["radius"] = float(sw["max_radius"]) * (0.2 + 0.8 * progress)
\t\tredraw_needed = true
\t\tif float(sw["life"]) <= 0.0:
\t\t\tshockwaves.remove_at(sw_idx)

\tfor ft_idx in range(floating_texts.size() - 1, -1, -1):
\t\tvar ft: Dictionary = floating_texts[ft_idx]
\t\tft["pos"] = Vector2(ft["pos"]) + Vector2(0.0, float(ft["vy"]) * delta)
\t\tft["life"] = float(ft["life"]) - delta
\t\tredraw_needed = true
\t\tif float(ft["life"]) <= 0.0:
\t\t\tfloating_texts.remove_at(ft_idx)

\tif winner != 0 and not pending_destructions.is_empty():
\t\tdestruction_timer -= delta
\t\tif destruction_timer <= 0.0:
\t\t\tvar next_idx: int = pending_destructions.pop_front()
\t\t\tif int(ships[next_idx]["hp"]) > 0:
\t\t\t\tships[next_idx]["hp"] = 0
\t\t\t\tvar col: Color = P1_COLOR if int(ships[next_idx]["owner"]) == 1 else P2_COLOR
\t\t\t\tshockwaves.append({ "pos": ships[next_idx]["pos"], "radius": 6.0, "max_radius": 54.0, "life": 0.34, "max_life": 0.34, "color": col })
\t\t\tdestruction_timer = COLLAPSE_INTERVAL if not pending_destructions.is_empty() else 0.0
\t\t\tredraw_needed = true

\tif is_charging and active_ship_idx != -1 and winner == 0:
\t\tcharge_time += delta
\t\tvar cycle := charge_time / CHARGE_FILL_DURATION
\t\tvar tri := 1.0 - absf(fmod(cycle, 2.0) - 1.0)
\t\tcharge_power = MIN_POWER + tri * (1.0 - MIN_POWER)
\t\tqueue_redraw()
\t\treturn

\tif not move_mode and active_ship_idx != -1 and not is_charging and projectiles.is_empty() and winner == 0:
\t\tvar key_dir := 0.0
\t\tif Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A):
\t\t\tkey_dir -= 1.0
\t\tif Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D):
\t\t\tkey_dir += 1.0
\t\tif key_dir != 0.0:
\t\t\tships[active_ship_idx]["angle"] = float(ships[active_ship_idx]["angle"]) + key_dir * 2.1 * delta
\t\t\tredraw_needed = true

\tif projectiles.is_empty():
\t\tif redraw_needed:
\t\t\tqueue_redraw()
\t\treturn

\tvar sub_steps := 6
\tvar sub_dt := delta / float(sub_steps)
\tfor i in range(projectiles.size() - 1, -1, -1):
\t\tvar p: Dictionary = projectiles[i]
\t\tvar removed := false
\t\tfor _s in range(sub_steps):
\t\t\tvar prev_pos: Vector2 = p["pos"]
\t\t\tvar grav := Vector2.ZERO
\t\t\tfor ast in asteroids:
\t\t\t\tvar to_ast := Vector2(ast["pos"]) - prev_pos
\t\t\t\tvar d := to_ast.length()
\t\t\t\tif d > 0.001 and d <= float(ast["gravity_radius"]):
\t\t\t\t\tvar eff_d := maxf(d, float(ast["radius"]) + 6.0)
\t\t\t\t\tvar fade := maxf(0.15, 1.0 - pow(d / float(ast["gravity_radius"]), 2.0))
\t\t\t\t\tvar accel := (float(ast["gravity_strength"]) / (eff_d * eff_d)) * fade
\t\t\t\t\tgrav += to_ast.normalized() * accel
\t\t\tif grav != Vector2.ZERO:
\t\t\t\tvar new_vel := (Vector2(p["vel"]) + grav * sub_dt)
\t\t\t\tif new_vel.length() > 0.001:
\t\t\t\t\tp["vel"] = new_vel.normalized() * PROJECTILE_SPEED

\t\t\tvar step_vec: Vector2 = Vector2(p["vel"]) * sub_dt
\t\t\tvar step_len := step_vec.length()
\t\t\tvar remaining := float(p["max_range"]) - float(p["traveled"])
\t\t\tvar reached_range := false
\t\t\tif step_len >= remaining:
\t\t\t\tstep_vec = step_vec.normalized() * maxf(0.0, remaining)
\t\t\t\treached_range = true
\t\t\tvar next_pos: Vector2 = prev_pos + step_vec
\t\t\tp["pos"] = next_pos
\t\t\tp["traveled"] = float(p["traveled"]) + step_vec.length()

\t\t\tif next_pos.x < MARGIN or next_pos.x > ARENA_SIZE.x - MARGIN or next_pos.y < MARGIN or next_pos.y > ARENA_SIZE.y - MARGIN:
\t\t\t\tprojectiles.remove_at(i)
\t\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\t\tremoved = true
\t\t\t\tbreak

\t\t\tvar hit_shield := false
\t\t\tfor seg in shield_segments:
\t\t\t\tif int(seg["hp"]) <= 0 or int(seg["owner"]) == int(p["owner"]):
\t\t\t\t\tcontinue
\t\t\t\tvar d_prev := prev_pos.distance_to(seg["center"])
\t\t\t\tvar d_next := next_pos.distance_to(seg["center"])
\t\t\t\tif (d_prev >= SHIELD_RADIUS and d_next <= SHIELD_RADIUS) or absf(d_next - SHIELD_RADIUS) < 4.0:
\t\t\t\t\tvar a := fposmod((next_pos - Vector2(seg["center"])).angle(), TAU)
\t\t\t\t\tif a >= float(seg["start"]) and a <= float(seg["end"]):
\t\t\t\t\t\tseg["hp"] = maxi(0, int(seg["hp"]) - int(p["damage"]))
\t\t\t\t\t\tprojectiles.remove_at(i)
\t\t\t\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\t\t\t\thit_shield = true
\t\t\t\t\t\tbreak
\t\t\tif hit_shield:
\t\t\t\tremoved = true
\t\t\t\tbreak

\t\t\tvar ast_hit := _find_asteroid_at(next_pos, 3.0)
\t\t\tif ast_hit != -1:
\t\t\t\t_damage_asteroid(ast_hit, int(p["damage"]))
\t\t\t\tprojectiles.remove_at(i)
\t\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\t\tremoved = true
\t\t\t\tbreak

\t\t\tvar mothership_hit := false
\t\t\tfor s_idx in range(ships.size()):
\t\t\t\tvar ship: Dictionary = ships[s_idx]
\t\t\t\tif int(ship["hp"]) <= 0:
\t\t\t\t\tcontinue
\t\t\t\tif s_idx == int(p["source_idx"]):
\t\t\t\t\tcontinue
\t\t\t\tif ship["kind"] == "mothership" and int(ship["owner"]) == int(p["owner"]):
\t\t\t\t\tcontinue
\t\t\t\tvar hit_list: Array = p["hit_indices"]
\t\t\t\tif hit_list.has(s_idx):
\t\t\t\t\tcontinue
\t\t\t\tif next_pos.distance_to(ship["pos"]) <= float(ship["radius"]) + 4.0:
\t\t\t\t\thit_list.append(s_idx)
\t\t\t\t\tship["hp"] = int(ship["hp"]) - int(p["damage"])
\t\t\t\t\tif ship["kind"] == "mothership":
\t\t\t\t\t\tif int(ship["hp"]) <= 0:
\t\t\t\t\t\t\t_trigger_mothership_collapse(int(ship["owner"]), ship["pos"])
\t\t\t\t\t\telse:
\t\t\t\t\t\t\tprojectiles.remove_at(i)
\t\t\t\t\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\t\t\t\tmothership_hit = true
\t\t\t\t\t\tbreak
\t\t\tif mothership_hit:
\t\t\t\tremoved = true
\t\t\t\tbreak

\t\t\tif reached_range:
\t\t\t\tvar bonus_turn := _spawn_fighter_at_end(int(p["owner"]), next_pos)
\t\t\t\tif not projectiles.is_empty() and i < projectiles.size():
\t\t\t\t\tprojectiles.remove_at(i)
\t\t\t\tif winner == 0 and not bonus_turn:
\t\t\t\t\tcurrent_turn = 2 if current_turn == 1 else 1
\t\t\t\tremoved = true
\t\t\t\tbreak
\t\tif removed:
\t\t\tcontinue
\tqueue_redraw()

func _find_ship(point: Vector2, owner: int) -> int:
\tfor i in range(ships.size()):
\t\tvar s := ships[i]
\t\tif int(s["hp"]) > 0 and int(s["owner"]) == owner and point.distance_to(s["pos"]) <= float(s["radius"]) + 14.0:
\t\t\treturn i
\treturn -1

func _draw() -> void:
\tdraw_rect(Rect2(Vector2.ZERO, ARENA_SIZE), Color.BLACK)
\tdraw_rect(Rect2(MARGIN, MARGIN, ARENA_SIZE.x - MARGIN * 2.0, ARENA_SIZE.y - MARGIN * 2.0), Color(1, 1, 1, 0.16), false, 1.0)

\tfor ast in asteroids:
\t\tvar grav_col := Color(ASTEROID_COLOR.r, ASTEROID_COLOR.g, ASTEROID_COLOR.b, 0.14)
\t\tdraw_arc(ast["pos"], float(ast["gravity_radius"]), 0.0, TAU, 48, grav_col, 1.0, true)
\t\tdraw_set_transform(ast["pos"], float(ast["rotation"]), Vector2.ONE)
\t\tdraw_polyline(ast["verts"], ASTEROID_COLOR, 1.8, true)
\t\tdraw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

\tfor seg in shield_segments:
\t\tif int(seg["hp"]) <= 0:
\t\t\tcontinue
\t\tvar col: Color = P1_COLOR if int(seg["owner"]) == 1 else P2_COLOR
\t\tcol.a = 0.9 if int(seg["hp"]) > 3 else 0.45
\t\tdraw_arc(seg["center"], SHIELD_RADIUS, float(seg["start"]) + 0.03, float(seg["end"]) - 0.03, 12, col, 2.2, true)

\tfor i in range(ships.size()):
\t\tvar ship: Dictionary = ships[i]
\t\tif int(ship["hp"]) <= 0:
\t\t\tcontinue
\t\tvar col: Color = P1_COLOR if int(ship["owner"]) == 1 else P2_COLOR
\t\tif i == active_ship_idx and not move_mode:
\t\t\tdraw_arc(ship["pos"], float(ship["radius"]) + 11.0, 0.0, TAU, 32, Color.WHITE, 1.5, true)
\t\t\tif is_charging:
\t\t\t\tvar ring_r := float(ship["radius"]) + 16.0
\t\t\t\tvar can_overheat := ship["kind"] != "mothership"
\t\t\t\tvar safe_end := -PI * 0.5 + (minf(charge_power, SAFE_POWER_LIMIT) if can_overheat else charge_power) * TAU
\t\t\t\tdraw_arc(ship["pos"], ring_r, -PI * 0.5, safe_end, 32, col, 3.0, true)
\t\t\t\tif can_overheat and charge_power > SAFE_POWER_LIMIT:
\t\t\t\t\tdraw_arc(ship["pos"], ring_r, -PI * 0.5 + SAFE_POWER_LIMIT * TAU, -PI * 0.5 + charge_power * TAU, 16, OVERHEAT_COLOR, 3.0, true)

\t\tif ship["kind"] == "mothership":
\t\t\t_draw_mothership(ship["pos"], ship["angle"], col)
\t\telse:
\t\t\t_draw_fighter(ship["pos"], ship["angle"], col)

\tif dragging_move_idx != -1:
\t\tvar ms: Dictionary = ships[dragging_move_idx]
\t\tvar origin: Vector2 = ms["pos"]
\t\tvar tgt: Vector2 = origin + (move_drag_pos - origin).limit_length(MAX_MOVE_DISTANCE)
\t\tvar move_col: Color = P1_COLOR if int(ms["owner"]) == 1 else P2_COLOR
\t\tdraw_arc(origin, MAX_MOVE_DISTANCE, 0.0, TAU, 48, Color(1, 1, 1, 0.25), 1.2, true)
\t\tdraw_dashed_line(origin, tgt, move_col, 1.5, 5.0)
\t\tdraw_arc(tgt, float(ms["radius"]), 0.0, TAU, 24, move_col, 1.5, true)

\tfor p in projectiles:
\t\tvar col: Color = P1_COLOR if int(p["owner"]) == 1 else P2_COLOR
\t\tdraw_circle(p["pos"], 4.0, col)

\tfor sw in shockwaves:
\t\tvar sw_col: Color = sw["color"]
\t\tsw_col.a = maxf(0.0, float(sw["life"]) / float(sw["max_life"])) * 0.8
\t\tdraw_arc(sw["pos"], float(sw["radius"]), 0.0, TAU, 32, sw_col, 1.5, true)

\tfor ft in floating_texts:
\t\tvar ratio := maxf(0.0, float(ft["life"]) / float(ft["max_life"]))
\t\tvar alpha := 1.0 if ratio > 0.65 else ratio / 0.65
\t\tvar col: Color = ft["color"]
\t\tcol.a = alpha
\t\tdraw_string(ThemeDB.fallback_font, Vector2(ft["pos"]) - Vector2(60.0, 0.0), str(ft["text"]), HORIZONTAL_ALIGNMENT_CENTER, 120.0, 13, col)

func _draw_mothership(pos: Vector2, angle: float, col: Color) -> void:
\tvar pts := PackedVector2Array([
\t\tVector2(34, 0), Vector2(6, -15), Vector2(-10, -28), Vector2(-28, -22),
\t\tVector2(-20, -9), Vector2(-30, 0), Vector2(-20, 9), Vector2(-28, 22),
\t\tVector2(-10, 28), Vector2(6, 15), Vector2(34, 0)
\t])
\tdraw_set_transform(pos, angle, Vector2.ONE)
\tdraw_polyline(pts, col, 2.0, true)
\tdraw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_fighter(pos: Vector2, angle: float, col: Color) -> void:
\tvar pts := PackedVector2Array([
\t\tVector2(15, 0), Vector2(-9, -11), Vector2(-5, 0), Vector2(-9, 11), Vector2(15, 0)
\t])
\tdraw_set_transform(pos, angle, Vector2.ONE)
\tdraw_polyline(pts, col, 1.8, true)
\tdraw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
`;

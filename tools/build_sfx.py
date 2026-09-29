#!/usr/bin/env python3
"""Build assets/sfx from open sound libraries.

Sources (not stored in this repo):
  0 A.D. by Wildfire Games, audio under CC BY-SA 3.0:
      git clone --depth 1 --filter=blob:none --sparse https://github.com/0ad/0ad
      git sparse-checkout set --no-cone 'binaries/data/mods/public/audio/*'
  uisfx (npm package, audio under CC0 1.0): npm pack uisfx
  tools/sfx-src: clips supplied with the project (see assets/sfx/CREDITS.md)
Each clip has leading silence trimmed, is capped in length, faded out, peak-normalised
and encoded as mono MP3. Usage: build_sfx.py <0ad audio dir> <uisfx sounds dir> <out dir>
"""
import os, re, subprocess, sys
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
OAD, UI, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sfx-src")

# name: (library, [source files], max seconds, fade seconds)
CLIPS = {
    # melee
    "clash":      ("0ad", ["attack/weapon/swordhit_%d.ogg" % n for n in (10, 11, 12, 13, 15, 17)], 0.6, 0.12),
    "swing":      ("0ad", ["attack/weapon/sword_attack_%02d.ogg" % n for n in (1, 2, 3, 4)], 0.9, 0.2),
    "thrust":     ("0ad", ["attack/weapon/spear_attack_%02d.ogg" % n for n in (1, 2, 3, 4)], 0.75, 0.15),
    "shield":     ("0ad", ["attack/impact/shield_wood_%02d.ogg" % n for n in (1, 2, 3, 4)] + ["attack/impact/shield_metal_%02d.ogg" % n for n in (1, 2)], 0.5, 0.15),
    "flesh":      ("0ad", ["attack/impact/fleshimp_%d.ogg" % n for n in (10, 11, 12)] + ["attack/impact/fleshstab_%02d.ogg" % n for n in (1, 2, 3)], 0.6, 0.15),
    "death":      ("0ad", ["actor/human/death/male_death_%02d.ogg" % n for n in (1, 3, 5, 7, 9, 12)], 1.2, 0.3),
    "horse_death":("0ad", ["actor/mounted/death/death_horse_10.ogg", "actor/mounted/death/death_horse_11.ogg"], 1.8, 0.4),
    # ranged
    "bow":        ("0ad", ["attack/weapon/bow_attack_%02d.ogg" % n for n in (1, 2, 3, 4)], 1.4, 0.4),
    "arrow":      ("0ad", ["attack/weapon/arrowfly_%02d.ogg" % n for n in (1, 2, 3, 4)], 0.6, 0.15),
    "arrow_miss": ("0ad", ["attack/impact/arrow_dirt_%02d.ogg" % n for n in (1, 2, 3, 4)], 0.45, 0.12),
    "arrow_hit":  ("0ad", ["attack/impact/arrow_metal_%02d.ogg" % n for n in (1, 2, 3)] + ["attack/impact/arrow_wood_%02d.ogg" % n for n in (1, 2)], 0.45, 0.12),
    "gun":        ("0ad", ["attack/weapon/Musket_%d.ogg" % n for n in (1, 2, 3)], 1.5, 0.5),
    "ballista":   ("0ad", ["attack/siege/ballist_attack_01.ogg", "attack/siege/ballist_attack_02.ogg"], 1.4, 0.4),
    "catapult":   ("0ad", ["attack/siege/onager_shooting_11.ogg"], 0.9, 0.2),
    # movement
    "march":      ("0ad", ["actor/human/movement/hstep_dirt_MN_%d.ogg" % n for n in (11, 12, 13)], 1.6, 0.5),
    "run":        ("0ad", ["actor/human/movement/hstep_run_dirt_MN_11.ogg"], 1.6, 0.5),
    "gallop":     ("0ad", ["actor/mounted/movement/mstep11%d.ogg" % n for n in range(0, 6)], 1.6, 0.5),
    "neigh":      ("0ad", ["actor/fauna/animal/horse_attack%d.ogg" % n for n in (1, 2, 3)], 1.5, 0.3),
    # horns and fanfares
    "horn":       ("0ad", ["interface/alarm/alarmalert0.ogg", "interface/alarm/alarmalert1.ogg", "interface/alarm/alarmalert2.ogg"], 2.4, 0.6),
    "alarm_horn": ("0ad", ["interface/alarm/alarmattackplayer_1.ogg"], 3.0, 0.8),
    "turn":       ("0ad", ["interface/alarm/alarmresearchphase_1.ogg"], 2.6, 0.8),
    "victory":    ("0ad", ["interface/alarm/alarmvictory_1.ogg"], 3.2, 0.6),
    "defeat":     ("0ad", ["interface/alarm/alarmdefeat_1.ogg"], 3.9, 0.8),
    "hero_dead":  ("0ad", ["interface/alarm/alarmherodead_1.ogg"], 3.0, 0.8),
    # magic and fire
    "spell":      ("0ad", ["attack/fire/sp_11.ogg", "attack/fire/sp_12.ogg", "attack/fire/sp_13.ogg"], 1.3, 0.6),
    "fire":       ("0ad", ["attack/fire/c_11.ogg", "attack/fire/c_12.ogg"], 1.4, 0.6),
    # ambience
    "amb_wind":   ("0ad", ["ambient/weather/wind_11.ogg"], 40.0, 2.0),
    # interface (uisfx, organic and cinematic styles)
    "ui_press":   ("ui", ["organic/press.mp3"], 0.5, 0.05),
    "ui_select":  ("local", ["universfield-mouse-click-117076.mp3"], 0.32, 0.05),
    "ui_back":    ("ui", ["organic/back.mp3"], 0.6, 0.05),
    "ui_open":    ("ui", ["organic/open.mp3"], 0.8, 0.1),
    "ui_close":   ("ui", ["organic/close.mp3"], 0.8, 0.1),
    "ui_error":   ("ui", ["organic/error.mp3"], 0.8, 0.1),
    "ui_drop":    ("ui", ["organic/drop.mp3"], 0.6, 0.05),
    "ui_toggle":  ("ui", ["organic/toggle-on.mp3"], 0.5, 0.05),
    "ui_tick":    ("ui", ["organic/snap.mp3", "organic/typing.mp3"], 0.4, 0.05),
    "coin":       ("ui", ["organic/purchase.mp3"], 1.2, 0.2),
    "reward":     ("ui", ["cinematic/reward.mp3"], 2.0, 0.4),
    "level_up":   ("ui", ["cinematic/level-up.mp3"], 2.0, 0.4),
    "travel":     ("ui", ["organic/forward.mp3"], 1.0, 0.2),
}

def peak_db(path):
    out = subprocess.run([FF, "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"max_volume: (-?[0-9.]+) dB", out)
    return float(m.group(1)) if m else 0.0

os.makedirs(OUT, exist_ok=True)
manifest = {}
for name, (lib, files, dur, fade) in CLIPS.items():
    root = OAD if lib == "0ad" else LOCAL if lib == "local" else UI
    manifest[name] = []
    for i, rel in enumerate(files):
        src = os.path.join(root, rel)
        if not os.path.exists(src):
            print("missing", src); continue
        tmp = os.path.join(OUT, "_tmp.wav")
        chain = "atrim=0:%s,afade=t=out:st=%s:d=%s" % (dur, max(0, dur - fade), fade)
        if name.startswith("amb_"): chain += ",afade=t=in:d=2"
        else: chain = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01," + chain
        subprocess.run([FF, "-y", "-v", "error", "-i", src, "-af", chain, "-ac", "1", "-ar", "44100", tmp], check=True)
        gain = -1.0 - peak_db(tmp)
        dst = os.path.join(OUT, "%s_%d.mp3" % (name, i + 1))
        br = "64k" if name.startswith("amb_") else "96k"
        subprocess.run([FF, "-y", "-v", "error", "-i", tmp, "-af", "volume=%.2fdB" % gain, "-c:a", "libmp3lame", "-b:a", br, dst], check=True)
        os.remove(tmp)
        manifest[name].append(os.path.basename(dst))
    print("%-12s %d file(s)" % (name, len(manifest[name])))

with open(os.path.join(OUT, "sfx.json"), "w") as f:
    import json
    json.dump(manifest, f, indent=1, sort_keys=True)

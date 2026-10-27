# Rescue Maze 2026 — Intermediate Division Student Summary

A plain-language summary of the **Intermediate Maze** rules from the **RoboCup Junior
Australia Rescue Maze Rules 2026** (Version 26.1). This is a study aid only — the official
rules always win if there is a disagreement.

**Official rules and downloads:** <https://www.robocupjunior.org.au/rescue-maze/>

> Read the official PDF and the separate **General Rules** before competing. This page just
> covers the **Intermediate Maze** division, which is what this robot platform is built for.

---

## 1. The story

There has been an accident at a manufacturing plant. Your **autonomous** robot has to drive
through a maze, find **victims** (coloured squares), avoid **black "no-go" tiles**, drop a
**rescue kit** next to harmed victims, and find its way back to the start. You score points
for what you find — you do **not** have to find the fastest path. Explore as much of the
maze as you can.

**Run time:** each round lasts a maximum of **240 seconds**, including calibration.

---

## 2. The playing field

- The maze is built from tiles roughly **290 mm** square (±15 mm). Paths and doorways are
  also about **290 mm** wide, but may open into wider foyers.
- Walls are **150–300 mm** high, opaque, and can be any colour. There may be small gaps
  (about 5 mm) between wall sections and floor tiles.
- The floor is smooth (e.g. melamine), a **light colour**, and is deliberately different
  from silver tiles, black tiles and victims. Joints may have up to a 3 mm height step.
- **Start/Exit tile:** marked by a **silver reflective tile**, walled on three sides.
- **Black "no-go" tiles:** scattered through the maze. Treat them like **virtual walls** —
  your robot must **not** stay on them.
- **Floating tiles:** unlike the beginner division, not every path leads back to the start.
  Some branches are dead-ends ("floating tiles").
- **Tolerance:** every measurement can vary by **5%**, and the venue will not match your
  practice field. Build your robot and code to **calibrate and adapt**.

---

## 3. Things on the floor (Intermediate hazards)

- **Speed bumps:** fixed to the floor, up to **5 mm** high, at least 50 mm apart. Make sure
  your robot has enough ground clearance to drive over them.
- **Debris:** loose, up to **5 mm** high, a contrasting colour to victims/start/black tiles.
  It is **not** reset after a Lack of Progress, so expect it to move around.
- There are **no** obstacles, ramps, stairs, levels or tunnels in Intermediate (those are
  Open division only).

---

## 4. Black "no-go" tiles — the important one

This is the behaviour **Challenge 9** in this project teaches.

- If **more than half** the robot enters a black tile, it counts as **"visited"**.
- To escape safely you must **reverse straight backwards** out of the tile — **do not turn
  while still on the black tile**.
- If the robot gets stuck on a black tile (or fails to back out), the referee calls a
  **Lack of Progress** and you go back to your last checkpoint.

**Recommended robot behaviour:** detect black early → reverse straight out (hold your
heading with the gyro) → only then turn toward open space → carry on exploring.

---

## 5. Victims (what you're scoring)

Floor victims are **50 mm coloured squares** fixed to the **centre of a tile**:

- 🟩 **Green = Unharmed** → **10 points**
- 🟥 **Red = Harmed** → **25 points** (plus **10 more** if you drop a rescue kit on that tile)

There are at least **4 victims** per round. They are never on black tiles or the start tile.

**To identify a victim:** stop **fully on the same tile** as the victim for **at least
1 second** and give a **clear indicator** — a visual light/colour change is best (sound is
hard to hear in a loud hall). Each victim only scores **once**.

---

## 6. Rescue kits

- A rescue kit is a small block, at least **8 × 8 × 8 mm** (500 mm³). You may carry up to
  **12** of them.
- Drop **one** kit fully on the tile of an identified **Harmed (red)** victim for **+10
  points**. Only counts once per victim. Unharmed victims don't need a kit.

---

## 7. Bonuses

- **Exit Bonus (25 pts):** return and **stop completely on the Start/Exit tile**, then
  indicate you've finished (use a _different_ signal from your victim indicator).
- **Count Bonus (25 + 25 pts):** once you've identified **at least half** the victims, stop
  on the start tile and correctly report **how many Unharmed** and **how many Harmed** you
  found. Counting one twice is OK — there's no penalty.

---

## 8. Running a round

- One team member is the **Robot Handler** — the only person allowed to touch the robot or
  talk to the referee during a run.
- The robot must be **fully autonomous**: started by hand, no laptop/phone/remote control,
  no wireless control of the robot.
- The clock includes **calibration** time. You may take sensor readings and tweak settings
  on the day, but you may **not pre-map** the maze or victim locations — that's instant
  disqualification.
- **Checkpoints:** each correctly identified victim becomes a checkpoint you can be returned
  to after a Lack of Progress.
- **Lack of Progress** (call it if the robot is stuck/looping for 3+ seconds or 3+ loops, or
  it's trapped on a black tile): the robot is returned to your **last checkpoint** (an
  identified victim, or the start tile). You may **pause or reset** the program but **not
  change** it. Points already scored stay; debris is **not** reset.
  - ⚠️ Resetting your program can wipe variables like your **victim counts** — think about
    how to handle that.
- **Restart** (optional, after a Lack of Progress): power-cycle, change programs, refit
  parts — but **all points so far are wiped** and the **timer keeps running**.

---

## 9. Robot rules (quick check)

- Max height **300 mm**. No sensors that "see" over the walls.
- It must be **mostly your own work** — no kits sold specifically to complete Rescue Maze.
- **One robot** for the whole competition; only minor repairs/tweaks between rounds.
- Only **class 1 or 2 lasers**.

---

## 10. Before the competition — submissions

1. **Annotated code** — your latest code, commented to explain sensors, decision logic and
   motor control. No submission = **can't compete**.
2. **Digital poster (A3)** — team name, members' first names + roles, one innovative design
   feature, a challenge you overcame, and what you learned. Needed for **special awards**.

You may also have a short **technical interview** (not scored) to show the work is yours.

---

## 11. How this project maps to the Intermediate rules

| Skill in the rules                               | Where to practise here      |
| ------------------------------------------------ | --------------------------- |
| Driving straight & holding heading               | Challenges 1–4 (gyro / PID) |
| 90° and 180° turns                               | Challenge 4                 |
| Wall following                                   | Challenges 5–7              |
| Floor-victim colour detection (red/green/silver) | Challenge 8                 |
| Black "no-go" detection + reverse-and-recover    | Challenge 9                 |

See the [docs index](README.md) for the full challenge guides.

---

_Summary of the Intermediate Maze division, based on RoboCup Junior Australia Rescue Maze
Rules 2026, Version 26.1 (28 February 2026). Always check the official rules:
<https://www.robocupjunior.org.au/rescue-maze/>_

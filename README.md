# OBEY THE LIGHT

A pixel-art driving game. You drive down a city avenue and a traffic light
keeps changing color. Every color means something. **Do what the light says,
or a sniper on the rooftops shoots you in the head.**

Everything is pixelated: the 320×180 screen, the font, the menus, the page
background, even the mouse cursor. All sounds and music are chiptune, made
live in the browser.

## Play it

Open `index.html` in any modern browser. There's no install and no build step,
and it works offline straight from the folder.

## Controls

| Action | Keyboard | Touch screen | Gamepad |
| --- | --- | --- | --- |
| Drive forward / brake / reverse | `→` / `←` (or `D` / `A`) | D-pad | D-pad / left stick |
| Move sideways | `↑` / `↓` (or `W` / `S`) | D-pad | D-pad / left stick |
| Honk | `Space` (or `H`) | pink HONK button | A / B |
| Pause (shows the rules so far) | `P` or `Esc` | `II` button | Start |
| Quit to menu (while paused) | `Q` | tap "QUIT TO MENU" | |
| Mute | `M` | | |

## The lights

| Color | Command | What you have to do |
| --- | --- | --- |
| 🟢 Green | **GO!** | Keep driving forward. |
| 🔴 Red | **STOP!** | Come to a full stop. Don't move at all, not even sideways. |
| 🟣 Purple | **DANCE!** | Arrows pop up above your car. Press them in order; a wrong one starts you over. |
| 🔵 Blue | **SLIDE!** | Move, but not forward or backward: stop, then slide sideways until the bar fills. |
| 🟡 Yellow | **SLOW…** | Creep forward. Too fast gets you shot, and so does stopping. |
| 🟠 Orange | **REVERSE!** | Drive backward. |
| 🩷 Pink | **HONK ×N!** | Honk exactly N times. One extra honk gets you shot. |
| 🩵 Cyan | **SPIN!** | Roll the arrows in a circle (`→ ↓ ← ↑`) to spin your car around. |
| ⚫ Black | **PLAY DEAD** | Let go of everything. Don't touch a single key. |
| 🟤 Brown | **GRAB COFFEE!** | A coffee cup appears on the road. Drive into it. |
| ⚪ White | **PANIC!** | Mash any keys until the counter fills up. |
| 🌈 Rainbow | **CHAOS!** | A fast string of random lights. Obey every one for a big bonus. |

Each light gives you a moment to react. After that, if you're breaking the
rule, a red laser dot starts creeping toward your driver's head. Fix it fast
and the dot goes away. If you don't, you get the sniper-scope cam and then
**BANG**.

Hints while you drive:

* The speedometer at the bottom highlights the speed range the light wants.
* A `✓` or `✗` over your car shows whether you're obeying right now.
* Clean lights (no laser on you at all) build a score multiplier up to ×8.

## Modes

* **Drive**: starts with only green and red. A new color shows up every few
  lights and gets its own how-to card the first time you see it. The city
  goes from day to night the longer you last.
* **Insane mode**: all 12 colors from the start, faster lights, and no hint
  text. You only get the color, so you have to remember what it means.
* **Practice**: the sniper always misses, and a banner tells you which rule
  you broke.

Best scores are saved in your browser.

## Project layout

```
index.html        page shell: one <canvas>, scaled up with nearest-neighbour
js/pixel.js       low-res screen, pixel primitives, sprite rotation, the pixel font
js/audio.js       synthesised sound effects, engine drone and soundtrack
js/sprites.js     cars, driver, sniper and light icons (all pixel art)
js/world.js       the endless city, traffic, pedestrians, snipers, particles
js/rules.js       what every light color means (add a new color here)
js/input.js       keyboard, on-screen touch buttons and gamepads
js/game.js        game states, car handling, the light sequencer, scoring, death
js/draw.js        rendering: the street, the HUD, the sniper cam and all menus
js/main.js        boot and the fixed 60 Hz game loop
tools/build.js    bundles everything into one HTML file
```

To get a single self-contained file to share, run `node tools/build.js`. It
writes `dist/obey-the-light.html`.

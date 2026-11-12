# Vial strength — UI component

**[Live demo](https://domvybe.com/components/vial-strength/)** · [Step-by-step tutorial](https://domvybe.com/library/vial-strength/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-vial-strength/releases/latest/download/vial-strength-source.zip)

A password-strength meter that is a glass vial: every key raises the glowing liquid, the colour walks from ruby to emerald, and each new colour curls down into the old one like dye in water.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the sign-up page: the skip link, the header (logo, nav, Log in), the room and vial canvases, the CSS vial, the graduation labels (Weak, Fair, Good, Strong), the vial hit area, the real form (the intro, Work email, the new-password field with Show and the Caps Lock note, the role=meter strength, the four requirements, Create account with its busy and done states, Start over, the status line and the live region), the caption, and a pre-paint script (old keys, ?nofx)
- `css` — vial.css: the header, the hero grid, the intro, the fields with their inline errors and the shake, the meter and the requirements, the button states (busy spinner, done tick), the graduation labels, the CSS vial without WebGL 2, the disabled look, the short-desk, stacked (phones and portrait tablets), phone-landscape and large-screen layouts, reduced motion
- `js` — app.js (the form: validation, inline errors, Show, Caps Lock and the submit flow; the strength to liquid mapping, the layout that fits the vial into its stage, the heavy-spring liquid with the slosh and the dye front, the lean and the press swirl, the showcase that types itself in, the render scheduler that sleeps at rest, context loss), vial.js (the two WebGL 2 shaders: the vial traced analytically with its glass, liquid, dye front, meniscus, brass cap and graduations, and the low-resolution room with the tinted shadow, the caustic and the halo; the camera), gl.js (a tiny WebGL 2 helper with scissored draws), strength.js (the strength estimate: character pool and length with penalties for repeats, runs, common passwords and the email name; the labels and the colour ramp)

Verdance is made up, and the page sends nothing: Create account checks the form and simulates a 950 ms request, so put
your own in the `submit` handler of `js/app.js`; passwords are never stored. The estimate in `js/strength.js` is plain
arithmetic on the string (the character pool times the effective length, with penalties for repeats, keyboard and
alphabet runs, common passwords and the name in the email), and the form accepts Fair and up. Everything is made in
code: the glass vial, its brass cap, the glowing liquid, the dye curling down, the meniscus, the table, the shadow and
its caustic are two WebGL 2 shaders, and every word, the field, the meter and the requirements are HTML; no AI pictures.
The vial is decoration (`aria-hidden`), driven by the `role=meter` and a polite live region; it leans toward the pointer
and a press swirls it. A first visit types the showcase password in, and only that visit is kept in `localStorage`
(`dv93.v1.seen`); `?demo=0` opens the form empty and `?disabled` shows sign-ups paused. At rest nothing is drawn and the
loop sleeps. Without WebGL 2 (or with `?nofx`, or when the context is lost) the vial is CSS, filled by the same spring;
`?fxdpr=2` renders the vial sharper. The page reads Google Fonts (Inter, Instrument Serif).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.

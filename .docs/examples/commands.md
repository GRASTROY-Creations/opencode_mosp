# `/mosp` commands

```text
/mosp                    open/close the panel (same as /mosp toggle)
/mosp update             fetch all sources, then toast "ready · 82 models · 0 warning(s)"
/mosp redraw             re-read host catalog + cache, repaint (no network)
/mosp status             dialog: per-source state and last success
/mosp sort coding        sort by Coding (desc first; repeat to flip)
/mosp sort intel         sort by Intel
/mosp sort input-price   also: ctx, output-price, name, releaseDate, …
```

Toolbar row: `[free]` (left) toggles the free-model filter; `[update]` (right)
equals `/mosp update` and shows `[updating…]` while running. An empty panel
shows `No models loaded — click [update] or run /mosp update`.

Example rows (widths shortened; scores from the 2026-10-26 export/fixture,
prices are placeholders):

```text
Model                    In $/M     Out $/M    Coding   Intel
Claude Fable 5           $x.xx/M    $y.yy/M    76.5     49.6
GLM 5.3 Flash Free       free       free       ~71.5    ~…
```

(`~…` stands for the paid sibling's intelligence value, whatever it is.)

`~` = value borrowed from the paid sibling via a `family_fallback` mapping.

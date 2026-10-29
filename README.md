# OKF Reviewer

An Obsidian plugin that adds a review side panel for [OKF](https://okfn.org/) (Open Knowledge Format-style) documents — notes whose frontmatter carries a `type`. It lets a reviewer record verification events, set a lifecycle `status`, and manage a `stale_after` review date, all written straight to the note's frontmatter.

## Features

### Review panel

- Opens automatically in the right sidebar when the active note is an OKF document (has a non-empty `type` in its frontmatter), and stays inactive — without touching the note — for non-OKF or malformed-frontmatter notes.
- Shows the document's current review state: verification events, status, and stale-after date, with a tier badge (**Unverified** / **Machine-confirmed** / **Human-reviewed**) and a **Due for review** flag once `stale_after` has passed.
- **Mark verified** records a `verified` event as `{ by: <reviewer identity>, at: <now> }`. It appends alongside any existing events from other actors (a single object promotes to an array on the second event), but overwrites the `at` in place if that reviewer identity already has an event, instead of piling up duplicates.
- Each verification event can be individually revoked; the `verified` key is removed entirely once the last event is gone.
- **Status** control sets/clears `draft`, `stable`, or `deprecated`.
- **Stale after** control sets an absolute date via a native date picker, or via 30/90/180/365-day presets, or clears it.
- **Frontmatter attributes** (below the review sections, available for *any* open note) lists the attributes configured in settings: each missing attribute has a right-aligned **+** button to add just that one, each present attribute a trash button to remove it from the note, and an **Add all** button below the list appends every configured-but-missing key with its default value — existing keys are never overwritten, repeated clicks are no-ops.
- All edits are written immediately via Obsidian's `processFrontMatter`; a failed write shows a Notice and the panel reverts to the persisted state — body text and unrelated frontmatter keys are never touched.

### File explorer markers

Each OKF document's entry in the file explorer is annotated with three independent signals:

- **Text color** — authorship/provenance, from `generated.by`: green if human-authored, blue if machine-authored, left uncolored if unknown.
- **A trailing dot** — verification status: green (human-reviewed) or blue (machine-confirmed), or **red** if the document is due for review (this overrides the verification color, but never the text color).
- **A lifecycle-status decoration** on the label text, from `status`: a muted `[DRAFT]` suffix for drafts, a strikethrough for deprecated, nothing for stable. Unknown, missing, or malformed statuses leave the label plain — the file name itself is never modified (the suffix is a separate decoration element).

Green/blue/red are tuned separately for light and dark themes to keep sufficient contrast in both; the status decoration inherits the entry's existing color, so it works in both themes as-is. Labels update within a second of a status change (panel edit, frontmatter edit, or external write) and are removed cleanly when the plugin is disabled.

### Decoration toggle

The explorer's top action bar carries an **eye toggle** for the whole decoration layer: one click hides every OKF decoration (colors, dots, `[DRAFT]` suffixes, strikethroughs) for a plain file-name view; clicking again restores them from each note's current state. The button shows Obsidian's native pressed styling while decorations are visible. The choice is remembered across restarts (`showExplorerStatus` in the plugin's data, default on) and applies to every open explorer pane.

### Settings

In Settings → OKF Reviewer:

- **Reviewer identity** — the `human:<id>` actor recorded as `by` on Mark verified (default `human:reviewer`).
- **Frontmatter attributes** — an editable list of custom frontmatter attributes (name + single-line default value) that the review panel can add to the open document with one click. Names are case-sensitive frontmatter keys and must be unique; defaults are empty-allowed and JSON-typed: plain text is written as-is, while valid JSON (`3`, `true`, `null`, `[1, 2]`, `{"k": "v"}`, `"text"`) is written as that value.

Status and stale-after have no configurable defaults — status is a row of buttons that just reflects whatever's already set, and stale-after has its date picker plus 30/90/180/365-day preset pills right in the panel, so a settings-level default would just be one more place to look instead of one less click.

## Frontmatter contract

| Key | Shape | Notes |
| --- | --- | --- |
| `type` | non-empty string | required for the plugin to treat a note as an OKF document |
| `verified` | `{ by, at }` or a list of those | `by` is free text; a `human:<id>` prefix marks it as a human event |
| `status` | `draft` \| `stable` \| `deprecated` | optional |
| `stale_after` | `YYYY-MM-DD` | optional; a past date means the document is due for review |
| `generated.by` | free text | optional, read-only to this plugin; drives the file-explorer text color |

## Installation

This plugin isn't in the community plugin store. To install it manually:

1. Copy this folder into your vault's `.obsidian/plugins/okf-reviewer/`.
2. Reload Obsidian (or run `npm run build` first if installing from source).
3. Enable **OKF Reviewer** in Settings → Community plugins.

## Development

```bash
npm install       # install dependencies
npm run dev        # esbuild in watch mode
npm run build       # type-check (tsc) + production bundle
npm run lint        # eslint (eslint-plugin-obsidianmd)
npm test         # vitest — unit tests for the pure frontmatter/marker logic
```

`src/okf.ts`, `src/markers.ts`, and `src/attributes.ts` are plain TypeScript with no Obsidian imports, so the frontmatter mapping, file-explorer marker rules, and attribute write/validation semantics are covered by `npm test` independent of a running vault. Everything else (`main.ts`, `panel.ts`, `settings.ts`, `explorer.ts`) is Obsidian-API glue, validated manually in a live vault.

## License

0BSD — see [`LICENSE`](LICENSE).

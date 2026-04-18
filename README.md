# Negative Edge -- negativeedge.se

Bilingual (Swedish/English) Hugo site for **Negative Edge**, Gothenburg's fighting game community. Deployed to [negativeedge.se](https://negativeedge.se) via Cloudflare Pages.

## Prerequisites

- [Hugo](https://gohugo.io/) **0.128.0 Extended** (with Dart Sass support)
- Git

## Local development

```bash
# Clone with submodules using ssh
git clone --recursive git@github.com:Xgor/NEGBG_Web.git
# or using http
git clone --recursive https://github.com/Xgor/NEGBG_Web.git
# then
cd NEGBG_Web

# Or if already cloned
git submodule update --init --recursive

# Start dev server (drafts included)
hugo server -D
```

The site is available at `http://localhost:1313`.

## Project structure

```
NEGBG_Web/
  archetypes/        # Content templates (hugo new)
  assets/            # Hugo-processed assets (images, etc.)
  content/           # All site content (Markdown + data files)
    events/          # Event page bundles
    news/            # News page bundles
    about/           # Static pages
    join/
  i18n/              # Translation strings (sv.toml, en.toml)
  layouts/           # Custom templates, partials, shortcodes
  static/
    css/custom.css   # All custom styles (use theme CSS variables)
    images/          # Event covers, etc.
  themes/
    hello-friend-ng/ # Theme (git submodule -- never edit directly)
  hugo.toml          # Hugo configuration
```

## Bilingual content

Swedish (`sv`) is the default language. English (`en`) is secondary.

- Page bundles use language suffixes: `index.sv.md` / `index.en.md`
- Standalone pages: `_index.sv.md` / `_index.en.md`
- UI strings live in `i18n/sv.toml` and `i18n/en.toml` -- add new keys to both files

## Content types

### Events

Events are the core content type. Each event is a **page bundle** under `content/events/`:

```
content/events/my-event/
  index.sv.md       # Swedish content + front matter
  index.en.md       # English translation (optional)
  data.toml         # Shared structured data (schedule, location, pricing)
```

Create a new event with the archetype:

```bash
hugo new --kind event content/events/my-event
```

There are two event formats: **one-off** and **recurring**.

#### One-off events

For tournaments or single-date gatherings. The front matter (`index.sv.md`) contains the title, summary, and body text:

```toml
+++
title = "My Tournament"
date = 2026-04-06
draft = false
summary = "A short description for the list page."
+++

Full event description in Markdown.
```

The `data.toml` holds structured data shared across languages:

```toml
start_date = "2026-04-12T16:00:00"
end_date = "2026-04-12T20:00:00"
price = 25
price_currency = "SEK"
cover = "/images/my-event-cover.jpg"
checkin_time = "15:30"
challonge_url = "https://challonge.com/..."
discord_url = "https://discord.com/events/..."

[location]
name = "Kappa Bar"
street = "Rosenlundsgatan 8"
postal_code = "411 20"
city = "Goteborg"
country = "SE"

[prize_pool]
total = 1000
currency = "SEK"
entry_fee_contributed = true
places = [500, 200, 150, 100, 50]
```

Most `data.toml` fields are optional.

#### Recurring events

For weekly casuals or regular meetups. The front matter includes a `recurrence` block:

```toml
+++
title = "Weekly Casuals"
date = 2025-11-03
draft = false
summary = "Casuals at Kappa Bar"

[recurrence]
type = "Every week"
details = "Alternates between Tuesday and Wednesday"
+++
```

The `data.toml` holds the schedule as a flat list of dates:

```toml
[location]
name = "Kappa Bar"
street = "Rosenlundsgatan 8"
postal_code = "411 20"
city = "Goteborg"
country = "SE"

[recurrence]
start_time = "18:00"
end_time = "22:00"

schedule = [
  "2026-03-25",
  "2026-03-31",
  "2026-04-08",
  # ...keep in chronological order
]

cancellations = [
  # "2026-04-08",  # uncomment to cancel a specific date
]
```

Rules for recurring events:

- `schedule` is a flat array of `YYYY-MM-DD` strings, one per occurrence
- `cancellations` suppresses specific dates from the schedule
- `start_time` / `end_time` use 24-hour `HH:mm` format
- Append new dates to the end of `schedule`, keeping chronological order
- The template automatically picks the next upcoming non-cancelled date

### News

News articles are page bundles under `content/news/`:

```toml
+++
title = "Tournament Results"
date = "2026-04-14T12:00:00+02:00"
draft = false
cover = "photo.jpg"
event_link = ["my-event-slug"]
event_role = "recap"           # "announcement" or "recap"
+++
```

- `event_link` connects the news post to an event (by slug)
- `event_role` determines how the link is displayed ("announcement" for upcoming, "recap" for results)
- Images in the page bundle folder can be referenced directly by filename

## Shortcodes

| Shortcode | Usage |
|---|---|
| `tournament-results` | Renders a formatted results table (place, player, character) |
| `homepage-hero` | Large hero banner with title, buttons, content |
| `figure` | Enhanced image with caption and alt text |
| `spacer` | Vertical spacing |
| `swish` | Flexible link shortcode |

## Styling

All custom CSS goes in `static/css/custom.css`. Use the theme's CSS variables (`var(--accent)`, `var(--main-border)`, `var(--main-card-bg)`, etc.) to stay consistent with light/dark mode.

Never edit files in `themes/hello-friend-ng/` directly -- it's a git submodule. Override layouts by placing files with the same path in the top-level `layouts/` directory.

## Contributing

1. Create a branch off `master`:
   ```bash
   git checkout master && git pull
   git checkout -b my-feature
   ```
2. Make your changes and verify locally with `hugo server -D`
3. Push the branch and open a PR against `master`

Merges to `master` automatically trigger a Cloudflare Pages deploy. There is also a daily scheduled rebuild at 01:00 UTC via GitHub Actions to keep time-sensitive content (like events) current.

Hugo version is pinned to **0.128.0** -- don't change without testing locally first.

### Front matter format

All content uses TOML front matter (`+++` delimiters).

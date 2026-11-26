/*
  Turns a parsed GitHub Issue Form into Hugo content.

  Usage: node build-content.mjs <new-tournament|news-post|edit-post>
  Reads the parsed issue JSON from $ISSUE_JSON (stefanbuck/github-issue-parser)
  and the issue number from $ISSUE_NUMBER.

  The workflow always runs this on a fresh checkout of master, so every run (the
  first one and every edit of the issue) rebuilds the content from scratch and the
  PR branch is force-updated to match the issue.

  On a validation failure it writes a reader-friendly explanation to $GITHUB_OUTPUT
  as `error` and exits 1; the workflow posts that back as an issue comment.
*/

import { mkdir, writeFile, readFile, readdir, access, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../..");
const TZ = "Europe/Stockholm";
const LANGS = ["sv", "en"];

/* Every event so far has been here, so it is the default rather than four fields to fill in. */
const KAPPA_BAR = {
  name: "Kappa Bar",
  street: "Rosenlundsgatan 8",
  postal_code: "411 20",
  city: "Göteborg",
  country: "SE",
};

const CHECKIN_MINUTES_BEFORE_START = 30;

class UserError extends Error {}

/* ---------- issue form field access ---------- */

/* Issue forms send this literal string for a skipped optional field. */
const NO_RESPONSE = "_No response_";

const issueNumber = process.env.ISSUE_NUMBER ?? "local";

/* The edit form's sections are not in its template (step 1 only asks for the slug),
   so for that form the script parses the issue body itself; see parseEditIssue. */
let parsedFields;
function fields() {
  parsedFields ??= process.argv[2] === "edit-post"
    ? parseEditIssue(process.env.ISSUE_BODY ?? "")
    : JSON.parse(process.env.ISSUE_JSON ?? "{}");
  return parsedFields;
}

/* Whether the issue has this section at all, as opposed to having it empty. */
function has(id) {
  return typeof fields()[id] === "string";
}

function field(id) {
  const raw = fields()[id];
  if (typeof raw !== "string") return "";
  /* Issues edited in the browser come back with CRLF line endings. */
  let value = raw.replace(/\r\n?/g, "\n").trim();
  /* The edit form's hidden "loaded" marker ends up inside the last field's value. */
  value = value.replace(/\n*<!-- edit-post-loaded: [a-z0-9/-]+ -->/g, "").trim();
  /* ...and each loaded section starts with a hidden editing tip. */
  value = value.replace(/^<!-- tip: [\s\S]*?-->\s*/, "");
  if (value === NO_RESPONSE) return "";
  /* `render:` textareas arrive wrapped in a code fence on some parser versions. */
  const fenced = value.match(/^```[a-z]*\n([\s\S]*?)\n?```$/);
  if (fenced) value = fenced[1].trim();
  return value;
}

function required(id, label) {
  const value = field(id);
  if (!value) throw new UserError(`**${label}** is required but was left empty.`);
  return value;
}

/* An optional http(s) link. Spaces, quotes, brackets and parentheses would break the
   markdown link in the announcement, so they are rejected rather than escaped. */
function link(id, label) {
  const value = field(id);
  if (value && !/^https?:\/\/[^\s"'<>()[\]]+$/.test(value)) {
    throw new UserError(
      `**${label}** must be a full link starting with \`https://\`, with no spaces. Got \`${value}\`.`,
    );
  }
  return value;
}

function validSlug(value, label, example) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    throw new UserError(
      `**${label}** must be lowercase letters, numbers and hyphens only, e.g. \`${example}\`. Got \`${value}\`.`,
    );
  }
  return value;
}

async function mustNotExist(dir, label) {
  if (await exists(dir)) {
    throw new UserError(`\`${path.relative(REPO, dir)}\` already exists. Pick a different **${label}**.`);
  }
}

/* ---------- dates ---------- */

/* Hugo reads data.toml datetimes as local time, so they are written without an offset. */
function localDateTime(day, time) {
  return `${day}T${time}:00`;
}

function offsetFor(date) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName").value;
  return parts.replace("GMT", "") || "+00:00";
}

/* Matches the news front matter convention, e.g. 2026-05-17T12:00:00+02:00 */
function rfc3339(date) {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  return `${f.format(date).replace(" ", "T")}${offsetFor(date)}`;
}

function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

/* A real calendar day as YYYY-MM-DD, or null. Rejects e.g. 2026-02-31, which Hugo
   cannot parse and which would fail the whole site build. */
function calendarDay(value) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real ? value : null;
}

/* A 24-hour time as HH:MM, or null. Accepts a single-digit hour, e.g. 9:30. */
function clockTime(value) {
  const m = value.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function dateAndTime(value) {
  const m = value.match(/^(\S+)[ T](\S+)$/);
  if (!m) return null;
  const day = calendarDay(m[1]);
  const time = clockTime(m[2]);
  return day && time ? { day, time } : null;
}

function parseStart(value) {
  const start = dateAndTime(value);
  if (!start) {
    throw new UserError(
      `**Start** must be a real date and 24-hour time like \`2026-05-31 16:00\`. Got \`${value}\`.`,
    );
  }
  return start;
}

/* End may be just a time (same day as start) or a full date and time. */
function parseEnd(value, startDay) {
  const time = clockTime(value);
  if (time) return { day: startDay, time };

  const end = dateAndTime(value);
  if (!end) {
    throw new UserError(
      `**End** must be a 24-hour time like \`20:00\`, or a full \`2026-05-31 20:00\`. Got \`${value}\`.`,
    );
  }
  return end;
}

function subtractMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m - minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* ---------- TOML ---------- */

/* JSON string escapes are valid TOML basic-string escapes; TOML additionally
   forbids a raw DEL, which JSON leaves alone. */
function tomlString(value) {
  return JSON.stringify(String(value)).replace(/\x7f/g, "\\u007f");
}

function frontMatter(pairs) {
  const lines = Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k} = ${v}`);
  return `+++\n${lines.join("\n")}\n+++\n`;
}

/* ---------- images ---------- */

const IMAGE_URL = /https:\/\/(?:github\.com\/user-attachments\/assets|user-images\.githubusercontent\.com)\/[^\s)"'<>]+/g;

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/* The same upload is often reused across both languages and bundles; fetch it once. */
const downloads = new Map();

/* The repo is public, so attachment URLs need no auth. */
function download(url) {
  if (!downloads.has(url)) {
    downloads.set(url, (async () => {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new UserError(`Could not download an uploaded image (${res.status}): ${url}`);

      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      const ext = EXTENSIONS[type];
      if (!ext) {
        throw new UserError(
          `An upload is not an image Hugo can process (got \`${type || "unknown"}\`). Use JPEG, PNG, WebP or GIF.`,
        );
      }
      return { ext, bytes: Buffer.from(await res.arrayBuffer()) };
    })());
  }
  return downloads.get(url);
}

function imageUrls(text) {
  return [...new Set(text.match(IMAGE_URL) ?? [])];
}

/* File names (without extension) already used per directory, including ones written
   during this run, so an edit never overwrites an image an existing post uses. */
const takenNames = new Map();

async function taken(dir) {
  if (!takenNames.has(dir)) {
    const files = await readdir(dir).catch(() => []);
    takenNames.set(dir, new Set(files.map((f) => f.replace(/\.[^.]+$/, ""))));
  }
  return takenNames.get(dir);
}

/* The first name(i), i = 1, 2, ..., not yet used in dir. */
async function freeName(dir, name) {
  const used = await taken(dir);
  for (let i = 1; ; i++) if (!used.has(name(i))) return name(i);
}

async function writeImage(dir, name, image) {
  await mkdir(dir, { recursive: true });
  const file = `${name}.${image.ext}`;
  await writeFile(path.join(dir, file), image.bytes);
  (await taken(dir)).add(name);
  return file;
}

/* Returns the first image dragged into a cover field, or null when the field is empty. */
async function coverImage(id, { optional = false } = {}) {
  const value = optional ? field(id) : required(id, "Cover image");
  if (!value) return null;
  const [url] = imageUrls(value);
  if (!url) {
    throw new UserError("**Cover image** did not contain an image. Drag an image file into that box.");
  }
  return download(url);
}

/*
  Rewrites images the author dragged into the body into the site's figure shortcode,
  so they get the WebP/JPEG <picture> pipeline in partials/img.html. The markdown alt
  text becomes the caption. Images are saved into the page bundle alongside index.*.md,
  numbered in the order they appear across every body written into that bundle.
*/
const bundleImageNames = new Map();

async function rewriteBody(body, bundle) {
  const names = bundleImageNames.get(bundle) ?? new Map();
  bundleImageNames.set(bundle, names);

  let out = body;
  for (const url of imageUrls(body)) {
    if (!names.has(url)) {
      const name = await freeName(bundle, (i) => `image-${i}`);
      names.set(url, await writeImage(bundle, name, await download(url)));
    }
    const file = names.get(url);
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /* ![caption](url) and GitHub's <img src="url"> first, so the alt text is not lost,
       then any bare occurrences. */
    out = out
      .replace(
        new RegExp(`!\\[([^\\]]*)\\]\\(\\s*${escaped}\\s*\\)`, "g"),
        (_, caption) => figure(file, caption),
      )
      .replace(
        new RegExp(`<img\\b[^>]*\\bsrc="${escaped}"[^>]*>`, "g"),
        (tag) => figure(file, tag.match(/\balt="([^"]*)"/)?.[1] ?? ""),
      )
      /* The lookahead stops .../assets/abc from also matching inside .../assets/abc-2. */
      .replace(new RegExp(`${escaped}(?![^\\s)"'<>])`, "g"), file);
  }

  return out.trim();
}

function figure(file, caption) {
  const text = caption.trim();
  /* GitHub fills alt with "image" or the upload's filename when the author did not write one. */
  if (!text || /^image$/i.test(text) || /\.(jpe?g|png|webp|gif)$/i.test(text)) {
    return `{{< figure src="${file}" >}}`;
  }
  return `{{< figure src="${file}" caption="${text.replace(/"/g, "'")}" >}}`;
}

/* The gallery shortcode is zero-config: it globs <bundle>/gallery/. Returns how many
   images were added; numbering continues after any already there. */
async function writeGallery(bundle, id = "gallery") {
  const dir = path.join(bundle, "gallery");
  const urls = imageUrls(field(id));
  for (const url of urls) {
    const name = await freeName(dir, (i) => String(i).padStart(2, "0"));
    await writeImage(dir, name, await download(url));
  }
  return urls.length;
}

/* Authors type `1 | feffe | May`; the shortcode expects the player name bolded. */
function resultsTable() {
  const placements = field("results")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) {
        throw new UserError(
          `Each **Placements** line needs \`place | player | character\`, e.g. \`1 | feffe | May\`. Got \`${line}\`.`,
        );
      }
      const [place, player, ...rest] = parts;
      const name = /^\*\*.*\*\*$/.test(player) ? player : `**${player}**`;
      return `${place} | ${name} | ${rest.join(" | ")}`;
    });

  if (placements.length === 0) return "";
  /* Matches the hand-written results posts: a "## Top 8" section after the write-up. */
  return `## Top ${placements.length}\n\n` +
    `{{< tournament-results >}}\n${placements.join("\n")}\n{{< /tournament-results >}}`;
}

/*
  Replaces the first `[marker]` line (case-insensitive, on a line of its own) with
  block. Any further copies, and the marker itself when block is empty (e.g. no
  placements were entered), are removed so they never show up on the page.
*/
function placeAtMarker(text, marker, block) {
  const line = new RegExp(`^[ \\t]*\\[${marker}\\][ \\t]*$`, "gim");
  let found = false;
  const out = text.replace(line, () => {
    if (found) return "";
    found = true;
    return block;
  });
  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), found };
}

/* ---------- announcement logistics ---------- */

/*
  Price, check-in and start time are already fields in data.toml, so the sentence that
  repeats them in the announcement is generated rather than hand-typed. Parts drop out
  when the matching field is blank (free event, no signup link).
*/
function logistics(lang, { price, checkinTime, startTime, tournamentUrl }) {
  const t = lang === "sv"
    ? {
        entry: (p) => `Inträde ${p} kr`,
        free: "Gratis inträde",
        signup: (u) => `Anmäl dig på [turneringssidan](${u}).`,
      }
    : {
        entry: (p) => `Entry ${p} SEK`,
        free: "Free entry",
        signup: (u) => `Sign up on the [tournament page](${u}).`,
      };

  const parts = [price ? t.entry(price) : t.free, `check-in ${checkinTime}`, `start ${startTime}`];
  const sentences = [`${parts.join(", ")}.`];
  if (tournamentUrl) sentences.push(t.signup(tournamentUrl));
  return sentences.join(" ");
}

/* ---------- form: new tournament (event + announcement) ---------- */

async function newTournament() {
  const slug = validSlug(required("slug", "Event slug"), "Event slug", "kappa-kabrak-4");

  const eventDir = path.join(REPO, "content/events", slug);
  const newsDir = path.join(REPO, "content/news", `${slug}-announcement`);
  await mustNotExist(eventDir, "Event slug");
  await mustNotExist(newsDir, "Event slug");

  const start = parseStart(required("start", "Start"));
  const end = parseEnd(required("end", "End"), start.day);
  if (localDateTime(end.day, end.time) <= localDateTime(start.day, start.time)) {
    throw new UserError("**End** must be after **Start**.");
  }

  const checkinInput = field("checkin_time");
  const checkinTime = checkinInput
    ? clockTime(checkinInput)
    : subtractMinutes(start.time, CHECKIN_MINUTES_BEFORE_START);
  if (!checkinTime) {
    throw new UserError(`**Check-in** must be a 24-hour time like \`15:30\`. Got \`${checkinInput}\`.`);
  }

  const price = field("price");
  if (price && !/^\d+$/.test(price)) {
    throw new UserError(`**Price** must be a whole number of kronor, or blank if free. Got \`${price}\`.`);
  }

  const tournamentUrl = link("tournament_url", "Tournament page");
  const discordUrl = link("discord_url", "Discord event link");

  const location = field("venue").startsWith("Kappa Bar")
    ? KAPPA_BAR
    : {
        name: required("venue_name", "Venue name"),
        street: field("venue_street"),
        postal_code: field("venue_postal_code"),
        city: field("venue_city"),
        country: "SE",
      };

  /* Read every required text field before anything is written, so a failure here
     cannot leave a half-built bundle on the branch. */
  const text = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
        title: required(`title_${lang}`, `Title (${lang})`),
        summary: required(`summary_${lang}`, `Summary (${lang})`),
        body: required(`body_${lang}`, `Description (${lang})`),
        announcement: field(`announcement_${lang}`),
      },
    ]),
  );

  /* The event and the announcement share one cover file, which is why it goes in
     assets/images/ rather than either page bundle. assets/ (not static/) so that
     partials/img.html and og-image.html can resize it and make a WebP version. */
  const coverFile = await writeImage(path.join(REPO, "assets/images"), `${slug}-cover`, await coverImage("cover"));
  const cover = `/images/${coverFile}`;

  await mkdir(eventDir, { recursive: true });
  await mkdir(newsDir, { recursive: true });

  await writeFile(
    path.join(eventDir, "data.toml"),
    [
      `start_date = ${tomlString(localDateTime(start.day, start.time))}`,
      `end_date = ${tomlString(localDateTime(end.day, end.time))}`,
      ...(price ? [`price = ${price}`, `price_currency = "SEK"`] : []),
      `cover = ${tomlString(cover)}`,
      `checkin_time = ${tomlString(checkinTime)}`,
      ...(tournamentUrl ? [`tournament_url = ${tomlString(tournamentUrl)}`] : []),
      ...(discordUrl ? [`discord_url = ${tomlString(discordUrl)}`] : []),
      "",
      "[location]",
      `name = ${tomlString(location.name)}`,
      ...(location.street ? [`street = ${tomlString(location.street)}`] : []),
      ...(location.postal_code ? [`postal_code = ${tomlString(location.postal_code)}`] : []),
      ...(location.city ? [`city = ${tomlString(location.city)}`] : []),
      `country = ${tomlString(location.country)}`,
      "",
    ].join("\n"),
  );

  const now = new Date();

  for (const lang of LANGS) {
    const { title, summary, body, announcement } = text[lang];

    await writeFile(
      path.join(eventDir, `index.${lang}.md`),
      frontMatter({
        title: tomlString(title),
        date: today(),
        draft: "false",
        summary: tomlString(summary),
      }) + `\n${await rewriteBody(body, eventDir)}\n`,
    );

    /* Images in the body belong to whichever bundle renders them, so each bundle gets
       its own copy. Rewriting per bundle keeps the src filenames correct in both. */
    await writeFile(
      path.join(newsDir, `index.${lang}.md`),
      frontMatter({
        title: tomlString(title),
        date: tomlString(rfc3339(now)),
        draft: "false",
        cover: tomlString(cover),
        event_link: `[${tomlString(slug)}]`,
        event_role: tomlString("announcement"),
      }) +
        `\n${await rewriteBody(announcement || body, newsDir)}\n\n` +
        `${logistics(lang, { price, checkinTime, startTime: start.time, tournamentUrl })}\n`,
    );
  }

  return {
    title: `New tournament: ${text.en.title}`,
    summary: [
      `Adds the event \`content/events/${slug}\` and its announcement post \`content/news/${slug}-announcement\`.`,
      "",
      `- **When:** ${start.day} ${start.time} to ${end.day === start.day ? "" : `${end.day} `}${end.time}, check-in ${checkinTime}`,
      `- **Where:** ${location.name}`,
      `- **Price:** ${price ? `${price} SEK` : "free"}`,
    ].join("\n"),
  };
}

/* ---------- form: news post (optionally linked to an event) ---------- */

const ROLES = [
  ["Announcement", "announcement"],
  ["Recap", "recap"],
];

async function newsPost() {
  const slug = validSlug(required("slug", "Post slug"), "Post slug", "kappa-kabrak-4-results");
  const newsDir = path.join(REPO, "content/news", slug);
  await mustNotExist(newsDir, "Post slug");

  const notes = [];

  const eventSlug = field("event_slug");
  let role = "";
  if (eventSlug) {
    validSlug(eventSlug, "Event slug", "kappa-kabrak-4");
    role = ROLES.find(([label]) => field("event_role").startsWith(label))?.[1] ?? "";

    /* The event may live in another open PR (e.g. a tournament form filed the same day),
       so a missing event is flagged on the PR instead of blocking it. */
    if (!(await exists(path.join(REPO, "content/events", eventSlug)))) {
      const events = (await readdir(path.join(REPO, "content/events"), { withFileTypes: true }))
        .filter((e) => e.isDirectory() && e.name !== "archive")
        .map((e) => `\`${e.name}\``);
      notes.push(
        `> [!WARNING]\n> There is no event \`${eventSlug}\` on master yet. The link only works once that event exists. ` +
          `Existing events: ${events.join(", ")}.`,
      );
    }
  }

  /* Read and validate everything before anything is written, so a failure here
     cannot leave a half-built bundle on the branch. */
  const text = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
        title: required(`title_${lang}`, `Title (${lang})`),
        intro: field(`intro_${lang}`),
        body: required(`body_${lang}`, `Text (${lang})`),
      },
    ]),
  );
  const results = resultsTable();

  const cover = await coverImage("cover", { optional: true });
  const coverFile = cover ? await writeImage(newsDir, "cover", cover) : "";
  const hasGallery = await writeGallery(newsDir);

  const now = new Date();

  for (const lang of LANGS) {
    const { title, intro, body } = text[lang];

    const gallery = hasGallery ? `## ${lang === "sv" ? "Galleri" : "Gallery"}\n\n{{< gallery >}}` : "";

    /* The author can place each block with a marker line in the text;
       without one it goes after the text. */
    let main = await rewriteBody(body, newsDir);
    const trailing = [];
    for (const [marker, block] of [["results", results], ["gallery", gallery]]) {
      const placed = placeAtMarker(main, marker, block);
      main = placed.text;
      if (block && !placed.found) trailing.push(block);
    }

    const sections = [];
    if (intro) sections.push(await rewriteBody(intro, newsDir), "<!--more-->");
    sections.push(main, ...trailing);

    await mkdir(newsDir, { recursive: true });
    await writeFile(
      path.join(newsDir, `index.${lang}.md`),
      frontMatter({
        title: tomlString(title),
        date: tomlString(rfc3339(now)),
        draft: "false",
        cover: coverFile && tomlString(coverFile),
        event_link: eventSlug && `[${tomlString(eventSlug)}]`,
        event_role: eventSlug && role && tomlString(role),
      }) + `\n${sections.join("\n\n")}\n`,
    );
  }

  const linked = eventSlug
    ? ` linked to the event \`${eventSlug}\`${role ? ` as ${role === "recap" ? "a recap" : "an announcement"}` : ""}`
    : "";
  return {
    title: `News: ${text.en.title}`,
    summary: [`Adds the news post \`content/news/${slug}\`${linked}.`, ...notes].join("\n\n"),
  };
}

/* ---------- editing existing TOML / front matter ---------- */

function splitFrontMatter(text, file) {
  /* Hugo tolerates a BOM or blank lines before the opening +++, and some posts have them. */
  const m = text.replace(/\r\n?/g, "\n").match(/^\uFEFF?\s*\+\+\+\n([\s\S]*?)\n?\+\+\+\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file} has no +++ front matter`);
  return { front: m[1], body: m[2].trim() };
}

function joinFrontMatter({ front, body }) {
  return `+++\n${front.trim()}\n+++\n\n${body.trim()}\n`;
}

/* Index of the first [table] header; keys before it are top level. */
function topLevelEnd(lines) {
  const i = lines.findIndex((l) => /^\s*\[/.test(l));
  return i === -1 ? lines.length : i;
}

/* Sets (or with literal === null, removes) a top-level key, leaving the rest of the
   file, comments and tables included, untouched. */
function setKey(toml, key, literal) {
  const lines = toml.split("\n");
  const end = topLevelEnd(lines);
  const line = new RegExp(`^\\s*${key}\\s*=`);
  const i = lines.slice(0, end).findIndex((l) => line.test(l));

  if (literal === null) {
    if (i !== -1) lines.splice(i, 1);
  } else if (i !== -1) {
    /* Only rewrite when the value differs, so aligned "key   = value" lines stay as they are. */
    if (lines[i].slice(lines[i].indexOf("=") + 1).trim() !== literal) lines[i] = `${key} = ${literal}`;
  } else {
    let at = end;
    while (at > 0 && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, `${key} = ${literal}`);
  }
  return lines.join("\n");
}

/* A top-level basic-string value, or "" when missing. */
function getString(toml, key) {
  const lines = toml.split("\n");
  const m = lines
    .slice(0, topLevelEnd(lines))
    .map((l) => l.match(new RegExp(`^\\s*${key}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`)))
    .find(Boolean);
  return m ? JSON.parse(m[1]) : "";
}

/* ---------- form: edit an existing post or event ---------- */

/*
  Two steps, both driven by the same issue:

  1. Load: the issue names a slug but has no content yet (or the slug changed since the
     last load). The current post is written back into the issue body, one "### label"
     section per field that applies to this page, and nothing is committed.
  2. Save: every later edit of the issue is read as the full new state of the post and
     turned into a PR, like the other forms.

  Step 1 is the issue form's only field (the slug); the sections in step 2 are written
  by the script and parsed by it too (EDIT_SECTIONS, parseEditIssue).

  The issue body carries a hidden marker recording which slug was loaded. The workflow's
  own edit of the issue body does not start a new run, so loading cannot loop.
*/

const LOADED_MARKER = /<!-- edit-post-loaded: ([a-z0-9/-]+) -->/;

/*
  The sections written into the issue when a page is loaded, in order. `when` picks the
  ones that apply to this page, so a news post never shows event fields. The tip is a
  hidden comment, visible only while editing the issue. "Slug" must match the label in
  edit-post.yml, since step 1 comes from the template.
*/
const EDIT_SECTIONS = [
  { id: "slug", label: "Slug", tip: "Which page this is. Change it to load a different page instead." },
  { id: "title_sv", label: "Titel (svenska)", lang: "sv" },
  { id: "title_en", label: "Title (English)", lang: "en" },
  { id: "summary_sv", label: "Sammanfattning (svenska)", lang: "sv", when: (c) => c.isEvent, tip: "One sentence, shown in the event list." },
  { id: "summary_en", label: "Summary (English)", lang: "en", when: (c) => c.isEvent },
  { id: "body_sv", label: "Text (svenska)", lang: "sv", tip: "The whole text of the page. You can drag new images straight in." },
  { id: "body_en", label: "Text (English)", lang: "en" },
  { id: "cover", label: "Cover image", tip: "Drag in one new image to replace the cover, or leave this as it is." },
  { id: "gallery", label: "Add gallery images", when: (c) => !c.isEvent, tip: "Drag in images to add them to the gallery." },
  { id: "start", label: "Start", when: (c) => c.oneOff, tip: "Date and 24-hour time, e.g. 2026-05-31 16:00." },
  { id: "end", label: "End", when: (c) => c.oneOff },
  { id: "checkin_time", label: "Check-in", when: (c) => c.oneOff, tip: "Clear it to remove the check-in time." },
  { id: "price", label: "Price (SEK)", when: (c) => c.oneOff, tip: "Numbers only. Clear it, or 0, for free." },
  { id: "tournament_url", label: "Tournament page", when: (c) => c.oneOff, tip: "Signup or bracket page. Clear it to remove the link." },
  { id: "discord_url", label: "Discord event link", when: (c) => c.oneOff, tip: "Clear it to remove the link." },
];

/*
  Splits the issue body on "### <label>" lines. Only a known section label, the first
  time it appears, starts a new section; any other ### line (a heading the author wrote)
  stays part of the text, unlike in GitHub's own issue form parser.
*/
function parseEditIssue(body) {
  const labels = new Map(EDIT_SECTIONS.map(({ id, label }) => [label, id]));
  const out = {};
  let current = null;
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const id = labels.get(line.match(/^###\s+(.+?)\s*$/)?.[1]);
    if (id && !(id in out)) {
      current = id;
      out[id] = "";
    } else if (current) {
      out[current] += `${line}\n`;
    }
  }
  return out;
}

/*
  Accepts a bare slug, "news/<slug>" / "events/<slug>", or the page's whole address
  (https://negativeedge.se/en/news/<slug>/). Returns { section, slug }, section "" if bare.
*/
function parsePageRef(value) {
  const ref = value
    .trim()
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^(en|sv)\//, "");
  const m = ref.match(/^(?:(news|events)\/)?([^/]+)$/);
  if (!m) {
    throw new UserError(
      `**Slug** must look like \`ggst-sep-2026-results\`, \`news/ggst-sep-2026-results\`, or the page's address. Got \`${value}\`.`,
    );
  }
  return { section: m[1] ?? "", slug: validSlug(m[2], "Slug", "ggst-sep-2026-results") };
}

async function findPage({ section, slug }) {
  const newsDir = path.join(REPO, "content/news", slug);
  const eventDir = path.join(REPO, "content/events", slug);
  const isNews = section !== "events" && (await exists(newsDir));
  const isEvent = section !== "news" && (await exists(eventDir));
  if (!isNews && !isEvent) {
    throw new UserError(
      `There is no post or event called \`${slug}\`. The slug is the last part of the page's address, ` +
        `e.g. \`ggst-sep-2026-results\` for negativeedge.se/news/ggst-sep-2026-results/.`,
    );
  }
  if (isNews && isEvent) {
    throw new UserError(
      `\`${slug}\` is both a news post and an event. Write \`news/${slug}\` or \`events/${slug}\` in **Slug** to pick one.`,
    );
  }
  const dir = isNews ? newsDir : eventDir;
  const dataFile = path.join(dir, "data.toml");
  return {
    dir,
    isEvent,
    rel: path.relative(REPO, dir),
    dataFile,
    data: isEvent && (await exists(dataFile)) ? (await readFile(dataFile, "utf8")).replace(/\r\n?/g, "\n") : "",
  };
}

async function readPages(dir) {
  const pages = {};
  for (const lang of LANGS) {
    const file = path.join(dir, `index.${lang}.md`);
    if (await exists(file)) pages[lang] = { file, ...splitFrontMatter(await readFile(file, "utf8"), file) };
  }
  return pages;
}

const ISO_TO_FORM = (iso) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "");

async function loadIntoIssue(ref, key) {
  const target = await findPage(ref);
  const pages = await readPages(target.dir);
  const oneOff = target.isEvent && Boolean(getString(target.data, "start_date"));
  const values = { slug: key };

  for (const [lang, page] of Object.entries(pages)) {
    values[`title_${lang}`] = getString(page.front, "title");
    values[`summary_${lang}`] = getString(page.front, "summary");
    values[`body_${lang}`] = page.body;
  }

  const coverPath = target.isEvent
    ? getString(target.data, "cover")
    : getString(pages.sv?.front ?? pages.en?.front ?? "", "cover");
  values.cover = coverPath ? `Current: \`${coverPath}\`` : "";

  if (oneOff) {
    values.start = ISO_TO_FORM(getString(target.data, "start_date"));
    values.end = ISO_TO_FORM(getString(target.data, "end_date"));
    values.checkin_time = getString(target.data, "checkin_time");
    values.price = target.data.match(/^price\s*=\s*(\d+)/m)?.[1] ?? "";
    values.tournament_url = getString(target.data, "tournament_url") || getString(target.data, "challonge_url");
    values.discord_url = getString(target.data, "discord_url");
  }

  const context = { isEvent: target.isEvent, oneOff };
  const sections = EDIT_SECTIONS
    .filter(({ lang, when }) => (!lang || pages[lang]) && (!when || when(context)))
    .map(({ id, label, tip }) => [`### ${label}`, tip && `<!-- tip: ${tip} -->`, values[id] ?? ""].filter(Boolean).join("\n\n"));

  const body = [
    `_Editing \`${target.rel}\`. Edit this issue (⋯ → Edit) and change what you want; saving opens or updates a pull request._`,
    ...sections,
    `<!-- edit-post-loaded: ${key} -->`,
  ].join("\n\n") + "\n";

  const notes = [
    `I loaded the current content of \`${target.rel}\` into this issue.`,
    "",
    "**Edit the issue** (⋯ → Edit) and change what you want right in the text. Saving opens a pull request with your changes, and every later edit updates it.",
  ];
  if (target.isEvent && !oneOff) {
    notes.push("", "This is a recurring event, so its dates and times cannot be changed here.");
  }
  return { mode: "loaded", issue_body: body, comment: notes.join("\n") };
}

async function saveFromIssue(ref) {
  const { slug } = ref;
  const target = await findPage(ref);
  const { dir, rel, isEvent, dataFile } = target;
  const pages = await readPages(dir);
  const changes = [];

  /* ----- text, per language ----- */

  for (const lang of LANGS) {
    const page = pages[lang];
    if (!page) {
      if (field(`title_${lang}`) || field(`body_${lang}`)) {
        throw new UserError(`\`${rel}\` has no ${lang} version, so it cannot be changed here.`);
      }
      continue;
    }
    page.original = joinFrontMatter(page);

    const title = has(`title_${lang}`) ? required(`title_${lang}`, `Title (${lang})`) : getString(page.front, "title");
    if (title !== getString(page.front, "title")) {
      page.front = setKey(page.front, "title", tomlString(title));
      changes.push(`New ${lang} title.`);
    }

    const summary = has(`summary_${lang}`) ? field(`summary_${lang}`) : getString(page.front, "summary");
    if (summary !== getString(page.front, "summary")) {
      if (!summary && isEvent) throw new UserError(`**Summary (${lang})** is shown in the event list and cannot be empty.`);
      page.front = setKey(page.front, "summary", summary ? tomlString(summary) : null);
      changes.push(`New ${lang} summary.`);
    }

    const body = has(`body_${lang}`) ? await rewriteBody(required(`body_${lang}`, `Text (${lang})`), dir) : page.body;
    if (body !== page.body.trim()) {
      page.body = body;
      changes.push(`New ${lang} text.`);
    }
  }

  /* ----- cover: only a newly dragged-in image replaces it ----- */

  const cover = imageUrls(field("cover")).length ? await coverImage("cover") : null;
  let newCoverPath = "";
  if (cover && isEvent) {
    const imagesDir = path.join(REPO, "assets/images");
    const name = await freeName(imagesDir, (i) => (i === 1 ? `${slug}-cover` : `${slug}-cover-${i}`));
    newCoverPath = `/images/${await writeImage(imagesDir, name, cover)}`;
  } else if (cover) {
    newCoverPath = await writeImage(dir, await freeName(dir, (i) => (i === 1 ? "cover" : `cover-${i}`)), cover);
    for (const page of Object.values(pages)) page.front = setKey(page.front, "cover", tomlString(newCoverPath));
  }
  if (newCoverPath) changes.push(`New cover \`${newCoverPath}\`.`);

  /* ----- news: extra gallery images ----- */

  if (field("gallery")) {
    if (isEvent) throw new UserError("**Add gallery images** only works on news posts.");
    const added = await writeGallery(dir);
    for (const [lang, page] of Object.entries(pages)) {
      if (added && !page.body.includes("{{< gallery")) {
        page.body += `\n\n## ${lang === "sv" ? "Galleri" : "Gallery"}\n\n{{< gallery >}}`;
      }
    }
    if (added) changes.push(`Added ${added} gallery image${added === 1 ? "" : "s"}.`);
  }

  /* ----- event: data.toml, as the full state of each field ----- */

  if (isEvent) {
    let data = target.data;
    const originalData = data;
    const eventFields = ["start", "end", "checkin_time", "price", "tournament_url", "discord_url"];

    if (!getString(data, "start_date")) {
      if (eventFields.some((id) => field(id))) {
        throw new UserError(`\`${slug}\` is a recurring event; its dates are a schedule this form cannot change.`);
      }
    } else if (has("start") || has("end")) {
      const start = parseStart(required("start", "Start"));
      const end = parseEnd(required("end", "End"), start.day);
      if (localDateTime(end.day, end.time) <= localDateTime(start.day, start.time)) {
        throw new UserError("**End** must be after **Start**.");
      }
      data = setKey(data, "start_date", tomlString(localDateTime(start.day, start.time)));
      data = setKey(data, "end_date", tomlString(localDateTime(end.day, end.time)));

      const checkinInput = field("checkin_time");
      const checkin = checkinInput ? clockTime(checkinInput) : "";
      if (checkinInput && !checkin) {
        throw new UserError(`**Check-in** must be a 24-hour time like \`15:30\`. Got \`${checkinInput}\`.`);
      }
      data = setKey(data, "checkin_time", checkin ? tomlString(checkin) : null);

      const price = field("price");
      if (price && !/^\d+$/.test(price)) {
        throw new UserError(`**Price** must be a whole number of kronor, or blank if free. Got \`${price}\`.`);
      }
      data = price && price !== "0"
        ? setKey(setKey(data, "price", price), "price_currency", tomlString("SEK"))
        : setKey(setKey(data, "price", null), "price_currency", null);

      /* Older events store the link as challonge_url; an unchanged link stays put. */
      const tournament = link("tournament_url", "Tournament page");
      if (tournament !== (getString(data, "tournament_url") || getString(data, "challonge_url"))) {
        data = setKey(setKey(data, "challonge_url", null), "tournament_url", tournament ? tomlString(tournament) : null);
      }
      const discord = link("discord_url", "Discord event link");
      data = setKey(data, "discord_url", discord ? tomlString(discord) : null);
    }

    if (newCoverPath) {
      const oldPath = getString(data, "cover");
      data = setKey(data, "cover", tomlString(newCoverPath));

      /* The announcement post points at the same shared cover path. */
      if (oldPath) {
        for (const post of await readdir(path.join(REPO, "content/news"))) {
          for (const lang of LANGS) {
            const file = path.join(REPO, "content/news", post, `index.${lang}.md`);
            if (!(await exists(file))) continue;
            const source = await readFile(file, "utf8");
            if (!source.includes(oldPath)) continue;
            const page = splitFrontMatter(source, file);
            if (getString(page.front, "cover") !== oldPath) continue;
            page.front = setKey(page.front, "cover", tomlString(newCoverPath));
            await writeFile(file, joinFrontMatter(page));
            changes.push(`Updated the cover of \`content/news/${post}\` (${lang}) too.`);
          }
        }
      }
    }

    if (data.trim() !== originalData.trim()) {
      await writeFile(dataFile, `${data.trim()}\n`);
      const withoutCover = (toml) => toml.replace(/^cover\s*=.*$/m, "").trim();
      if (withoutCover(data) !== withoutCover(originalData)) changes.push("Updated the event details.");
    }
  }

  for (const page of Object.values(pages)) {
    const updated = joinFrontMatter(page);
    if (updated !== page.original) await writeFile(page.file, updated);
  }

  return {
    mode: "saved",
    title: `Edit: ${slug}`,
    summary: changes.length
      ? [`Edits \`${rel}\`:`, "", ...changes.map((c) => `- ${c}`)].join("\n")
      : `No differences from the live \`${rel}\` yet.`,
  };
}

async function editPost() {
  const ref = parsePageRef(required("slug", "Slug"));
  /* Always record the unambiguous section/slug, so a later save hits the same page. */
  const key = `${(await findPage(ref)).isEvent ? "events" : "news"}/${ref.slug}`;
  const loaded = (process.env.ISSUE_BODY ?? "").match(LOADED_MARKER)?.[1];

  /* Load when this slug's content is not in the issue yet. A TO who deleted the hidden
     marker but already has text in the issue is saving, not asking for a reload. */
  const hasContent = LANGS.some((lang) => field(`title_${lang}`) || field(`body_${lang}`));
  if (loaded ? loaded !== key : !hasContent) return loadIntoIssue(ref, key);
  return saveFromIssue({ section: key.split("/")[0], slug: ref.slug });
}

/* ---------- plumbing ---------- */

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delimiter = `EOF_${randomUUID()}`;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

const BUILDERS = {
  "new-tournament": newTournament,
  "news-post": newsPost,
  "edit-post": editPost,
};

const formType = process.argv[2];
const build = BUILDERS[formType];
if (!build) {
  console.error(`Unknown form type: ${formType}. Expected one of ${Object.keys(BUILDERS).join(", ")}.`);
  process.exit(2);
}

try {
  const result = await build();
  /* Keyed on the issue, not the slug, so renaming the slug in an edit updates the
     same PR instead of opening a second one. */
  result.branch = `issue-form/${issueNumber}`;
  for (const [key, value] of Object.entries(result)) await setOutput(key, value);
  console.log(result.summary);
} catch (error) {
  /* Anything that is not the author's mistake (network failure, a bug here) still gets
     a comment on the issue, pointing at the run log instead of failing silently. */
  const message = error instanceof UserError
    ? error.message
    : "Something went wrong on our side, not in your form." +
      " If editing the issue to retry does not help, ask in Discord.";
  await setOutput("error", message);
  console.error(error instanceof UserError ? error.message : error);
  process.exit(1);
}

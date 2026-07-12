/*
  Turns a parsed GitHub Issue Form into Hugo content.

  Usage: node build-content.mjs <new-event|tournament-results>
  Reads the parsed issue JSON from $ISSUE_JSON (stefanbuck/github-issue-parser).

  On a validation failure it writes a reader-friendly explanation to $GITHUB_OUTPUT
  as `error` and exits 1; the workflow posts that back as an issue comment.
*/

import { mkdir, writeFile, readdir, access, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../..");
const TZ = "Europe/Stockholm";

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

const fields = JSON.parse(process.env.ISSUE_JSON ?? "{}");

function field(id) {
  const raw = fields[id];
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return value === NO_RESPONSE ? "" : value;
}

function required(id, label) {
  const value = field(id);
  if (!value) throw new UserError(`**${label}** is required but was left empty.`);
  return value;
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

function parseStart(value) {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
  if (!m) {
    throw new UserError(
      `**Start** must look like \`2026-05-31 16:00\` (date, space, 24-hour time). Got \`${value}\`.`,
    );
  }
  return { day: m[1], time: m[2] };
}

/* End may be just a time (same day as start) or a full date and time. */
function parseEnd(value, startDay) {
  const timeOnly = value.match(/^(\d{2}:\d{2})$/);
  if (timeOnly) return { day: startDay, time: timeOnly[1] };

  const full = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
  if (!full) {
    throw new UserError(
      `**End** must be a time like \`20:00\`, or a full \`2026-05-31 20:00\`. Got \`${value}\`.`,
    );
  }
  return { day: full[1], time: full[2] };
}

function subtractMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m - minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* ---------- TOML ---------- */

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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

/* The repo is public, so attachment URLs need no auth. */
async function download(url) {
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
}

function imageUrls(text) {
  return [...new Set(text.match(IMAGE_URL) ?? [])];
}

async function writeImage(dir, name, image) {
  await mkdir(dir, { recursive: true });
  const file = `${name}.${image.ext}`;
  await writeFile(path.join(dir, file), image.bytes);
  return file;
}

/*
  Rewrites images the author dragged into the body into the site's figure shortcode,
  so they get the WebP/JPEG <picture> pipeline in partials/img.html. The markdown alt
  text becomes the caption. Images are saved into the page bundle alongside index.*.md.
*/
async function rewriteBody(body, bundle) {
  const urls = imageUrls(body);
  let out = body;

  for (const [i, url] of urls.entries()) {
    const file = await writeImage(bundle, `image-${i + 1}`, await download(url));
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /* ![caption](url) first, so the alt text is not lost, then any bare occurrences. */
    out = out
      .replace(
        new RegExp(`!\\[([^\\]]*)\\]\\(\\s*${escaped}\\s*\\)`, "g"),
        (_, caption) =>
          caption.trim()
            ? `{{< figure src="${file}" caption="${caption.trim().replace(/"/g, "'")}" >}}`
            : `{{< figure src="${file}" >}}`,
      )
      .replace(new RegExp(escaped, "g"), file);
  }

  return out.trim();
}

/* ---------- announcement body ---------- */

/*
  The announcement currently repeats price, check-in and start time as a hand-typed
  sentence, even though all three are already fields in data.toml. Generate it instead.
  Parts drop out when the matching field is blank (free event, no signup link).
*/
function logistics(lang, { price, checkinTime, startTime, challongeUrl }) {
  const t = lang === "sv"
    ? {
        entry: (p) => `Inträde ${p} kr`,
        free: "Gratis inträde",
        checkin: (c) => `check-in ${c}`,
        start: (s) => `start ${s}`,
        signup: (u) => `Anmäl dig via [Challonge](${u}).`,
      }
    : {
        entry: (p) => `Entry ${p} SEK`,
        free: "Free entry",
        checkin: (c) => `check-in ${c}`,
        start: (s) => `start ${s}`,
        signup: (u) => `Sign up on [Challonge](${u}).`,
      };

  const parts = [price ? t.entry(price) : t.free, t.checkin(checkinTime), t.start(startTime)];
  const sentences = [`${parts.join(", ")}.`];
  if (challongeUrl) sentences.push(t.signup(challongeUrl));
  return sentences.join(" ");
}

/* ---------- form A: new event + its announcement ---------- */

async function newEvent() {
  const slug = required("slug", "URL name");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new UserError(
      `**URL name** must be lowercase letters, numbers and hyphens only, e.g. \`kappa-kabrak-4\`. Got \`${slug}\`.`,
    );
  }

  const eventDir = path.join(REPO, "content/events", slug);
  const newsDir = path.join(REPO, "content/news", `${slug}-announcement`);
  for (const dir of [eventDir, newsDir]) {
    if (await exists(dir)) {
      throw new UserError(
        `\`${path.relative(REPO, dir)}\` already exists. Pick a different **URL name**.`,
      );
    }
  }

  const start = parseStart(required("start", "Start"));
  const end = parseEnd(required("end", "End"), start.day);

  const startAt = new Date(`${start.day}T${start.time}:00`);
  const endAt = new Date(`${end.day}T${end.time}:00`);
  if (endAt <= startAt) throw new UserError("**End** must be after **Start**.");

  const checkinTime = field("checkin_time") ||
    subtractMinutes(start.time, CHECKIN_MINUTES_BEFORE_START);

  const price = field("price");
  if (price && !/^\d+$/.test(price)) {
    throw new UserError(`**Price** must be a whole number of kronor, or blank if free. Got \`${price}\`.`);
  }

  const challongeUrl = field("challonge_url");
  const discordUrl = field("discord_url");

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
    ["sv", "en"].map((lang) => [
      lang,
      {
        title: required(`title_${lang}`, `Title (${lang})`),
        summary: required(`summary_${lang}`, `Summary (${lang})`),
        body: required(`body_${lang}`, `Description (${lang})`),
      },
    ]),
  );

  /* The event and the announcement share one cover file, which is why it goes in
     static/images/ rather than either page bundle. */
  const coverUrls = imageUrls(required("cover", "Cover image"));
  if (coverUrls.length === 0) {
    throw new UserError("**Cover image** did not contain an image. Drag an image file into that box.");
  }
  const coverFile = await writeImage(path.join(REPO, "static/images"), slug, await download(coverUrls[0]));
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
      ...(challongeUrl ? [`challonge_url = ${tomlString(challongeUrl)}`] : []),
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
  const publishedDay = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(now);

  for (const lang of ["sv", "en"]) {
    const { title, summary, body } = text[lang];

    /* Images in the body belong to whichever bundle renders them, so each bundle gets
       its own copy. Rewriting per bundle keeps the src filenames correct in both. */
    await writeFile(
      path.join(eventDir, `index.${lang}.md`),
      frontMatter({
        title: tomlString(title),
        date: publishedDay,
        draft: "false",
        summary: tomlString(summary),
      }) + `\n${await rewriteBody(body, eventDir)}\n`,
    );

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
        `\n${await rewriteBody(body, newsDir)}\n\n` +
        `${logistics(lang, { price, checkinTime, startTime: start.time, challongeUrl })}\n`,
    );
  }

  return {
    branch: `event/${slug}`,
    title: `Nytt event: ${field("title_sv")}`,
    summary: `Adds the event \`${slug}\` and its announcement post \`${slug}-announcement\`.`,
  };
}

/* ---------- form B: tournament results ---------- */

async function tournamentResults() {
  const eventSlug = required("event_slug", "Event");
  const eventDir = path.join(REPO, "content/events", eventSlug);

  if (!(await exists(eventDir))) {
    const events = (await readdir(path.join(REPO, "content/events"), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== "archive")
      .map((e) => `- \`${e.name}\``);
    throw new UserError(
      `There is no event called \`${eventSlug}\`. **Event** must be one of:\n\n${events.join("\n")}`,
    );
  }

  const newsDir = path.join(REPO, "content/news", `${eventSlug}-results`);
  if (await exists(newsDir)) {
    throw new UserError(
      `\`content/news/${eventSlug}-results\` already exists. Results for this event have already been posted.`,
    );
  }

  /* Read and validate everything before anything is written, so a failure here
     cannot leave a half-built bundle on the branch. */
  const text = Object.fromEntries(
    ["sv", "en"].map((lang) => [
      lang,
      {
        title: required(`title_${lang}`, `Title (${lang})`),
        intro: required(`intro_${lang}`, `Intro (${lang})`),
        body: required(`body_${lang}`, `Write-up (${lang})`),
      },
    ]),
  );

  /* Authors type `1 | feffe | May`; the shortcode expects the player name bolded. */
  const placements = field("results")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) {
        throw new UserError(
          `Each **Results** line needs \`place | player | character\`, e.g. \`1 | feffe | May\`. Got \`${line}\`.`,
        );
      }
      const [place, player, ...rest] = parts;
      const name = /^\*\*.*\*\*$/.test(player) ? player : `**${player}**`;
      return `${place} | ${name} | ${rest.join(" | ")}`;
    });

  const coverUrls = imageUrls(required("cover", "Cover image"));
  if (coverUrls.length === 0) {
    throw new UserError("**Cover image** did not contain an image. Drag an image file into that box.");
  }
  const coverFile = await writeImage(newsDir, "cover", await download(coverUrls[0]));

  /* The gallery shortcode is zero-config: it globs <bundle>/gallery/. */
  const gallery = imageUrls(field("gallery"));
  for (const [i, url] of gallery.entries()) {
    await writeImage(path.join(newsDir, "gallery"), String(i + 1), await download(url));
  }

  const now = new Date();

  for (const lang of ["sv", "en"]) {
    const { title, intro, body } = text[lang];

    const sections = [await rewriteBody(body, newsDir)];
    if (placements.length > 0) {
      sections.unshift(`{{< tournament-results >}}\n${placements.join("\n")}\n{{< /tournament-results >}}`);
    }
    if (gallery.length > 0) sections.push("{{< gallery >}}");

    await writeFile(
      path.join(newsDir, `index.${lang}.md`),
      frontMatter({
        title: tomlString(title),
        date: tomlString(rfc3339(now)),
        draft: "false",
        cover: tomlString(coverFile),
        event_link: `[${tomlString(eventSlug)}]`,
        event_role: tomlString("recap"),
      }) + `\n${intro}\n\n<!--more-->\n\n${sections.join("\n\n")}\n`,
    );
  }

  return {
    branch: `results/${eventSlug}`,
    title: `Resultat: ${field("title_sv")}`,
    summary: `Adds the results post \`${eventSlug}-results\`, linked to the event \`${eventSlug}\`.`,
  };
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
  "new-event": newEvent,
  "tournament-results": tournamentResults,
};

const build = BUILDERS[process.argv[2]];
if (!build) {
  console.error(`Unknown form type: ${process.argv[2]}. Expected one of ${Object.keys(BUILDERS).join(", ")}.`);
  process.exit(2);
}

try {
  const result = await build();
  for (const [key, value] of Object.entries(result)) await setOutput(key, value);
  console.log(result.summary);
} catch (error) {
  if (!(error instanceof UserError)) throw error;
  await setOutput("error", error.message);
  console.error(error.message);
  process.exit(1);
}

+++
title = "Site Meeting: Key Features & Next Steps"
date = "2025-11-06T12:30:00+01:00"
draft = false
# cover = "/images/meeting-placeholder.jpg"
+++

This post is a quick summary of the key features we've implemented for the new website and some talking points for our meeting today.

### 1. Implemented Features

This is what we can show off right now:

* **Dynamic Homepage:** The homepage is now a central "hub" and no longer just a static page.
    * It has a custom "hero" section with links.
    * It has a horizontal "Recent News" feed that automatically pulls the 3 most recent posts.
    * It has an "Upcoming Events" list that automatically shows the 5 closest valid event dates.

* **Robust Events System:** We have a powerful "set-it-and-forget-it" system for all events.
    * **Recurring Events:** We can create events like the "Bi-Weekly Meetup" with a complete list of scheduled dates for a year.
    * **One-off Events:** We can easily add special events like the "Winter Warm-up Tournament."
    * **Cancelled Dates:** We can add a list of cancelled dates, and the site will automatically skip them in the "Upcoming" list.

* **Custom Styling & Mobile View:**
    * The layout is fully responsive. In mobile mode, the horizontal cards "stack" into a clean, vertical list with line separators.

### 2. Discussion Points & Next Steps

* **Language:** Should we support multiple languages? And if not, should we have everything in English, everything in Swedish, or even a mix?
    (e.g., all "base" elements could be in English, but news content is in Swedish (don't think this is a good solution, but just to give an example))
    
    * Worth considering is that this might lead to us needing to translate all events/news posts when we post them too.
    * Maybe not the hardest job in the world, generally they're probably not that long and LLMs are practically made for this kind of thing to begin with.
    * So writing in Swedish and then running it through an LLM to translate to English and fix any issues probably won't take much time.

* **Overview:** We need to take a look at the site's content in general.
    * Are these pages/page categories right? Should any category be added or removed? e.g., "Bli medlem" (Join) could perhaps be removed and placed in "Om oss" (About) or similar.
    * Are the names right? Change "Nyheter" (News) to "Poster" (Posts) or similar?

* **Finalize Content:** We need to fill in the rest of the content.
    * Write the final text for the "Om oss" and "Bli medlem" pages.

* **Known "Bugs" (and Our Fixes):**
    * The theme's menu sorting was broken (as seen on GitHub). We fixed it by prefixing the menu identifiers with the number they are sorted by.

* **Footer:** It's very bare-bones at the moment.
    * Maybe include links to the main pages (news, events, etc.), contact email.
* **Domain Name:** What should the domain name be?
    * negativeedge.se

### 3. Immediate Actions

We've decided these things must be done as soon as possible and are delegated to a responsible person to ensure they are done before the next meeting/some arbitrary time/whatever.

* **Action:** Finish writing the text for "Om oss".
    **Responsible:** (Fill in name)
    *Recommendation:* Segments: General info about the association, History, Board Members, and Contact Information(?)
---
* **Action:** Fill the "Bli medlem" (Join) page with all the information required for someone to become a member via the current system.
    **Responsible:** (Fill in name)
---
* **Action:** Add all event schedules that we know of so far.
    **Responsible:** (Fill in name)
---
* **Action:** Add all news posts from recent events (like Borås, maybe a few more).
    **Responsible:** (Fill in name)
---
* **Action:** Write a news post for the website's launch.
    **Responsible:** (Fill in name)
---
* **Action:** Fix the domain.
    **Responsible:** (Fill in name) \
    *Recommendation:* Buy from EuroDNS with the association's organization number in the WHOIS info. Set up an account on Cloudflare to manage DNS and point the EuroDNS entry's nameservers to the Cloudflare nameservers. \
    *Recommendation 2:* Just pull Feffe in when you're fixing this and I can guide you through it. \
    *Recommendation 3:* EuroDNS was chosen somewhat arbitrarily based on me having previously managed chalmers.it via them, and it was easy to handle correct WHOIS info if I remember correctly. Other domain registrars should work too.
---
* **Action:** Fix icons. A hell of a lot of different sizes are needed to work on all browsers. https://realfavicongenerator.net/
    **Responsible:** (Fill in name)

### 4. Extra Things

Here I'm just writing a bunch of "good-to-haves," things someone might want to start thinking about, etc.

* **Light Mode:** A hassle to implement on our custom components. Might be worth considering. Is it important enough?

* **New "Join" Flow:** The process of becoming a member of the association could probably be simplified a lot. Think about other flows that would fit.

* **Emails for the new domain:** Idk, might be nice, like contact@negativeedge.se or whatever. or <nick>@negativeedge.se

* **Consider SEO improvements:** I have no fucking clue man, like making sure we've filled in all the things Google scrapes, robots.txt, whatever.

now I'm gonna go eat my lunch ciao ciao

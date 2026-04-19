+++
title = "Event Title"
date = {{ .Date }}
draft = true

# --- LANGUAGE-SPECIFIC FIELDS (goes in index.en.md / index.sv.md) ---
# title and summary are translated per language
summary = "A short, one-sentence summary for the list page."

# --- SHARED FIELDS (goes in data.toml, not here) ---
# location, cover, start_date, end_date, price, recurrence schedule
# Example data.toml for a one-off event:
#
#   start_date = "2026-01-15T19:00:00"
#   end_date   = "2026-01-15T21:00:00"
#   cover      = "/images/event-cover.jpg"
#   price      = 25
#   price_currency = "SEK"
#
#   [location]
#   name = "Venue Name"
#   street = "Street Address"
#   city = "City"
#   country = "SE"
#
# Example data.toml for a recurring event:
#
#   [location]
#   name = "Venue Name"
#   street = "Street Address"
#   city = "City"
#   country = "SE"
#
#   [recurrence]
#   start_time = "19:00"
#   end_time   = "21:00"
#   schedule   = ["2026-01-06", "2026-01-13"]
#   cancellations = []
+++

Full event description.

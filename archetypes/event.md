---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true

# --- CHOOSE ONE ---

# OPTION 1: For a one-off event
# (Delete the 'recurrence' block if you use this)
start_date: 2025-12-01T19:00:00+01:00
end_date: 2025-12-01T21:00:00+01:00

# OPTION 2: For a recurring event
# (Delete 'start_date' and 'end_date' if you use this)
recurrence:
  # Type: Weekly, Monthly, Annually, etc.
  type: "Weekly"
  # Details: e.g., "Every Tuesday" or "First Sunday of the month"
  details: "Every Tuesday Evening"
  time: "19:00 - 21:00"
  cancellations:
    # - "2025-12-23"

# --- COMMON FIELDS ---
location: "Event Location"
summary: "A short, one-sentence summary for the list page."
---

Full event description goes here. You can use **Markdown**!

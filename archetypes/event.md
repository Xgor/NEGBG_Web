---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true

# --- CHOOSE ONE ---

# OPTION 1: For a one-off event
start_date: 2026-01-15T19:00:00+01:00
end_date: 2026-01-15T21:00:00+01:00

# OPTION 2: For a recurring event
recurrence:
  type: "Weekly"
  details: "Every Tuesday"
  # Use ISO time format (HH:mm)
  start_time: "19:00"
  end_time: "21:00"

  # Schedule and Cancellations are now nested inside
  schedule:
    - "2025-11-04"
    - "2025-11-11"
    - "2025-11-18"
    - "2025-11-25"
    # (etc...)

  cancellations:
    # - "2025-11-18"

# --- COMMON FIELDS ---
location: "Event Location"
summary: "A short, one-sentence summary for the list page."
---

Full event description.

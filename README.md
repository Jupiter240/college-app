# Ayan — College & Internship Tracker

Minimalist web application for tracking internships, summer programs, action items, majors, college lists, GPAs, and application deadlines across all 13 tabs of the master Google Sheet.

## Running Locally

1. **Double-click [`Start App.command`](./Start%20App.command)** on macOS (or run `python3 server.py` in a terminal).
2. Open **`http://localhost:8080`** in your browser.
   - You can also open [`index.html`](./index.html) directly in any browser for offline access.

## Key Features

- **Overview & Live Deadlines:** Automatically aggregates and sorts upcoming deadlines across Internships, To-Dos, and College Applications with live countdown badges.
- **All 13 Sheet Tabs Preserved:** Navigate across `Internship`, `Colleges`, `College Deadlines`, `Majors`, `ToDos`, `UCs`, `GPA`, `UCCSU GPA`, `NoSupplemental Colleges`, `College counselors`, `Questions for Colleen`, `Notes`, and `Diyas Notes` via the top-right 3-line hover menu.
- **Slide-Over Detail Drawer:** Click any row in any table to inspect, edit, or delete all attributes without table clutter.
- **Automatic Local Persistence:** Changes save automatically to `data/app_data.json` and `data/default_data.js`, with 1-click Google Sheet re-sync and JSON backup export/import.

# Weekform

A browser-based semester routine planner. Open `index.html` in a modern browser; no install or build step is needed.

## What it does

- Keeps separate routines for multiple semesters in this browser.
- Starts with a 12–15 credit target; set a different minimum and maximum in the General tab for each semester.
- Lets you enter your own course names and optional course codes.
- Adds one or more credit components per course: Lecture, Computer Lab, Science Lab, Language Lab, Studio, and Health Science.
- Gives each component its own credit value and one or more weekly meetings, with independently selected days and start/end hour, minute, and AM/PM values. No class times are prefilled.
- Checks meeting overlaps across every day and component. A course with a timing conflict cannot be saved until the schedule is adjusted.
- Shows the saved weekly routine in a scrollable Sunday–Saturday calendar whose time range follows the meetings you enter.

Plans are stored in this browser's local storage on this device. Clearing browser storage removes them.

The site has no account or server component: course plans remain in the visitor's browser and are not uploaded. It is an independent student tool; users should confirm final class times with their university.

## Publish with GitHub Pages

The included `.github/workflows/deploy.yml` publishes this folder as a static site when changes are pushed to the `main` branch. GitHub Pages requires a public repository on the Free plan, and the published site is public. The workflow uploads the site files and deploys them to the `github-pages` environment.


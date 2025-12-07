# Operator Blueprints – Revenue Forecast Tool

A minimalist, operator-grade revenue forecasting web app.

Built as a static web app (HTML + CSS + JS) and deployed on Vercel.

Use it to:

- Sanity-check revenue goals
- See what has to be true to hit a target
- Align your 90-Day Revenue Engine with real numbers
- Quickly compare conservative / base / aggressive scenarios

---

## Live App

> Replace this with your Vercel URL.

**Live URL:** (https://operator-blueprints-revenue-forecas.vercel.app/)

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Charts:** [Chart.js](https://www.chartjs.org/) via CDN
- **Hosting:** Vercel (static deployment – no backend)

No build tools, no frameworks. All logic is in `script.js`.

---

## Project Structure

```text
.
├── index.html    # Main page and layout
├── styles.css    # Minimalist Operator Dashboard styling
└── script.js     # Forecast logic, chart rendering, CSV export

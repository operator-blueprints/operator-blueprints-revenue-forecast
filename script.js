let forecastChart = null;
let lastForecast = null;        // for CSV export
let lastImpliedRevenue = null;  // for applying to starting revenue

function formatCurrency(value) {
  const val = Number.isFinite(value) ? value : 0;
  return val.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value) {
  const val = Number.isFinite(value) ? value : 0;
  return `${val.toFixed(1)}%`;
}

function getUnitWords(unit) {
  if (unit === "week") return { singular: "week", plural: "weeks", short: "W" };
  if (unit === "year") return { singular: "year", plural: "years", short: "Y" };
  return { singular: "month", plural: "months", short: "M" };
}

function syncPeriodsLabel(value) {
  const periods = Number(value) || 0;
  const unit = document.getElementById("timeUnit").value;
  const { singular, plural } = getUnitWords(unit);

  const label = document.getElementById("periodsLabel");
  const summary = document.getElementById("periodsSummary");
  const word = periods === 1 ? singular : plural;

  const text = `${periods} ${word}`;
  label.textContent = text;
  summary.textContent = `${periods} ${word}`;
}

function clearOutputs() {
  // KPIs
  document.getElementById("baseMRR").textContent = "–";
  document.getElementById("conservativeMRR").textContent = "–";
  document.getElementById("aggressiveMRR").textContent = "–";
  document.getElementById("totalBaseRevenue").textContent = "–";
  document.getElementById("baseRateLabel").textContent = "–";
  document.getElementById("conservativeRateLabel").textContent = "–";
  document.getElementById("aggressiveRateLabel").textContent = "–";

  // Summary
  const summaryList = document.getElementById("summaryList");
  summaryList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = "Run a forecast to populate the summary.";
  summaryList.appendChild(li);

  // Chart
  if (forecastChart) {
    forecastChart.destroy();
    forecastChart = null;
  }

  lastForecast = null;
}

function resetInputs() {
  document.getElementById("startRevenue").value = 25000;
  document.getElementById("growthRate").value = 8;
  document.getElementById("periodCount").value = 12;
  document.getElementById("timeUnit").value = "month";
  document.getElementById("conservativeFactor").value = 0.5;
  document.getElementById("aggressiveFactor").value = 1.5;

  // Notion-style inputs
  const clearIds = ["traffic", "trafficGrowth", "baselineCR", "targetCR", "aov"];
  clearIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const impliedEl = document.getElementById("impliedRevenue");
  if (impliedEl) impliedEl.textContent = "–";
  lastImpliedRevenue = null;

  syncPeriodsLabel(12);
  clearOutputs();
}

function buildSeries(startRevenue, growthRate, periods, factor, unitShort) {
  const series = [];
  const labels = [];
  const g = (growthRate / 100) * factor;

  let current = startRevenue;
  for (let i = 1; i <= periods; i++) {
    current = current * (1 + g);
    series.push(current);
    labels.push(`${unitShort}${i}`);
  }

  return { labels, series, effectiveRate: g * 100 };
}

function updateChart(labels, base, conservative, aggressive) {
  const ctx = document.getElementById("forecastChart").getContext("2d");

  if (forecastChart) {
    forecastChart.destroy();
  }

  forecastChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Base",
          data: base,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          label: "Conservative",
          data: conservative,
          borderWidth: 2,
          borderDash: [4, 3],
          tension: 0.25,
        },
        {
          label: "Aggressive",
          data: aggressive,
          borderWidth: 2,
          borderDash: [1, 2],
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#e5e7eb",
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const val = ctx.parsed.y || 0;
              return `${ctx.dataset.label}: ${formatCurrency(val)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: "#9ca3af",
            font: { size: 11 },
            callback: function (val) {
              return val >= 1000
                ? `$${(val / 1000).toFixed(0)}k`
                : `$${val}`;
            },
          },
          grid: { color: "rgba(55, 65, 81, 0.4)" },
        },
      },
    },
  });
}

function runForecast() {
  const startRevenueInput = document.getElementById("startRevenue");
  const growthRateInput = document.getElementById("growthRate");
  const periodsInput = document.getElementById("periodCount");
  const unitSelect = document.getElementById("timeUnit");
  const conservativeFactorInput = document.getElementById("conservativeFactor");
  const aggressiveFactorInput = document.getElementById("aggressiveFactor");

  let startRevenue = parseFloat(startRevenueInput.value);
  let growthRate = parseFloat(growthRateInput.value);
  let periods = parseInt(periodsInput.value, 10);
  let conservativeFactor = parseFloat(conservativeFactorInput.value);
  let aggressiveFactor = parseFloat(aggressiveFactorInput.value);
  const unit = unitSelect.value;

  if (!Number.isFinite(startRevenue) || startRevenue < 0) startRevenue = 0;
  if (!Number.isFinite(growthRate)) growthRate = 0;
  if (!Number.isFinite(periods) || periods < 1) periods = 1;

  if (!Number.isFinite(conservativeFactor)) conservativeFactor = 0.5;
  if (!Number.isFinite(aggressiveFactor)) aggressiveFactor = 1.5;

  // Guardrails on multipliers
  conservativeFactor = Math.max(0, Math.min(conservativeFactor, 3));
  aggressiveFactor = Math.max(0, Math.min(aggressiveFactor, 5));

  syncPeriodsLabel(periods);

  const { short, singular, plural } = getUnitWords(unit);

  const baseData = buildSeries(startRevenue, growthRate, periods, 1, short);
  const conservativeData = buildSeries(
    startRevenue,
    growthRate,
    periods,
    conservativeFactor,
    short
  );
  const aggressiveData = buildSeries(
    startRevenue,
    growthRate,
    periods,
    aggressiveFactor,
    short
  );

  const labels = baseData.labels;
  const baseSeries = baseData.series;
  const conservativeSeries = conservativeData.series;
  const aggressiveSeries = aggressiveData.series;

  const baseEnd = baseSeries[baseSeries.length - 1] || 0;
  const conservativeEnd = conservativeSeries[conservativeSeries.length - 1] || 0;
  const aggressiveEnd = aggressiveSeries[aggressiveSeries.length - 1] || 0;

  const totalBase = baseSeries.reduce((sum, v) => sum + v, 0);

  // Update KPI strip
  document.getElementById("baseMRR").textContent = formatCurrency(baseEnd);
  document.getElementById("conservativeMRR").textContent =
    formatCurrency(conservativeEnd);
  document.getElementById("aggressiveMRR").textContent =
    formatCurrency(aggressiveEnd);
  document.getElementById("totalBaseRevenue").textContent =
    formatCurrency(totalBase);

  document.getElementById("baseRateLabel").textContent =
    formatPercent(growthRate);
  document.getElementById("conservativeRateLabel").textContent =
    formatPercent(growthRate * conservativeFactor);
  document.getElementById("aggressiveRateLabel").textContent =
    formatPercent(growthRate * aggressiveFactor);

  // Update textual summary
  const summaryList = document.getElementById("summaryList");
  summaryList.innerHTML = "";

  const unitWordPlural = periods === 1 ? singular : plural;

  const items = [
    `Base: Starting from ${formatCurrency(
      startRevenue
    )} with ${formatPercent(
      growthRate
    )} ${unitWordPlural} growth, you end at ${formatCurrency(
      baseEnd
    )} in recurring revenue.`,
    `Conservative: At ${formatPercent(
      growthRate * conservativeFactor
    )} ${unitWordPlural} growth, you end at ${formatCurrency(
      conservativeEnd
    )}.`,
    `Aggressive: At ${formatPercent(
      growthRate * aggressiveFactor
    )} ${unitWordPlural} growth, you end at ${formatCurrency(
      aggressiveEnd
    )}.`,
    `Total base scenario revenue over ${periods} ${unitWordPlural} is ${formatCurrency(
      totalBase
    )}.`,
  ];

  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    summaryList.appendChild(li);
  });

  // Update chart
  updateChart(labels, baseSeries, conservativeSeries, aggressiveSeries);

  // Store for CSV export
  lastForecast = {
    labels,
    baseSeries,
    conservativeSeries,
    aggressiveSeries,
    unit,
  };
}

function downloadCSV() {
  if (!lastForecast) {
    alert("Run a forecast first to generate data for export.");
    return;
  }

  const { labels, baseSeries, conservativeSeries, aggressiveSeries, unit } =
    lastForecast;
  const { singular } = getUnitWords(unit);
  const header = ["Period", `Base (${singular})`, "Conservative", "Aggressive"];

  const rows = [header.join(",")];

  for (let i = 0; i < labels.length; i++) {
    const row = [
      labels[i],
      Math.round(baseSeries[i] || 0),
      Math.round(conservativeSeries[i] || 0),
      Math.round(aggressiveSeries[i] || 0),
    ];
    rows.push(row.join(","));
  }

  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "operator-blueprints-revenue-forecast.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function updateImpliedRevenue() {
  const trafficEl = document.getElementById("traffic");
  const baselineCREl = document.getElementById("baselineCR");
  const aovEl = document.getElementById("aov");
  const impliedEl = document.getElementById("impliedRevenue");

  if (!trafficEl || !baselineCREl || !aovEl || !impliedEl) return;

  const traffic = parseFloat(trafficEl.value);
  const conv = parseFloat(baselineCREl.value);
  const aov = parseFloat(aovEl.value);

  if (!Number.isFinite(traffic) || !Number.isFinite(conv) || !Number.isFinite(aov)) {
    impliedEl.textContent = "–";
    lastImpliedRevenue = null;
    return;
  }

  const customers = traffic * (conv / 100);
  const revenue = customers * aov;

  lastImpliedRevenue = revenue;
  impliedEl.textContent = formatCurrency(revenue);
}

function applyImpliedToStart() {
  if (!Number.isFinite(lastImpliedRevenue)) {
    alert("Set Traffic, Baseline Conversion, and AOV first.");
    return;
  }
  const startInput = document.getElementById("startRevenue");
  startInput.value = Math.round(lastImpliedRevenue);
}

// Initialize on load: set labels and clear outputs, but DO NOT run forecast
document.addEventListener("DOMContentLoaded", () => {
  const periodsInput = document.getElementById("periodCount");
  if (periodsInput) {
    syncPeriodsLabel(periodsInput.value);
  }
  clearOutputs();

  // Hook Notion-style inputs to implied revenue calculator
  ["traffic", "baselineCR", "aov"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateImpliedRevenue);
    }
  });
});

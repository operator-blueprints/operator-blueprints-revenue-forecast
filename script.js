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

  // Reset growth mode
  const percentMode = document.querySelector('input[name="growthMode"][value="percent"]');
  if (percentMode) percentMode.checked = true;

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

function buildSeriesPercent(startRevenue, growthRate, periods, factor, unitShort) {
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

function computeCagr(start, end, periods) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || periods <= 1) {
    return 0;
  }
  const ratio = end / start;
  const perPeriod = Math.pow(ratio, 1 / (periods - 1)) - 1;
  return perPeriod * 100;
}

function buildSeriesTraffic(params, factor, mode) {
  const {
    traffic,
    trafficGrowth,
    baselineCR,
    targetCR,
    aov,
    periods,
    unitShort,
  } = params;

  const labels = [];
  const baseSeries = [];
  const gTraffic = (trafficGrowth / 100) * factor;

  for (let i = 1; i <= periods; i++) {
    const step = periods > 1 ? (i - 1) / (periods - 1) : 0;
    const t = traffic * Math.pow(1 + gTraffic, i - 1);

    let cr;
    if (mode === "base") {
      cr = baselineCR + (targetCR - baselineCR) * step; // full ramp
    } else if (mode === "conservative") {
      cr = baselineCR + (targetCR - baselineCR) * step * 0.5; // half ramp
    } else {
      // aggressive
      const adjStep = Math.min(1, step * 1.5);
      cr = baselineCR + (targetCR - baselineCR) * adjStep;
    }

    const customers = t * (cr / 100);
    const revenue = customers * aov;

    baseSeries.push(revenue);
    labels.push(`${unitShort}${i}`);
  }

  return { labels, series: baseSeries };
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

  const mode =
    document.querySelector('input[name="growthMode"]:checked')?.value || "percent";

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

  let labels = [];
  let baseSeries = [];
  let conservativeSeries = [];
  let aggressiveSeries = [];
  let baseRate = 0;
  let consRate = 0;
  let aggRate = 0;

  if (mode === "percent") {
    // PERCENTAGE MODE (existing behavior)
    const baseData = buildSeriesPercent(startRevenue, growthRate, periods, 1, short);
    const conservativeData = buildSeriesPercent(
      startRevenue,
      growthRate,
      periods,
      conservativeFactor,
      short
    );
    const aggressiveData = buildSeriesPercent(
      startRevenue,
      growthRate,
      periods,
      aggressiveFactor,
      short
    );

    labels = baseData.labels;
    baseSeries = baseData.series;
    conservativeSeries = conservativeData.series;
    aggressiveSeries = aggressiveData.series;

    baseRate = growthRate;
    consRate = growthRate * conservativeFactor;
    aggRate = growthRate * aggressiveFactor;
  } else {
    // TRAFFIC · CONVERSION · AOV MODE
    const traffic = parseFloat(document.getElementById("traffic").value);
    const trafficGrowth = parseFloat(document.getElementById("trafficGrowth").value || "0");
    const baselineCR = parseFloat(document.getElementById("baselineCR").value);
    const targetCR = parseFloat(document.getElementById("targetCR").value);
    const aov = parseFloat(document.getElementById("aov").value);

    if (
      !Number.isFinite(traffic) ||
      !Number.isFinite(baselineCR) ||
      !Number.isFinite(targetCR) ||
      !Number.isFinite(aov)
    ) {
      alert("In Traffic mode, set Traffic, Baseline Conversion, Target Conversion, and AOV.");
      return;
    }

    const params = {
      traffic,
      trafficGrowth: Number.isFinite(trafficGrowth) ? trafficGrowth : 0,
      baselineCR,
      targetCR,
      aov,
      periods,
      unitShort: short,
    };

    const baseData = buildSeriesTraffic(params, 1, "base");
    const conservativeData = buildSeriesTraffic(params, conservativeFactor, "conservative");
    const aggressiveData = buildSeriesTraffic(params, aggressiveFactor, "aggressive");

    labels = baseData.labels;
    baseSeries = baseData.series;
    conservativeSeries = conservativeData.series;
    aggressiveSeries = aggressiveData.series;

    // Align starting revenue field with traffic model (first period)
    if (baseSeries.length > 0) {
      startRevenue = baseSeries[0];
      startRevenueInput.value = Math.round(startRevenue);
    }

    const baseEnd = baseSeries[baseSeries.length - 1] || startRevenue;
    const consEnd = conservativeSeries[conservativeSeries.length - 1] || startRevenue;
    const aggEnd = aggressiveSeries[aggressiveSeries.length - 1] || startRevenue;

    baseRate = computeCagr(startRevenue, baseEnd, periods);
    consRate = computeCagr(startRevenue, consEnd, periods);
    aggRate = computeCagr(startRevenue, aggEnd, periods);
  }

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

  document.getElementById("baseRateLabel").textContent = formatPercent(baseRate);
  document.getElementById("conservativeRateLabel").textContent = formatPercent(consRate);
  document.getElementById("aggressiveRateLabel").textContent = formatPercent(aggRate);

  // Update textual summary
  const summaryList = document.getElementById("summaryList");
  summaryList.innerHTML = "";

  const unitWordPlural = periods === 1 ? singular : plural;

  const items = [
    `Base: Ending at ${formatCurrency(
      baseEnd
    )} in recurring revenue after ${periods} ${unitWordPlural} (${formatPercent(
      baseRate
    )} effective growth per period).`,
    `Conservative: Ending at ${formatCurrency(
      conservativeEnd
    )} (${formatPercent(consRate)} effective growth per period).`,
    `Aggressive: Ending at ${formatCurrency(
      aggressiveEnd
    )} (${formatPercent(aggRate)} effective growth per period).`,
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

let forecastChart = null;

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

function syncMonthsLabel(value) {
  const months = Number(value) || 0;
  const label = document.getElementById("monthsLabel");
  const summary = document.getElementById("monthsSummary");
  const text = `${months} month${months === 1 ? "" : "s"}`;
  label.textContent = text;
  summary.textContent = text;
}

function resetDefaults() {
  document.getElementById("startRevenue").value = 25000;
  document.getElementById("growthRate").value = 8;
  document.getElementById("months").value = 12;
  syncMonthsLabel(12);
  runForecast();
}

function buildSeries(startRevenue, monthlyGrowthRate, months, factor) {
  const series = [];
  const labels = [];
  const g = (monthlyGrowthRate / 100) * factor;

  let current = startRevenue;
  for (let i = 1; i <= months; i++) {
    current = current * (1 + g);
    series.push(current);
    labels.push(`M${i}`);
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
  const monthsInput = document.getElementById("months");

  let startRevenue = parseFloat(startRevenueInput.value);
  let growthRate = parseFloat(growthRateInput.value);
  let months = parseInt(monthsInput.value, 10);

  if (!Number.isFinite(startRevenue) || startRevenue < 0) startRevenue = 0;
  if (!Number.isFinite(growthRate)) growthRate = 0;
  if (!Number.isFinite(months) || months < 1) months = 1;

  syncMonthsLabel(months);

  // If base rate is 0, give a small implied band so the curves are visible
  if (growthRate === 0) {
    growthRate = 5;
  }

  // Scenario factors
  const conservativeFactor = 0.5;
  const aggressiveFactor = 1.5;

  const baseData = buildSeries(startRevenue, growthRate, months, 1);
  const conservativeData = buildSeries(
    startRevenue,
    growthRate,
    months,
    conservativeFactor
  );
  const aggressiveData = buildSeries(
    startRevenue,
    growthRate,
    months,
    aggressiveFactor
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

  const items = [
    `Base: Starting from ${formatCurrency(
      startRevenue
    )} with ${formatPercent(
      growthRate
    )} monthly growth, you end at ${formatCurrency(baseEnd)} in MRR.`,
    `Conservative: At half the base growth (${formatPercent(
      growthRate * conservativeFactor
    )}), you end at ${formatCurrency(conservativeEnd)} in MRR.`,
    `Aggressive: At 1.5× base growth (${formatPercent(
      growthRate * aggressiveFactor
    )}), you end at ${formatCurrency(aggressiveEnd)} in MRR.`,
    `Total base scenario revenue over ${months} months is ${formatCurrency(
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
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  syncMonthsLabel(document.getElementById("months").value);
  runForecast();
});

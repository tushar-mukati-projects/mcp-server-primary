export interface ChartDataset {
  label: string;
  data: number[];
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export type BuildChartDataUriFn = (args: {
  title: string;
  type: string;
  labels: string[];
  datasets: ChartDataset[];
  width?: number;
  height?: number;
}) => Promise<string>;

const PALETTE = [
  "rgba(59,130,246,0.85)",
  "rgba(16,185,129,0.85)",
  "rgba(245,158,11,0.85)",
  "rgba(139,92,246,0.85)",
  "rgba(239,68,68,0.85)",
  "rgba(20,184,166,0.85)",
];

function buildDatasets(type: string, data: ChartData) {
  return data.datasets.map((ds, i) => ({
    ...ds,
    backgroundColor:
      type === "pie" || type === "doughnut"
        ? PALETTE.slice(0, data.labels.length)
        : PALETTE[i % PALETTE.length],
    borderColor: type === "line" ? PALETTE[i % PALETTE.length].replace("0.85", "1") : undefined,
    borderWidth: type === "line" ? 2 : undefined,
    fill: type === "line" ? false : undefined,
    tension: type === "line" ? 0.3 : undefined,
    pointRadius: type === "line" ? 4 : undefined,
  }));
}

export async function fetchChart(
  type: string,
  data: ChartData,
  title: string,
  width = 700,
  height = 380,
): Promise<Buffer> {
  const res = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      width,
      height,
      devicePixelRatio: 2,
      format: "png",
      backgroundColor: "white",
      chart: {
        type,
        data: { labels: data.labels, datasets: buildDatasets(type, data) },
        options: {
          plugins: {
            title: { display: !!title, text: title, font: { size: 13 }, color: "#1a1a2e" },
            legend: {
              display: data.datasets.length > 1 || type === "pie" || type === "doughnut",
              position: "bottom",
            },
          },
          scales:
            type === "pie" || type === "doughnut" || type === "radar"
              ? undefined
              : { y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } } },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`QuickChart error: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export function chartToDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

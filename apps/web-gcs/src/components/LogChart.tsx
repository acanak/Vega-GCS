import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSeries { label: string; x: number[]; y: number[]; }
const COLORS = ['#46e0d0', '#f2b134', '#c77dff', '#38d778', '#ff5555', '#7fb4e8', '#ffb020', '#8bd450'];

function merge(list: ChartSeries[]): uPlot.AlignedData {
  if (list.length === 0) return [[]] as unknown as uPlot.AlignedData;
  const xset = new Set<number>();
  for (const s of list) for (const v of s.x) xset.add(v);
  const xs = [...xset].sort((a, b) => a - b);
  const ys = list.map((s) => {
    const out: Array<number | null> = new Array(xs.length).fill(null);
    let k = 0;
    let last: number | null = null;
    for (let xi = 0; xi < xs.length; xi++) {
      while (k < s.x.length && s.x[k]! <= xs[xi]!) { last = s.y[k]!; k++; }
      out[xi] = last;
    }
    return out;
  });
  return [xs, ...ys] as unknown as uPlot.AlignedData;
}

export function LogChart({ series, xLabel = 't (s)' }: { series: ChartSeries[]; xLabel?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(document.documentElement);
    const axis = cs.getPropertyValue('--ink-dim').trim() || '#8394a3';
    const grid = cs.getPropertyValue('--line-soft').trim() || '#223040';
    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height: 320,
      scales: { x: { time: false } },
      axes: [
        { stroke: axis, grid: { stroke: grid }, ticks: { stroke: grid } },
        { stroke: axis, grid: { stroke: grid }, ticks: { stroke: grid } },
      ],
      series: [
        { label: xLabel },
        ...series.map((s, i) => ({ label: s.label, stroke: COLORS[i % COLORS.length], width: 1.4, spanGaps: true })),
      ],
    };
    const p = new uPlot(opts, merge(series), el);
    const ro = new ResizeObserver(() => p.setSize({ width: el.clientWidth, height: 320 }));
    ro.observe(el);
    return () => { ro.disconnect(); p.destroy(); };
  }, [series, xLabel]);
  return <div ref={ref} className="log-chart" />;
}

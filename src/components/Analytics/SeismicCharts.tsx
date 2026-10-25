import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  CartesianGrid,
  Line,
  ComposedChart,
} from 'recharts';
import { EarthquakeFeature, SeismologyStats } from '../../types/seismic';
import { calculateGutenbergRichter, getDepthColor } from '../../utils/seismology';
import { BarChart3, ScatterChart as ScatterIcon, Calendar, Zap, Info } from 'lucide-react';

interface SeismicChartsProps {
  earthquakes: EarthquakeFeature[];
  stats: SeismologyStats;
}

export const SeismicCharts: React.FC<SeismicChartsProps> = ({ earthquakes, stats }) => {
  const [activeTab, setActiveTab] = useState<'histogram' | 'temporal' | 'scatter'>('histogram');

  // 1. Magnitude Histogram + Gutenberg Richter Fit Data
  const histogramData = useMemo(() => {
    const gr = calculateGutenbergRichter(earthquakes);
    // Bins from 1.0 to 8.5
    const bins: Record<string, { count: number; shallow: number; intermediate: number; deep: number }> = {};
    for (let m = 1.0; m <= 8.5; m += 0.5) {
      bins[m.toFixed(1)] = { count: 0, shallow: 0, intermediate: 0, deep: 0 };
    }

    earthquakes.forEach(f => {
      const mag = f.properties.mag;
      const depth = f.geometry.coordinates[2];
      const binVal = (Math.floor(mag * 2) / 2).toFixed(1);
      if (bins[binVal]) {
        bins[binVal].count++;
        if (depth < 70) bins[binVal].shallow++;
        else if (depth <= 300) bins[binVal].intermediate++;
        else bins[binVal].deep++;
      }
    });

    return Object.entries(bins)
      .map(([magStr, val]) => {
        const m = parseFloat(magStr);
        // Gutenberg richter expected frequency: N(M) approx
        const grExpected = Math.pow(10, gr.aValue - gr.bValue * m);
        return {
          magnitude: `M${magStr}`,
          magNum: m,
          total: val.count,
          shallow: val.shallow,
          intermediate: val.intermediate,
          deep: val.deep,
          grExpected: isFinite(grExpected) ? Math.min(val.count * 2.5, Math.round(grExpected)) : 0,
        };
      })
      .filter(d => d.total > 0 || d.magNum <= 6.5);
  }, [earthquakes]);

  // 2. Quakes-per-day Bar Chart
  const dailyData = useMemo(() => {
    const dayMap: Record<string, { date: string; shallow: number; intermediate: number; deep: number; total: number }> = {};

    earthquakes.forEach(f => {
      const dateKey = new Date(f.properties.time).toISOString().slice(5, 10); // MM-DD
      const depth = f.geometry.coordinates[2];

      if (!dayMap[dateKey]) {
        dayMap[dateKey] = { date: dateKey, shallow: 0, intermediate: 0, deep: 0, total: 0 };
      }
      dayMap[dateKey].total++;
      if (depth < 70) dayMap[dateKey].shallow++;
      else if (depth <= 300) dayMap[dateKey].intermediate++;
      else dayMap[dateKey].deep++;
    });

    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [earthquakes]);

  // 3. Depth vs. Magnitude Scatter Plot Data
  const scatterData = useMemo(() => {
    return earthquakes.slice(0, 450).map(f => ({
      magnitude: Number(f.properties.mag.toFixed(1)),
      depth: Math.round(f.geometry.coordinates[2]),
      place: f.properties.place,
      color: getDepthColor(f.geometry.coordinates[2]),
    }));
  }, [earthquakes]);

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 backdrop-blur-md flex flex-col gap-4 shadow-xl">
      {/* Chart Navigation Tabs & Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Seismic Telemetry & Analytics
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('histogram')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'histogram'
                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Magnitude Histogram</span>
          </button>

          <button
            onClick={() => setActiveTab('temporal')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'temporal'
                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Temporal Frequency</span>
          </button>

          <button
            onClick={() => setActiveTab('scatter')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'scatter'
                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ScatterIcon className="w-3.5 h-3.5" />
            <span>Depth vs. Magnitude</span>
          </button>
        </div>
      </div>

      {/* Primary Chart Area */}
      <div className="w-full h-64 font-mono text-xs">
        {activeTab === 'histogram' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={histogramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="magnitude" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e8f0', fontSize: '11px' }}
              />
              <Bar dataKey="shallow" name="Shallow (<70km)" stackId="a" fill="#ef4444" />
              <Bar dataKey="intermediate" name="Intermediate (70-300km)" stackId="a" fill="#f59e0b" />
              <Bar dataKey="deep" name="Deep (>300km)" stackId="a" fill="#38bdf8" />
              <Line
                type="monotone"
                dataKey="grExpected"
                name="Gutenberg-Richter Log fit"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'temporal' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e8f0', fontSize: '11px' }}
              />
              <Bar dataKey="shallow" name="Shallow" stackId="day" fill="#ef4444" />
              <Bar dataKey="intermediate" name="Intermediate" stackId="day" fill="#f59e0b" />
              <Bar dataKey="deep" name="Deep" stackId="day" fill="#38bdf8" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'scatter' && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="magnitude"
                name="Magnitude (Mw/Ml)"
                unit=" M"
                stroke="#64748b"
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="depth"
                name="Depth"
                unit=" km"
                reversed
                stroke="#64748b"
                tick={{ fontSize: 11 }}
              />
              <ZAxis range={[25, 120]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-700 shadow-xl text-xs font-mono">
                        <p className="font-bold text-sky-400 mb-1">{data.place}</p>
                        <p className="text-slate-300">Magnitude: <span className="font-bold text-white">M {data.magnitude}</span></p>
                        <p className="text-slate-300">Depth: <span className="font-bold text-white">{data.depth} km</span></p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Earthquakes" data={scatterData} fill="#38bdf8" shape="circle" />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Physics & Telemetry Quick Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-slate-800 text-xs font-mono">
        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Info className="w-3 h-3 text-sky-400" /> G-R b-Value
          </span>
          <p className="text-base font-bold text-sky-400 mt-0.5">{stats.gutenbergBValue.toFixed(2)}</p>
          <span className="text-[10px] text-slate-400">b ≈ 1.0 (Earth's crustal baseline)</span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" /> Max Magnitude
          </span>
          <p className="text-base font-bold text-amber-400 mt-0.5">M {stats.maxMagnitude.toFixed(1)}</p>
          <span className="text-[10px] text-slate-400 truncate block">
            {stats.maxMagnitudeEvent?.properties.place || 'N/A'}
          </span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase">Mean Hypocenter</span>
          <p className="text-base font-bold text-emerald-400 mt-0.5">{stats.avgDepth} km</p>
          <span className="text-[10px] text-slate-400">
            Deepest: {stats.deepestEvent?.geometry.coordinates[2] ?? 0} km
          </span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] text-slate-500 uppercase">Total Seismic Energy</span>
          <p className="text-base font-bold text-purple-400 mt-0.5">
            {stats.totalEnergyTntKilotons.toFixed(1)} kt TNT
          </p>
          <span className="text-[10px] text-slate-400">
            {stats.totalCount} active events
          </span>
        </div>
      </div>
    </div>
  );
};

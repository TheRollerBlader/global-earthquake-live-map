import React from 'react';
import { EarthquakeFeature, MagnitudeFilter } from '../../types/seismic';
import { getDepthColor, getDepthCategory, formatRelativeTime, estimateMMI } from '../../utils/seismology';
import { Search, Navigation, Waves, ExternalLink, Activity } from 'lucide-react';

interface RecentEventFeedProps {
  earthquakes: EarthquakeFeature[];
  selectedQuake: EarthquakeFeature | null;
  onSelectQuake: (quake: EarthquakeFeature) => void;
  onFlyTo: (lat: number, lon: number) => void;
  minMagnitude: MagnitudeFilter;
  onChangeMagnitudeFilter: (mag: MagnitudeFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
}

export const RecentEventFeed: React.FC<RecentEventFeedProps> = ({
  earthquakes,
  selectedQuake,
  onSelectQuake,
  onFlyTo,
  minMagnitude,
  onChangeMagnitudeFilter,
  searchQuery,
  onChangeSearchQuery,
}) => {
  const filteredEvents = earthquakes
    .filter(q => {
      const mag = q.properties.mag ?? 0;
      if (minMagnitude === '2.5' && mag < 2.5) return false;
      if (minMagnitude === '4.5' && mag < 4.5) return false;
      if (minMagnitude === '6.0' && mag < 6.0) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const place = (q.properties.place || '').toLowerCase();
        return place.includes(query);
      }
      return true;
    })
    .sort((a, b) => b.properties.time - a.properties.time);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950/90 border border-slate-800/80 rounded-2xl backdrop-blur-md shadow-2xl overflow-hidden font-mono">
      {/* Feed Header */}
      <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/40 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Recent Seismic Events ({filteredEvents.length})
            </h3>
          </div>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>

        {/* Search input */}
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search region (e.g. Japan, California, Chile)..."
            value={searchQuery}
            onChange={e => onChangeSearchQuery(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-700/60 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>

        {/* Magnitude Filter Chips */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-slate-500 uppercase mr-1">Mag:</span>
          {(['all', '2.5', '4.5', '6.0'] as MagnitudeFilter[]).map(filter => (
            <button
              key={filter}
              onClick={() => onChangeMagnitudeFilter(filter)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                minMagnitude === filter
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/60 font-bold'
                  : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {filter === 'all' ? 'All' : `M${filter}+`}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Events List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-850 p-2 space-y-1.5 custom-scrollbar">
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No seismic events found matching current criteria.
          </div>
        ) : (
          filteredEvents.map(quake => {
            const [lon, lat, depth] = quake.geometry.coordinates;
            const mag = quake.properties.mag ?? 0;
            const depthColor = getDepthColor(depth);
            const isSelected = selectedQuake?.id === quake.id;

            return (
              <div
                key={quake.id}
                onClick={() => {
                  onSelectQuake(quake);
                  onFlyTo(lat, lon);
                }}
                className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-sky-950/40 border-sky-500/60 shadow-lg shadow-sky-950/30'
                    : 'bg-slate-900/40 hover:bg-slate-850/70 border-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-white font-bold text-xs shadow-sm flex items-center justify-center min-w-[42px]"
                      style={{ backgroundColor: depthColor }}
                    >
                      M {mag.toFixed(1)}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      {getDepthCategory(depth)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {quake.properties.tsunami === 1 && (
                      <span className="p-1 rounded bg-cyan-950/90 text-cyan-400 border border-cyan-500/40" title="Tsunami Warning Evaluated">
                        <Waves className="w-3 h-3" />
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectQuake(quake);
                        onFlyTo(lat, lon);
                      }}
                      className="p-1 rounded-lg bg-slate-800/80 hover:bg-sky-500 hover:text-slate-950 text-slate-400 border border-slate-700 transition-all"
                      title="Fly-to Quake Epicenter"
                    >
                      <Navigation className="w-3 h-3" />
                    </button>

                    <a
                      href={quake.properties.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-all"
                      title="View on USGS"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <p className="font-sans font-medium text-xs text-slate-200 line-clamp-1 group-hover:text-sky-300 transition-colors">
                  {quake.properties.place}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>Depth: <strong className="text-slate-300">{depth} km</strong></span>
                  <span>MMI: <strong className="text-amber-400">{estimateMMI(mag, depth).roman}</strong></span>
                  <span className="text-slate-500">{formatRelativeTime(quake.properties.time)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

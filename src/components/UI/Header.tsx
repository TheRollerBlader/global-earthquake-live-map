import React from 'react';
import { TimeRange, ViewProjection } from '../../types/seismic';
import {
  Globe,
  Map as MapIcon,
  RefreshCw,
  Volume2,
  VolumeX,
  BookOpen,
  Wifi,
  WifiOff,
  Clock,
} from 'lucide-react';

interface HeaderProps {
  timeRange: TimeRange;
  onChangeTimeRange: (range: TimeRange) => void;
  projection: ViewProjection;
  onChangeProjection: (proj: ViewProjection) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRefreshNow: () => void;
  isLoading: boolean;
  isFallback: boolean;
  lastUpdated: Date | null;
  onOpenPhysicsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  timeRange,
  onChangeTimeRange,
  projection,
  onChangeProjection,
  autoRefresh,
  onToggleAutoRefresh,
  soundEnabled,
  onToggleSound,
  onRefreshNow,
  isLoading,
  isFallback,
  lastUpdated,
  onOpenPhysicsModal,
}) => {
  const timeRanges: { id: TimeRange; label: string }[] = [
    { id: 'hour', label: '1 Hour' },
    { id: 'day', label: '24 Hours' },
    { id: 'week', label: '7 Days' },
    { id: 'month', label: '30 Days' },
  ];

  return (
    <header className="w-full bg-slate-950/90 border-b border-slate-800/80 px-4 py-2.5 backdrop-blur-md z-30 flex flex-wrap items-center justify-between gap-3 font-mono">
      {/* Title & Live Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg shadow-red-950/40">
            <Globe className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider text-white font-sans">
                GLOBAL SEISMOLOGY MONITOR
              </h1>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-500/30 text-[10px] font-bold">
                USGS LIVE
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                {isFallback ? (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-400">Cached Mode</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Live USGS Feeds</span>
                  </>
                )}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3 h-3" />
                <span>
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Syncing...'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Center Controls: Time Range & Projection View */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Time Range Selector */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          {timeRanges.map(tr => (
            <button
              key={tr.id}
              onClick={() => onChangeTimeRange(tr.id)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                timeRange === tr.id
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>

        {/* 3D Globe vs 2D Flat Projection Toggle */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onChangeProjection('3D')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs transition-all ${
              projection === '3D'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>3D Globe</span>
          </button>
          <button
            onClick={() => onChangeProjection('2D')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs transition-all ${
              projection === '2D'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>2D Flat</span>
          </button>
        </div>
      </div>

      {/* Right Action Tools: Physics Guide, Sound, Auto-Refresh */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenPhysicsModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 text-xs transition-all shadow-sm"
          title="Seismology Physics & Equations"
        >
          <BookOpen className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden md:inline">Physics</span>
        </button>

        <button
          onClick={onToggleSound}
          className={`p-1.5 rounded-xl border text-xs transition-all ${
            soundEnabled
              ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
              : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
          title={soundEnabled ? 'Seismic Audio Alerts: ON' : 'Seismic Audio Alerts: OFF'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <button
          onClick={onToggleAutoRefresh}
          className={`px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition-all ${
            autoRefresh
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
          title="Polling every 60s"
        >
          Auto: {autoRefresh ? '60s' : 'OFF'}
        </button>

        <button
          onClick={onRefreshNow}
          disabled={isLoading}
          className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all disabled:opacity-50"
          title="Sync live USGS feed now"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};

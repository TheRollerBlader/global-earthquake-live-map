import React, { useEffect, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock, Activity, Zap } from 'lucide-react';
import { EarthquakeFeature, PlaybackState } from '../../types/seismic';
import { formatSeismicEnergy, calculateSeismicEnergyJoules } from '../../utils/seismology';

interface TimelineScrubberProps {
  earthquakes: EarthquakeFeature[];
  playback: PlaybackState;
  onUpdatePlayback: (newPlayback: Partial<PlaybackState>) => void;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  earthquakes,
  playback,
  onUpdatePlayback,
}) => {
  const { isPlaying, speed, currentTimeMs, startTimeMs, endTimeMs } = playback;

  // Compute temporal density histogram for the scrubber background (24 bins)
  const densityBins = useMemo(() => {
    const binsCount = 36;
    const bins = new Array(binsCount).fill(0);
    const timeSpan = Math.max(endTimeMs - startTimeMs, 1);

    earthquakes.forEach(q => {
      const t = q.properties.time;
      if (t >= startTimeMs && t <= endTimeMs) {
        const binIndex = Math.min(binsCount - 1, Math.max(0, Math.floor(((t - startTimeMs) / timeSpan) * binsCount)));
        bins[binIndex]++;
      }
    });

    const maxCount = Math.max(...bins, 1);
    return bins.map(count => (count / maxCount) * 100);
  }, [earthquakes, startTimeMs, endTimeMs]);

  // Compute stats up to current scrubber time
  const currentStats = useMemo(() => {
    let count = 0;
    let totalJoules = 0;
    earthquakes.forEach(q => {
      if (q.properties.time <= currentTimeMs) {
        count++;
        totalJoules += calculateSeismicEnergyJoules(q.properties.mag);
      }
    });
    return {
      count,
      energy: formatSeismicEnergy(totalJoules),
    };
  }, [earthquakes, currentTimeMs]);

  // Animation frame loop for playback
  useEffect(() => {
    if (!isPlaying) return;

    let lastFrameTime = performance.now();
    let animId: number;

    const loop = (now: number) => {
      const deltaSec = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Real time seconds to simulated time (e.g. at 24x speed, 1 real sec = 24 simulated hours or proportional)
      // If time span is 30 days (~2.59e9 ms), 1 full playback pass in ~30 seconds => speed factor:
      const totalSpanMs = Math.max(endTimeMs - startTimeMs, 1000);
      const baseAdvancePerSec = (totalSpanMs / 45) * speed; // 45 seconds baseline for 1x speed

      const nextTime = currentTimeMs + baseAdvancePerSec * deltaSec;

      if (nextTime >= endTimeMs) {
        onUpdatePlayback({ currentTimeMs: endTimeMs, isPlaying: false });
      } else {
        onUpdatePlayback({ currentTimeMs: nextTime });
        animId = requestAnimationFrame(loop);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, speed, currentTimeMs, startTimeMs, endTimeMs, onUpdatePlayback]);

  const handleTogglePlay = () => {
    if (currentTimeMs >= endTimeMs) {
      onUpdatePlayback({ currentTimeMs: startTimeMs, isPlaying: true });
    } else {
      onUpdatePlayback({ isPlaying: !isPlaying });
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    onUpdatePlayback({ currentTimeMs: val });
  };

  const handleStep = (direction: 'back' | 'forward') => {
    const stepSize = Math.max((endTimeMs - startTimeMs) / 30, 60000);
    const nextVal = direction === 'back' ? Math.max(startTimeMs, currentTimeMs - stepSize) : Math.min(endTimeMs, currentTimeMs + stepSize);
    onUpdatePlayback({ currentTimeMs: nextVal });
  };

  const speedOptions = [1, 5, 24, 100];

  const progressPercent = Math.min(100, Math.max(0, ((currentTimeMs - startTimeMs) / Math.max(endTimeMs - startTimeMs, 1)) * 100));

  return (
    <div className="w-full bg-slate-950/90 border-t border-slate-800/80 p-3 md:px-6 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Top telemetry bar */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-sky-400 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              <span>Simulated Time:</span>
            </span>
            <span className="text-slate-100 font-medium">
              {new Date(currentTimeMs).toUTCString().slice(0, 22)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>Quakes to Date:</span>
              <span className="text-slate-100 font-bold">{currentStats.count} / {earthquakes.length}</span>
            </span>
            <span className="flex items-center gap-1.5 hidden sm:flex">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Energy Released:</span>
              <span className="text-emerald-400 font-bold">{currentStats.energy.tntEquivalent}</span>
            </span>
          </div>
        </div>

        {/* Timeline Slider with Frequency Bars */}
        <div className="relative w-full h-8 flex items-center">
          {/* Histogram bar background */}
          <div className="absolute inset-0 flex items-end justify-between px-1 pointer-events-none opacity-40">
            {densityBins.map((heightPct, idx) => (
              <div
                key={idx}
                className="w-1.5 rounded-t bg-sky-500/70"
                style={{ height: `${Math.max(6, heightPct)}%` }}
              />
            ))}
          </div>

          {/* Active progress highlight fill */}
          <div
            className="absolute left-0 h-1.5 bg-gradient-to-r from-sky-500 to-amber-500 rounded-l pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Actual range input */}
          <input
            type="range"
            min={startTimeMs}
            max={endTimeMs}
            value={currentTimeMs}
            onChange={handleSliderChange}
            className="w-full relative z-10 appearance-none bg-transparent cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_#38bdf8] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-900"
          />
        </div>

        {/* Control Buttons & Speed Multipliers */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleStep('back')}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
              title="Step backward"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handleTogglePlay}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                isPlaying
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-950/40'
                  : 'bg-sky-500 text-slate-950 hover:bg-sky-400 shadow-lg shadow-sky-950/40'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'PAUSE' : 'REPLAY'}</span>
            </button>
            <button
              onClick={() => handleStep('forward')}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
              title="Step forward"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-500 uppercase mr-1">Speed:</span>
            {speedOptions.map(spd => (
              <button
                key={spd}
                onClick={() => onUpdatePlayback({ speed: spd })}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
                  speed === spd
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 font-bold'
                    : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

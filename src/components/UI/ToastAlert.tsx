import React from 'react';
import { EarthquakeFeature } from '../../types/seismic';
import { getDepthColor } from '../../utils/seismology';
import { AlertTriangle, X, Radio } from 'lucide-react';

interface ToastAlertProps {
  alerts: EarthquakeFeature[];
  onDismiss: (id: string) => void;
  onFocus: (quake: EarthquakeFeature) => void;
}

export const ToastAlert: React.FC<ToastAlertProps> = ({ alerts, onDismiss, onFocus }) => {
  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none font-mono">
      {alerts.slice(0, 3).map(quake => {
        const depth = quake.geometry.coordinates[2];
        const color = getDepthColor(depth);

        return (
          <div
            key={quake.id}
            className="pointer-events-auto bg-slate-950/95 border border-red-500/50 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-white font-bold text-xs"
                  style={{ backgroundColor: color }}
                >
                  M {quake.properties.mag.toFixed(1)}
                </span>
                <span className="text-[11px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 animate-bounce" /> New Seismic Event
                </span>
              </div>
              <button
                onClick={() => onDismiss(quake.id)}
                className="text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="font-sans text-xs font-semibold text-slate-100 line-clamp-2">
              {quake.properties.place}
            </p>

            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800 pt-2">
              <span>Depth: <strong className="text-slate-200">{depth} km</strong></span>
              <button
                onClick={() => {
                  onFocus(quake);
                  onDismiss(quake.id);
                }}
                className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Fly To</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

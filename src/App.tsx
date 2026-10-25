import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  EarthquakeFeature,
  MagnitudeFilter,
  PlaybackState,
  TimeRange,
  ViewProjection,
} from './types/seismic';
import { USGSService } from './services/usgsApi';
import { computeSeismologyStats } from './utils/seismology';
import { Header } from './components/UI/Header';
import { GlobeView } from './components/Globe3D/GlobeView';
import { FlatMapView } from './components/Map2D/FlatMapView';
import { TimelineScrubber } from './components/Timeline/TimelineScrubber';
import { RecentEventFeed } from './components/Feed/RecentEventFeed';
import { SeismicCharts } from './components/Analytics/SeismicCharts';
import { SeismologyPhysicsModal } from './components/Modals/SeismologyPhysicsModal';
import { ToastAlert } from './components/UI/ToastAlert';
import { BarChart2, List, Eye } from 'lucide-react';

export default function App() {
  // Global Seismic Data State
  const [allEarthquakes, setAllEarthquakes] = useState<EarthquakeFeature[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Configuration & Filter States
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [projection, setProjection] = useState<ViewProjection>('3D');
  const [minMagnitude, setMinMagnitude] = useState<MagnitudeFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // UI Panels State
  const [activeSidePanel, setActiveSidePanel] = useState<'feed' | 'charts' | 'none'>('feed');
  const [isPhysicsModalOpen, setIsPhysicsModalOpen] = useState<boolean>(false);
  const [toastAlerts, setToastAlerts] = useState<EarthquakeFeature[]>([]);

  // Selection & 3D Fly-to Target
  const [selectedQuake, setSelectedQuake] = useState<EarthquakeFeature | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number } | null>(null);

  // Timeline Scrubber & Replay State
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    speed: 5,
    currentTimeMs: Date.now(),
    startTimeMs: Date.now() - 7 * 24 * 3600 * 1000,
    endTimeMs: Date.now(),
  });

  // Load Earthquake Data
  const loadData = useCallback(async (selectedRange: TimeRange, silent = false) => {
    if (!silent) setIsLoading(true);

    const result = await USGSService.fetchEarthquakes(selectedRange);
    setIsLoading(false);
    setIsFallback(result.isFallback);
    setLastUpdated(new Date());

    if (result.features.length > 0) {
      setAllEarthquakes(result.features);

      // Check for newly arrived earthquakes to trigger alerts
      if (silent) {
        const newEvents = USGSService.detectNewEvents(result.features);
        if (newEvents.length > 0) {
          setToastAlerts(prev => [...newEvents, ...prev]);
          if (soundEnabled) {
            USGSService.playSeismicAlertSound(newEvents[0].properties.mag);
          }
        }
      } else {
        USGSService.detectNewEvents(result.features);
      }

      // Compute time boundaries for timeline replay
      let minTime = Infinity;
      let maxTime = -Infinity;
      for (const f of result.features) {
        const t = f.properties.time;
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
      }

      if (minTime !== Infinity && maxTime !== -Infinity) {
        setPlayback(prev => ({
          ...prev,
          startTimeMs: minTime,
          endTimeMs: maxTime,
          currentTimeMs: prev.isPlaying ? prev.currentTimeMs : maxTime,
        }));
      }
    }
  }, [soundEnabled]);

  // Initial fetch and on timeRange change
  useEffect(() => {
    loadData(timeRange);
  }, [timeRange, loadData]);

  // Auto-refresh interval (polling every 60s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(timeRange, true);
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, timeRange, loadData]);

  // Filter earthquakes based on magnitude, search query, and playback timeline scrubber
  const displayedEarthquakes = useMemo(() => {
    return allEarthquakes.filter(q => {
      // Timeline scrubber filter
      if (q.properties.time > playback.currentTimeMs) {
        return false;
      }

      // Magnitude filter
      const mag = q.properties.mag ?? 0;
      if (minMagnitude === '2.5' && mag < 2.5) return false;
      if (minMagnitude === '4.5' && mag < 4.5) return false;
      if (minMagnitude === '6.0' && mag < 6.0) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const place = (q.properties.place || '').toLowerCase();
        if (!place.includes(query)) return false;
      }

      return true;
    });
  }, [allEarthquakes, playback.currentTimeMs, minMagnitude, searchQuery]);

  // Seismological Analytics
  const stats = useMemo(() => {
    return computeSeismologyStats(displayedEarthquakes);
  }, [displayedEarthquakes]);

  const handleFlyTo = (lat: number, lon: number) => {
    setFlyToTarget({ lat, lon });
    // If auto-rotate was running, pause it momentarily
    setAutoRotate(false);
  };

  const handleDismissToast = (id: string) => {
    setToastAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleFocusFromToast = (quake: EarthquakeFeature) => {
    setSelectedQuake(quake);
    handleFlyTo(quake.geometry.coordinates[1], quake.geometry.coordinates[0]);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#060911] text-slate-100 select-none">
      {/* Top Header & Global Controls */}
      <Header
        timeRange={timeRange}
        onChangeTimeRange={setTimeRange}
        projection={projection}
        onChangeProjection={setProjection}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onRefreshNow={() => loadData(timeRange)}
        isLoading={isLoading}
        isFallback={isFallback}
        lastUpdated={lastUpdated}
        onOpenPhysicsModal={() => setIsPhysicsModalOpen(true)}
      />

      {/* Main View Area: Map/Globe + Side Panels */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Primary Visualization Area */}
        <div className="relative flex-1 h-full w-full">
          {projection === '3D' ? (
            <GlobeView
              earthquakes={displayedEarthquakes}
              selectedQuake={selectedQuake}
              onSelectQuake={setSelectedQuake}
              flyToTarget={flyToTarget}
              autoRotate={autoRotate}
              onToggleAutoRotate={() => setAutoRotate(!autoRotate)}
            />
          ) : (
            <FlatMapView
              earthquakes={displayedEarthquakes}
              selectedQuake={selectedQuake}
              onSelectQuake={setSelectedQuake}
            />
          )}

          {/* Quick HUD Overlay Counters (Top Left) */}
          <div className="absolute top-4 left-36 z-20 hidden md:flex items-center gap-3 bg-slate-950/80 border border-slate-800/80 px-3.5 py-1.5 rounded-xl backdrop-blur-md font-mono text-xs shadow-lg">
            <div>
              <span className="text-slate-500 text-[10px] block uppercase">Events Plotted</span>
              <span className="font-bold text-sky-400">{displayedEarthquakes.length}</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-500 text-[10px] block uppercase">Max Magnitude</span>
              <span className="font-bold text-amber-400">M {stats.maxMagnitude.toFixed(1)}</span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-500 text-[10px] block uppercase">Total Energy</span>
              <span className="font-bold text-purple-400">{stats.totalEnergyTntKilotons.toFixed(1)} kt</span>
            </div>
          </div>

          {/* Panel Toggle Switchers (Top Right floating) */}
          <div className="absolute top-4 right-4 z-20 flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 shadow-xl backdrop-blur-md font-mono text-xs">
            <button
              onClick={() => setActiveSidePanel(activeSidePanel === 'feed' ? 'none' : 'feed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeSidePanel === 'feed'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Events Feed</span>
            </button>

            <button
              onClick={() => setActiveSidePanel(activeSidePanel === 'charts' ? 'none' : 'charts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeSidePanel === 'charts'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Telemetry</span>
            </button>

            {activeSidePanel !== 'none' && (
              <button
                onClick={() => setActiveSidePanel('none')}
                className="p-1.5 ml-1 text-slate-500 hover:text-slate-300 rounded-lg"
                title="Hide Side Panel"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Floating Side Drawer (Feed or Analytics Charts) */}
        {activeSidePanel === 'feed' && (
          <div className="w-80 md:w-96 h-full p-3 z-30 flex-shrink-0 animate-in slide-in-from-right duration-200">
            <RecentEventFeed
              earthquakes={displayedEarthquakes}
              selectedQuake={selectedQuake}
              onSelectQuake={setSelectedQuake}
              onFlyTo={handleFlyTo}
              minMagnitude={minMagnitude}
              onChangeMagnitudeFilter={setMinMagnitude}
              searchQuery={searchQuery}
              onChangeSearchQuery={setSearchQuery}
            />
          </div>
        )}

        {activeSidePanel === 'charts' && (
          <div className="w-80 md:w-[480px] h-full p-3 z-30 flex-shrink-0 overflow-y-auto animate-in slide-in-from-right duration-200 custom-scrollbar">
            <SeismicCharts earthquakes={displayedEarthquakes} stats={stats} />
          </div>
        )}
      </div>

      {/* Bottom Timeline Replay Scrubber */}
      <TimelineScrubber
        earthquakes={allEarthquakes}
        playback={playback}
        onUpdatePlayback={newVals => setPlayback(prev => ({ ...prev, ...newVals }))}
      />

      {/* Toast Alert for Incoming Quakes */}
      <ToastAlert
        alerts={toastAlerts}
        onDismiss={handleDismissToast}
        onFocus={handleFocusFromToast}
      />

      {/* Seismology Physics Modal */}
      <SeismologyPhysicsModal
        isOpen={isPhysicsModalOpen}
        onClose={() => setIsPhysicsModalOpen(false)}
      />
    </div>
  );
}

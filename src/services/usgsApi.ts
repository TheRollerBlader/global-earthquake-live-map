import { EarthquakeFeature, TimeRange, USGSGeoJSONResponse } from '../types/seismic';

const USGS_FEEDS: Record<TimeRange, string> = {
  hour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
  week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
  month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson',
};

const FALLBACK_CACHE_URL = '/data/cached_earthquakes.json';

export class USGSService {
  private static cachedData: Map<TimeRange, EarthquakeFeature[]> = new Map();
  private static lastFetchTime: Map<TimeRange, number> = new Map();
  private static seenQuakeIds: Set<string> = new Set();
  private static audioCtx: AudioContext | null = null;

  /**
   * Fetches earthquake data for a given time range.
   * If network fails or times out, falls back to local cached GeoJSON.
   */
  public static async fetchEarthquakes(timeRange: TimeRange): Promise<{ features: EarthquakeFeature[]; isFallback: boolean; error?: string }> {
    const url = USGS_FEEDS[timeRange];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000); // 9 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`USGS HTTP ${response.status}: ${response.statusText}`);
      }

      const data: USGSGeoJSONResponse = await response.json();
      if (!data || !Array.isArray(data.features)) {
        throw new Error('Invalid GeoJSON structure returned from USGS feed');
      }

      // Filter out null magnitudes or invalid coordinates
      const validFeatures = data.features.filter(f => 
        f.geometry &&
        Array.isArray(f.geometry.coordinates) &&
        f.geometry.coordinates.length >= 2 &&
        typeof f.properties.mag === 'number' &&
        !isNaN(f.properties.mag)
      );

      this.cachedData.set(timeRange, validFeatures);
      this.lastFetchTime.set(timeRange, Date.now());

      return { features: validFeatures, isFallback: false };
    } catch (err: unknown) {
      console.warn(`[USGS Service] Remote fetch failed for ${timeRange}:`, err);

      // Check if we already have memory cache
      if (this.cachedData.has(timeRange) && (this.cachedData.get(timeRange)?.length ?? 0) > 0) {
        return {
          features: this.cachedData.get(timeRange)!,
          isFallback: true,
          error: `Offline mode: showing memory cache (${(err as Error).message})`
        };
      }

      // Attempt to load pre-cached static fallback
      try {
        const fallbackResp = await fetch(FALLBACK_CACHE_URL);
        if (fallbackResp.ok) {
          const fallbackData: USGSGeoJSONResponse = await fallbackResp.json();
          const valid = fallbackData.features.filter(f => 
            f.geometry &&
            Array.isArray(f.geometry.coordinates) &&
            typeof f.properties.mag === 'number'
          );
          return {
            features: valid,
            isFallback: true,
            error: 'Live feed unavailable: displaying pre-cached USGS seismic benchmark data.'
          };
        }
      } catch (fallbackErr) {
        console.error('[USGS Service] Fallback load also failed:', fallbackErr);
      }

      return {
        features: [],
        isFallback: true,
        error: `Could not retrieve live or cached seismic data: ${(err as Error).message}`
      };
    }
  }

  /**
   * Detects newly arrived earthquakes compared to previously seen events.
   */
  public static detectNewEvents(features: EarthquakeFeature[]): EarthquakeFeature[] {
    const newEvents: EarthquakeFeature[] = [];

    // If first run, populate seenQuakeIds without triggering alerts
    if (this.seenQuakeIds.size === 0) {
      for (const f of features) {
        this.seenQuakeIds.add(f.id);
      }
      return [];
    }

    for (const f of features) {
      if (!this.seenQuakeIds.has(f.id)) {
        this.seenQuakeIds.add(f.id);
        // Only alert on significant quakes (e.g. M >= 2.5) or past 1 hour
        if (f.properties.mag >= 2.5 && Date.now() - f.properties.time < 3600000) {
          newEvents.push(f);
        }
      }
    }

    return newEvents;
  }

  /**
   * Synthesize a high-tech seismic ping alert using Web Audio API.
   * No external sound file required.
   */
  public static playSeismicAlertSound(magnitude: number): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // Lower pitch for higher magnitude (rumble) vs higher alert chirp
      const baseFreq = Math.max(120, 480 - magnitude * 40);
      osc.type = magnitude >= 5.0 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(baseFreq, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, this.audioCtx.currentTime + 0.6);

      gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.65);
    } catch {
      // Audio autoplay policy or silent mode
    }
  }
}

export interface EarthquakeGeometry {
  type: 'Point';
  coordinates: [number, number, number]; // [longitude, latitude, depth_km]
}

export interface EarthquakeProperties {
  mag: number;
  place: string;
  time: number; // UTC timestamp ms
  updated: number;
  tz: number | null;
  url: string;
  detail: string;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: 'green' | 'yellow' | 'orange' | 'red' | null;
  status: string;
  tsunami: number;
  sig: number;
  net: string;
  code: string;
  ids: string;
  sources: string;
  types: string;
  nst: number | null;
  dmin: number | null;
  rms: number | null;
  gap: number | null;
  magType: string;
  type: string;
  title: string;
}

export interface EarthquakeFeature {
  type: 'Feature';
  id: string;
  properties: EarthquakeProperties;
  geometry: EarthquakeGeometry;
}

export interface USGSGeoJSONResponse {
  type: 'FeatureCollection';
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
  features: EarthquakeFeature[];
}

export type DepthCategory = 'shallow' | 'intermediate' | 'deep';

export type TimeRange = 'hour' | 'day' | 'week' | 'month';

export type MagnitudeFilter = 'all' | '2.5' | '4.5' | '6.0';

export type ViewProjection = '3D' | '2D';

export interface FilterSettings {
  minMagnitude: MagnitudeFilter;
  timeRange: TimeRange;
  depthCategory: 'all' | DepthCategory;
  searchQuery: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  speed: number; // e.g. 1x, 5x, 24x, 100x
  currentTimeMs: number;
  startTimeMs: number;
  endTimeMs: number;
}

export interface SeismologyStats {
  totalCount: number;
  maxMagnitude: number;
  maxMagnitudeEvent: EarthquakeFeature | null;
  avgDepth: number;
  deepestEvent: EarthquakeFeature | null;
  totalEnergyJoules: number;
  totalEnergyTntKilotons: number;
  shallowCount: number;
  intermediateCount: number;
  deepCount: number;
  tsunamiWarningsCount: number;
  gutenbergBValue: number;
  gutenbergAValue: number;
}

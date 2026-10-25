import { DepthCategory, EarthquakeFeature, SeismologyStats } from '../types/seismic';

/**
 * Seismology Formulas and Calculations
 *
 * 1. Richter Local Magnitude (ML):
 *    ML = log10(A) - log10(A0(Δ))
 *    where A is the maximum trace amplitude recorded on a Wood-Anderson seismograph
 *    and A0 is an empirical distance correction factor.
 *
 * 2. Seismic Moment (M0):
 *    M0 = μ * A * D
 *    where μ = shear modulus / rigidity of crustal rock (~3.0 x 10^10 N/m^2)
 *    A = fault rupture surface area (m^2)
 *    D = average dislocation / slip along fault (m)
 *
 * 3. Moment Magnitude (Mw):
 *    Mw = (2/3) * log10(M0) - 9.1  (with M0 in N*m)
 *    or Mw = (2/3) * log10(M0) - 10.7 (with M0 in dyne*cm)
 *
 * 4. Radiated Seismic Energy (E in Joules):
 *    log10(E) = 4.8 + 1.5 * Mw
 *    E = 10^(4.8 + 1.5 * Mw) Joules
 *    1 ton of TNT = 4.184 x 10^9 Joules
 *    1 kiloton of TNT = 4.184 x 10^12 Joules
 *    Each unit increment in Mw represents 10^1.5 ≈ 31.622 times more released energy!
 *
 * 5. Depth Zones:
 *    - Shallow: < 70 km (Crustal / upper lithosphere, causes most ground shaking)
 *    - Intermediate: 70 - 300 km (Subducting slab mantle entry)
 *    - Deep: > 300 km (Wadati-Benioff zones down to ~700 km mantle transition)
 *
 * 6. Gutenberg-Richter Recurrence Law:
 *    log10(N) = a - b * M
 *    where N is the cumulative number of earthquakes with magnitude >= M.
 *    b is typically near 1.0 globally. A higher b indicates relatively more small quakes,
 *    while a lower b can indicate high stress accumulation.
 *
 * 7. Ground Motion & Depth Attenuation:
 *    Peak Ground Acceleration A(r) ∝ (1 / r) * exp(-γ * r)
 *    where hypocentral distance r = sqrt(d_epicentral^2 + depth^2).
 */

export function getDepthCategory(depthKm: number): DepthCategory {
  if (depthKm < 70) return 'shallow';
  if (depthKm <= 300) return 'intermediate';
  return 'deep';
}

export function getDepthColor(depthKm: number): string {
  if (depthKm < 70) return '#ef4444'; // Red-orange (shallow)
  if (depthKm <= 300) return '#f59e0b'; // Amber-yellow (intermediate)
  return '#38bdf8'; // Electric cyan-blue (deep)
}

export function getDepthLabel(depthKm: number): string {
  if (depthKm < 70) return 'Shallow (<70 km)';
  if (depthKm <= 300) return 'Intermediate (70-300 km)';
  return 'Deep (>300 km)';
}

/**
 * Calculates radiated seismic energy in Joules from moment magnitude Mw.
 * log10(E) = 4.8 + 1.5 * Mw
 */
export function calculateSeismicEnergyJoules(mag: number): number {
  if (mag <= 0) return 0;
  // Cap extreme values for floating point safety
  const clampedMag = Math.min(Math.max(mag, 0.1), 10.0);
  return Math.pow(10, 4.8 + 1.5 * clampedMag);
}

/**
 * Converts Joules to equivalent kilotons of TNT.
 * 1 Kiloton TNT = 4.184 x 10^12 Joules.
 */
export function joulesToTntKilotons(joules: number): number {
  return joules / 4.184e12;
}

/**
 * Estimates seismic moment M0 in Newton-meters from Mw:
 * Mw = (2/3) * log10(M0) - 9.1 => log10(M0) = 1.5 * (Mw + 9.1)
 */
export function calculateSeismicMoment(mag: number): number {
  if (mag <= 0) return 0;
  return Math.pow(10, 1.5 * (mag + 9.1));
}

/**
 * Formats energy into human readable units (J, MJ, GJ, TJ, PJ, or TNT equivalent)
 */
export function formatSeismicEnergy(joules: number): { value: string; unit: string; tntEquivalent: string } {
  if (joules < 1e6) {
    return {
      value: (joules / 1e3).toFixed(1),
      unit: 'kJ',
      tntEquivalent: `${(joules / 4.184e9 * 1000).toFixed(2)} kg TNT`
    };
  }
  if (joules < 1e9) {
    return {
      value: (joules / 1e6).toFixed(1),
      unit: 'MJ',
      tntEquivalent: `${(joules / 4.184e9).toFixed(2)} tons TNT`
    };
  }
  if (joules < 1e12) {
    return {
      value: (joules / 1e9).toFixed(1),
      unit: 'GJ',
      tntEquivalent: `${(joules / 4.184e9).toFixed(1)} tons TNT`
    };
  }
  if (joules < 1e15) {
    const kt = joules / 4.184e12;
    return {
      value: (joules / 1e12).toFixed(1),
      unit: 'TJ',
      tntEquivalent: `${kt.toFixed(2)} kt TNT`
    };
  }
  const mt = joules / 4.184e15;
  return {
    value: (joules / 1e15).toFixed(2),
    unit: 'PJ',
    tntEquivalent: `${mt.toFixed(2)} Mt TNT`
  };
}

/**
 * Estimated Modified Mercalli Intensity (MMI) from magnitude and hypocentral depth.
 * Empirical attenuation relation based on Wald/Worden:
 * I_mm ≈ 1.5 * M - 2.5 * log10(h) + 1.2  (clamped to I - XII)
 */
export function estimateMMI(mag: number, depthKm: number): { roman: string; numeric: number; label: string } {
  const effectiveDepth = Math.max(depthKm, 5.0);
  const rawIntensity = 1.5 * mag - 2.5 * Math.log10(effectiveDepth) + 1.2;
  const clamped = Math.min(Math.max(Math.round(rawIntensity), 1), 10);

  const mmiMap: Record<number, { roman: string; label: string }> = {
    1: { roman: 'I', label: 'Not Felt' },
    2: { roman: 'II', label: 'Weak' },
    3: { roman: 'III', label: 'Weak' },
    4: { roman: 'IV', label: 'Light' },
    5: { roman: 'V', label: 'Moderate' },
    6: { roman: 'VI', label: 'Strong' },
    7: { roman: 'VII', label: 'Very Strong' },
    8: { roman: 'VIII', label: 'Severe' },
    9: { roman: 'IX', label: 'Violent' },
    10: { roman: 'X+', label: 'Extreme' },
  };

  return {
    roman: mmiMap[clamped]?.roman || 'I',
    numeric: clamped,
    label: mmiMap[clamped]?.label || 'Not Felt',
  };
}

/**
 * Fits Gutenberg-Richter parameters (a and b values) using linear regression on cumulative counts.
 * log10(N(>= M)) = a - b * M
 */
export function calculateGutenbergRichter(features: EarthquakeFeature[]): { bValue: number; aValue: number; binnedData: { mag: number; cumulativeN: number; logN: number; count: number }[] } {
  if (features.length < 5) {
    return { bValue: 1.0, aValue: 3.0, binnedData: [] };
  }

  // Magnitudes range from 1.0 to 9.0 in 0.5 steps
  const magSteps: number[] = [];
  for (let m = 2.0; m <= 8.5; m += 0.5) {
    magSteps.push(Number(m.toFixed(1)));
  }

  const binnedData = magSteps.map(m => {
    const cumulative = features.filter(f => f.properties.mag >= m).length;
    const countInBin = features.filter(f => f.properties.mag >= m && f.properties.mag < m + 0.5).length;
    return {
      mag: m,
      cumulativeN: cumulative,
      logN: cumulative > 0 ? Math.log10(cumulative) : 0,
      count: countInBin
    };
  }).filter(d => d.cumulativeN > 0);

  // Linear regression: y = a + (-b) * x, where y = log10(N), x = mag
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  const n = binnedData.length;

  if (n < 2) {
    return { bValue: 1.0, aValue: 3.0, binnedData };
  }

  for (const d of binnedData) {
    sumX += d.mag;
    sumY += d.logN;
    sumXY += d.mag * d.logN;
    sumX2 += d.mag * d.mag;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const bValue = Math.max(0.1, -slope);
  const aValue = intercept;

  return {
    bValue: Number(bValue.toFixed(2)),
    aValue: Number(aValue.toFixed(2)),
    binnedData
  };
}

/**
 * Aggregates complete seismological statistics for a set of earthquake features.
 */
export function computeSeismologyStats(features: EarthquakeFeature[]): SeismologyStats {
  if (!features || features.length === 0) {
    return {
      totalCount: 0,
      maxMagnitude: 0,
      maxMagnitudeEvent: null,
      avgDepth: 0,
      deepestEvent: null,
      totalEnergyJoules: 0,
      totalEnergyTntKilotons: 0,
      shallowCount: 0,
      intermediateCount: 0,
      deepCount: 0,
      tsunamiWarningsCount: 0,
      gutenbergBValue: 1.0,
      gutenbergAValue: 0
    };
  }

  let maxMag = -Infinity;
  let maxMagEvent: EarthquakeFeature | null = null;
  let maxDepth = -Infinity;
  let deepestEvent: EarthquakeFeature | null = null;
  let totalDepth = 0;
  let totalEnergy = 0;
  let shallowCount = 0;
  let intermediateCount = 0;
  let deepCount = 0;
  let tsunamiCount = 0;

  for (const f of features) {
    const mag = f.properties.mag ?? 0;
    const depth = f.geometry.coordinates[2] ?? 0;

    if (mag > maxMag) {
      maxMag = mag;
      maxMagEvent = f;
    }

    if (depth > maxDepth) {
      maxDepth = depth;
      deepestEvent = f;
    }

    totalDepth += depth;
    totalEnergy += calculateSeismicEnergyJoules(mag);

    if (depth < 70) shallowCount++;
    else if (depth <= 300) intermediateCount++;
    else deepCount++;

    if (f.properties.tsunami === 1) {
      tsunamiCount++;
    }
  }

  const gr = calculateGutenbergRichter(features);

  return {
    totalCount: features.length,
    maxMagnitude: maxMag > -Infinity ? maxMag : 0,
    maxMagnitudeEvent: maxMagEvent,
    avgDepth: features.length > 0 ? Number((totalDepth / features.length).toFixed(1)) : 0,
    deepestEvent,
    totalEnergyJoules: totalEnergy,
    totalEnergyTntKilotons: joulesToTntKilotons(totalEnergy),
    shallowCount,
    intermediateCount,
    deepCount,
    tsunamiWarningsCount: tsunamiCount,
    gutenbergBValue: gr.bValue,
    gutenbergAValue: gr.aValue
  };
}

/**
 * Format relative time (e.g., '14m ago', '3h ago', '2d ago')
 */
export function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.floor((Date.now() - timestampMs) / 1000);
  if (diffSec < 0) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

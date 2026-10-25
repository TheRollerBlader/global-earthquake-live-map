import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EarthquakeFeature } from '../../types/seismic';
import { getDepthColor, getDepthCategory, formatSeismicEnergy, calculateSeismicEnergyJoules, estimateMMI, formatRelativeTime } from '../../utils/seismology';
import { ZoomIn, ZoomOut, RotateCcw, Waves } from 'lucide-react';

interface FlatMapViewProps {
  earthquakes: EarthquakeFeature[];
  selectedQuake: EarthquakeFeature | null;
  onSelectQuake: (quake: EarthquakeFeature | null) => void;
}

export const FlatMapView: React.FC<FlatMapViewProps> = ({
  earthquakes,
  selectedQuake,
  onSelectQuake,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport transform state (Pan & Zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // GeoJSON data caches
  const [worldData, setWorldData] = useState<any | null>(null);
  const [platesData, setPlatesData] = useState<any | null>(null);

  // Hover state
  const [hoveredQuake, setHoveredQuake] = useState<EarthquakeFeature | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Load geo datasets
  useEffect(() => {
    fetch('/data/world-countries.json')
      .then(r => r.json())
      .then(setWorldData)
      .catch(console.warn);

    fetch('/data/tectonicplates.json')
      .then(r => r.json())
      .then(setPlatesData)
      .catch(console.warn);
  }, []);

  // Map coordinate transformation: [lon, lat] -> [canvasX, canvasY]
  const projectLonLat = useCallback(
    (lon: number, lat: number, width: number, height: number): [number, number] => {
      // Equirectangular projection
      const x = ((lon + 180) / 360) * width;
      const y = ((90 - lat) / 180) * height;
      return [x, y];
    },
    []
  );

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Deep space ocean background
      ctx.fillStyle = '#060a14';
      ctx.fillRect(0, 0, width, height);

      // Apply Pan & Zoom
      ctx.translate(pan.x + width / 2, pan.y + height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-width / 2, -height / 2);

      // Draw Lat/Lon Graticule lines
      ctx.strokeStyle = '#111b2e';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      for (let lat = -60; lat <= 60; lat += 30) {
        const [, y] = projectLonLat(0, lat, width, height);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      for (let lon = -180; lon <= 180; lon += 30) {
        const [x] = projectLonLat(lon, 0, width, height);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      // Draw World Continents
      if (worldData && worldData.features) {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1 / zoom;

        worldData.features.forEach((feature: any) => {
          const { type, coordinates } = feature.geometry;

          const drawPolygon = (rings: number[][][]) => {
            rings.forEach(ring => {
              if (ring.length === 0) return;
              ctx.beginPath();
              const [startX, startY] = projectLonLat(ring[0][0], ring[0][1], width, height);
              ctx.moveTo(startX, startY);
              for (let i = 1; i < ring.length; i++) {
                const [px, py] = projectLonLat(ring[i][0], ring[i][1], width, height);
                ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            });
          };

          if (type === 'Polygon') {
            drawPolygon(coordinates);
          } else if (type === 'MultiPolygon') {
            coordinates.forEach((poly: number[][][]) => drawPolygon(poly));
          }
        });
      }

      // Draw Tectonic Plate Boundaries
      if (platesData && platesData.features) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();

        platesData.features.forEach((f: any) => {
          const { type, coordinates } = f.geometry;
          const drawLine = (pts: number[][]) => {
            if (pts.length < 2) return;
            const [sx, sy] = projectLonLat(pts[0][0], pts[0][1], width, height);
            ctx.moveTo(sx, sy);
            for (let i = 1; i < pts.length; i++) {
              // Handle antimeridian jump
              const dx = Math.abs(pts[i][0] - pts[i - 1][0]);
              if (dx > 180) {
                const [px, py] = projectLonLat(pts[i][0], pts[i][1], width, height);
                ctx.moveTo(px, py);
              } else {
                const [px, py] = projectLonLat(pts[i][0], pts[i][1], width, height);
                ctx.lineTo(px, py);
              }
            }
          };

          if (type === 'LineString') {
            drawLine(coordinates);
          } else if (type === 'MultiLineString') {
            coordinates.forEach((line: number[][]) => drawLine(line));
          }
        });
        ctx.stroke();
      }

      // Draw Earthquakes
      const now = performance.now() / 1000;

      earthquakes.forEach(quake => {
        const [lon, lat, depth] = quake.geometry.coordinates;
        const [cx, cy] = projectLonLat(lon, lat, width, height);
        const mag = Math.max(quake.properties.mag || 1.0, 0.5);
        const color = getDepthColor(depth);

        const radius = Math.max(2, Math.min(18, 2.5 + Math.pow(mag, 1.25) * 1.5)) / Math.sqrt(zoom);

        // Pulsing Shockwave for M >= 4.0
        if (mag >= 3.8) {
          const pulsePhase = (now + mag) % 2.0;
          const pulseRadius = radius + (pulsePhase * 20) / Math.sqrt(zoom);
          const pulseAlpha = Math.max(0, 0.6 * (1 - pulsePhase / 2.0));

          ctx.beginPath();
          ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = pulseAlpha;
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        // Inner solid core
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // Highlight if selected
        if (selectedQuake && selectedQuake.id === quake.id) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5 / zoom;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [worldData, platesData, earthquakes, selectedQuake, zoom, pan, projectLonLat]);

  // Sync canvas size to container
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.clientWidth * window.devicePixelRatio;
      canvas.height = container.clientHeight * window.devicePixelRatio;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse handlers for pan & zoom & hover inspection
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (isDraggingRef.current) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    } else {
      // Find hovered quake
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Invert pan & zoom to find map coordinates
      const worldX = (mouseX - pan.x - width / 2) / zoom + width / 2;
      const worldY = (mouseY - pan.y - height / 2) / zoom + height / 2;

      let found: EarthquakeFeature | null = null;
      for (const quake of earthquakes) {
        const [lon, lat] = quake.geometry.coordinates;
        const [qx, qy] = projectLonLat(lon, lat, width, height);
        const dist = Math.hypot(worldX - qx, worldY - qy);
        if (dist < 12 / Math.sqrt(zoom)) {
          found = quake;
          break;
        }
      }

      setHoveredQuake(found);
      setTooltipPos(found ? { x: mouseX, y: mouseY } : null);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom(z => Math.max(0.8, Math.min(12, z * zoomFactor)));
  };

  const handleClick = () => {
    if (hoveredQuake) {
      onSelectQuake(hoveredQuake);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#060a14] overflow-hidden cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* 2D Zoom Controls HUD */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <button
          onClick={() => setZoom(z => Math.min(12, z * 1.3))}
          className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 backdrop-blur-md transition-all shadow-lg"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.8, z / 1.3))}
          className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 backdrop-blur-md transition-all shadow-lg"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 backdrop-blur-md transition-all shadow-lg"
          title="Reset Map Pan/Zoom"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Projection HUD Badge */}
      <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-400 font-mono text-xs backdrop-blur-md">
        <span>2D Cylindrical Equirectangular (WGS 84)</span>
      </div>

      {/* Depth Legend Floating HUD */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 border border-slate-800/80 rounded-xl p-3 backdrop-blur-md shadow-xl text-xs font-mono flex flex-col gap-1.5">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Hypocenter Depth</span>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
          <span className="text-slate-300">Shallow (&lt; 70 km)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
          <span className="text-slate-300">Intermediate (70 - 300 km)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
          <span className="text-slate-300">Deep (&gt; 300 km)</span>
        </div>
        <div className="flex items-center gap-2 pt-1 mt-1 border-t border-slate-800">
          <span className="w-3 h-0.5 bg-orange-500 shadow-[0_0_6px_#f97316]" />
          <span className="text-slate-400 text-[11px]">Plate Boundaries</span>
        </div>
      </div>

      {/* Hover Card */}
      {hoveredQuake && tooltipPos && (
        <div
          className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 min-w-[220px] bg-slate-950/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-mono"
          style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="px-2 py-0.5 rounded text-white font-bold text-xs"
              style={{ backgroundColor: getDepthColor(hoveredQuake.geometry.coordinates[2]) }}
            >
              M {hoveredQuake.properties.mag.toFixed(1)}
            </span>
            <span className="text-slate-400 uppercase text-[10px]">
              {getDepthCategory(hoveredQuake.geometry.coordinates[2])}
            </span>
            {hoveredQuake.properties.tsunami === 1 && (
              <span className="ml-auto text-cyan-400 flex items-center gap-1 text-[10px]">
                <Waves className="w-3 h-3" /> Tsunami
              </span>
            )}
          </div>
          <p className="text-slate-200 font-sans font-medium text-xs mb-2">
            {hoveredQuake.properties.place}
          </p>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 border-t border-slate-800 pt-1.5">
            <div>Depth: <span className="text-slate-200">{hoveredQuake.geometry.coordinates[2]} km</span></div>
            <div>Time: <span className="text-slate-200">{formatRelativeTime(hoveredQuake.properties.time)}</span></div>
            <div>MMI: <span className="text-amber-400">{estimateMMI(hoveredQuake.properties.mag, hoveredQuake.geometry.coordinates[2]).roman}</span></div>
            <div>Energy: <span className="text-emerald-400">{formatSeismicEnergy(calculateSeismicEnergyJoules(hoveredQuake.properties.mag)).tntEquivalent}</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

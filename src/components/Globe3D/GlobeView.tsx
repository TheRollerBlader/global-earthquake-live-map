import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { EarthquakeFeature } from '../../types/seismic';
import { getDepthColor, getDepthCategory, formatSeismicEnergy, calculateSeismicEnergyJoules, estimateMMI, formatRelativeTime } from '../../utils/seismology';
import { ExternalLink, Radio, Zap, Waves, Compass, RotateCcw } from 'lucide-react';

interface GlobeViewProps {
  earthquakes: EarthquakeFeature[];
  selectedQuake: EarthquakeFeature | null;
  onSelectQuake: (quake: EarthquakeFeature | null) => void;
  flyToTarget: { lat: number; lon: number } | null;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
}

const GLOBE_RADIUS = 100;

// Coordinate transformation: Lat/Lon -> 3D Vector3
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

export const GlobeView: React.FC<GlobeViewProps> = ({
  earthquakes,
  selectedQuake,
  onSelectQuake,
  flyToTarget,
  autoRotate,
  onToggleAutoRotate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const quakesGroupRef = useRef<THREE.Group | null>(null);
  const shockwavesGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(-10, -10));

  // Camera animation / dragging state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraDistanceRef = useRef(260);
  const targetRotationRef = useRef({ x: 0.2, y: 0 });
  const currentRotationRef = useRef({ x: 0.2, y: 0 });
  const flyAnimationRef = useRef<{ active: boolean; targetRotX: number; targetRotY: number; progress: number } | null>(null);

  // Hover state for HUD
  const [hoveredQuake, setHoveredQuake] = useState<EarthquakeFeature | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.set(0, 0, cameraDistanceRef.current);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x93c5fd, 1.2);
    dirLight1.position.set(200, 150, 250);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6);
    dirLight2.position.set(-200, -100, -200);
    scene.add(dirLight2);

    // Root Globe Group (contains sphere, coasts, plates, quakes)
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // Earth Base Sphere (Deep midnight oceanic surface)
    const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 72);
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x090f1d,
      emissive: 0x03060c,
      specular: 0x1e293b,
      shininess: 12,
      wireframe: false,
    });
    const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    globeGroup.add(globeMesh);

    // Atmospheric Glow Shell (Fresnel effect)
    const atmosphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 48, 48);
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
          gl_FragColor = vec4(0.22, 0.55, 0.95, 1.0) * intensity * 0.9;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    globeGroup.add(atmosphereMesh);

    // Latitude & Longitude Coordinate Grid (Parallels & Meridians)
    const gridGroup = new THREE.Group();
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.45,
    });

    // Parallels (-60 to +60 in 30 deg steps)
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 5) {
        points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.0008));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      gridGroup.add(new THREE.Line(geo, gridMaterial));
    }
    // Meridians (every 30 deg)
    for (let lon = -180; lon < 180; lon += 30) {
      const points: THREE.Vector3[] = [];
      for (let lat = -85; lat <= 85; lat += 5) {
        points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.0008));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      gridGroup.add(new THREE.Line(geo, gridMaterial));
    }
    globeGroup.add(gridGroup);

    // Groups for tectonic plates, earthquakes & shockwaves
    const quakesGroup = new THREE.Group();
    globeGroup.add(quakesGroup);
    quakesGroupRef.current = quakesGroup;

    const shockwavesGroup = new THREE.Group();
    globeGroup.add(shockwavesGroup);
    shockwavesGroupRef.current = shockwavesGroup;

    // Load World Coastlines GeoJSON
    fetch('/data/world-countries.json')
      .then(res => res.json())
      .then(geoJson => {
        const coastGroup = new THREE.Group();
        const coastMaterial = new THREE.LineBasicMaterial({
          color: 0x334155,
          transparent: true,
          opacity: 0.75,
        });

        // Parse coordinates from GeoJSON polygons/multipolygons
        geoJson.features.forEach((feature: { geometry: { type: string; coordinates: unknown } }) => {
          const { type, coordinates } = feature.geometry;
          const processPolygon = (rings: number[][][]) => {
            rings.forEach(ring => {
              const points: THREE.Vector3[] = [];
              for (const [lon, lat] of ring) {
                points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.0012));
              }
              if (points.length > 1) {
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                coastGroup.add(new THREE.Line(geo, coastMaterial));
              }
            });
          };

          if (type === 'Polygon') {
            processPolygon(coordinates as number[][][]);
          } else if (type === 'MultiPolygon') {
            (coordinates as number[][][][]).forEach(polygon => processPolygon(polygon));
          }
        });

        globeGroup.add(coastGroup);
      })
      .catch(err => console.warn('Could not load world countries outline:', err));

    // Load Tectonic Plate Boundaries GeoJSON
    fetch('/data/tectonicplates.json')
      .then(res => res.json())
      .then(platesJson => {
        const platesGroup = new THREE.Group();
        const plateMaterial = new THREE.LineBasicMaterial({
          color: 0xf97316, // Vibrant tectonic orange
          linewidth: 1.5,
          transparent: true,
          opacity: 0.85,
        });

        platesJson.features.forEach((feature: { geometry: { type: string; coordinates: number[][] | number[][][] } }) => {
          const { type, coordinates } = feature.geometry;
          if (type === 'LineString') {
            const points: THREE.Vector3[] = [];
            (coordinates as number[][]).forEach(([lon, lat]) => {
              points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.002));
            });
            if (points.length > 1) {
              const geo = new THREE.BufferGeometry().setFromPoints(points);
              platesGroup.add(new THREE.Line(geo, plateMaterial));
            }
          } else if (type === 'MultiLineString') {
            (coordinates as number[][][]).forEach(line => {
              const points: THREE.Vector3[] = [];
              line.forEach(([lon, lat]) => {
                points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.002));
              });
              if (points.length > 1) {
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                platesGroup.add(new THREE.Line(geo, plateMaterial));
              }
            });
          }
        });

        globeGroup.add(platesGroup);
      })
      .catch(err => console.warn('Could not load tectonic plates dataset:', err));

    // Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Handle FlyTo Animation
      if (flyAnimationRef.current && flyAnimationRef.current.active) {
        const anim = flyAnimationRef.current;
        anim.progress += delta * 1.6;
        if (anim.progress >= 1.0) {
          anim.progress = 1.0;
          anim.active = false;
          currentRotationRef.current.x = anim.targetRotX;
          currentRotationRef.current.y = anim.targetRotY;
          targetRotationRef.current.x = anim.targetRotX;
          targetRotationRef.current.y = anim.targetRotY;
        } else {
          // Smooth easeOutCubic
          const t = 1 - Math.pow(1 - anim.progress, 3);
          currentRotationRef.current.x = THREE.MathUtils.lerp(currentRotationRef.current.x, anim.targetRotX, t);
          currentRotationRef.current.y = THREE.MathUtils.lerp(currentRotationRef.current.y, anim.targetRotY, t);
        }
      } else {
        // Normal damping / manual drag or auto-rotation
        if (autoRotate && !isDraggingRef.current) {
          targetRotationRef.current.y += delta * 0.15;
        }

        currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.08;
        currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.08;
      }

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = currentRotationRef.current.x;
        globeGroupRef.current.rotation.y = currentRotationRef.current.y;
      }

      // Camera distance zoom interpolation
      if (cameraRef.current) {
        cameraRef.current.position.z += (cameraDistanceRef.current - cameraRef.current.position.z) * 0.1;
      }

      // Animate pulsing shockwaves
      if (shockwavesGroupRef.current) {
        shockwavesGroupRef.current.children.forEach(child => {
          const mesh = child as THREE.Mesh;
          const uTime = (elapsedTime + (mesh.userData.offset || 0)) % 2.5;
          const scale = 1.0 + uTime * 2.8;
          mesh.scale.set(scale, scale, scale);
          const mat = mesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = Math.max(0, 0.8 * (1.0 - uTime / 2.5));
          }
        });
      }

      // Render
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current && container.contains(rendererRef.current.domElement)) {
        container.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Earthquakes Geometry when list changes
  useEffect(() => {
    if (!quakesGroupRef.current || !shockwavesGroupRef.current) return;

    // Clear previous children
    while (quakesGroupRef.current.children.length > 0) {
      const obj = quakesGroupRef.current.children[0];
      quakesGroupRef.current.remove(obj);
    }
    while (shockwavesGroupRef.current.children.length > 0) {
      const obj = shockwavesGroupRef.current.children[0];
      shockwavesGroupRef.current.remove(obj);
    }

    const sphereGeomCache: Record<string, THREE.SphereGeometry> = {};
    const ringGeom = new THREE.RingGeometry(0.8, 1.4, 24);

    earthquakes.forEach((quake, idx) => {
      const [lon, lat, depth] = quake.geometry.coordinates;
      const mag = Math.max(quake.properties.mag || 1.0, 0.5);

      const surfacePos = latLonToVector3(lat, lon, GLOBE_RADIUS * 1.003);
      const hexColor = getDepthColor(depth);
      const color = new THREE.Color(hexColor);

      // Sphere size scaled non-linearly by magnitude
      const baseRadius = Math.max(0.6, Math.min(3.5, 0.6 + Math.pow(mag, 1.15) * 0.35));
      const cacheKey = baseRadius.toFixed(1);
      if (!sphereGeomCache[cacheKey]) {
        sphereGeomCache[cacheKey] = new THREE.SphereGeometry(baseRadius, 16, 16);
      }

      // Quake Marker Mesh
      const mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: false,
      });
      const quakeMesh = new THREE.Mesh(sphereGeomCache[cacheKey], mat);
      quakeMesh.position.copy(surfacePos);
      quakeMesh.userData = { quake, isEarthquake: true };
      quakesGroupRef.current?.add(quakeMesh);

      // Elevated Radial Spike (Pillar outward) for M >= 4.0
      if (mag >= 3.8) {
        const spikeHeight = Math.min(18, (mag - 3.5) * 4.5);
        const tipPos = latLonToVector3(lat, lon, GLOBE_RADIUS * 1.003 + spikeHeight);
        const spikePoints = [surfacePos, tipPos];
        const spikeGeo = new THREE.BufferGeometry().setFromPoints(spikePoints);
        const spikeMat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
        });
        quakesGroupRef.current?.add(new THREE.Line(spikeGeo, spikeMat));
      }

      // Concentric Pulsing Shockwave Ring on globe surface for top quakes or M >= 4.5
      if (mag >= 4.2 || idx < 30) {
        const shockMat = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const shockMesh = new THREE.Mesh(ringGeom, shockMat);
        shockMesh.position.copy(surfacePos);
        shockMesh.lookAt(surfacePos.clone().multiplyScalar(2));
        shockMesh.userData = {
          offset: (idx * 0.17) % 2.5,
          baseRadius,
        };
        shockwavesGroupRef.current?.add(shockMesh);
      }
    });
  }, [earthquakes]);

  // Handle FlyTo Animation when target or selectedQuake changes
  useEffect(() => {
    let targetLat = 0;
    let targetLon = 0;

    if (flyToTarget) {
      targetLat = flyToTarget.lat;
      targetLon = flyToTarget.lon;
    } else if (selectedQuake) {
      targetLat = selectedQuake.geometry.coordinates[1];
      targetLon = selectedQuake.geometry.coordinates[0];
    } else {
      return;
    }

    // Convert lat/lon to target Euler rotation:
    // Earth rotY rotates longitude to face camera (+Z axis)
    // Earth rotX rotates latitude to face center
    const targetRotX = (targetLat * Math.PI) / 180;
    const targetRotY = -((targetLon + 90) * Math.PI) / 180;

    flyAnimationRef.current = {
      active: true,
      targetRotX,
      targetRotY,
      progress: 0,
    };

    // Zoom in slightly when flying to an earthquake
    cameraDistanceRef.current = 190;
  }, [flyToTarget, selectedQuake]);

  // Mouse & Touch Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container || !cameraRef.current || !quakesGroupRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    mouseRef.current.set(mouseX, mouseY);

    if (isDraggingRef.current) {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      targetRotationRef.current.y += deltaX * 0.005;
      targetRotationRef.current.x += deltaY * 0.005;
      // Clamp vertical tilt to avoid inversion
      targetRotationRef.current.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, targetRotationRef.current.x));

      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    } else {
      // Raycasting for Hover Tooltip
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(quakesGroupRef.current.children, false);

      const hit = intersects.find(i => i.object.userData?.isEarthquake);
      if (hit && hit.object.userData.quake) {
        setHoveredQuake(hit.object.userData.quake);
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setHoveredQuake(null);
        setTooltipPos(null);
      }
    }
  }, []);

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cameraDistanceRef.current = Math.max(140, Math.min(480, cameraDistanceRef.current + e.deltaY * 0.35));
  };

  const handleClick = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container || !cameraRef.current || !quakesGroupRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    mouseRef.current.set(mouseX, mouseY);

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(quakesGroupRef.current.children, false);
    const hit = intersects.find(i => i.object.userData?.isEarthquake);

    if (hit && hit.object.userData.quake) {
      onSelectQuake(hit.object.userData.quake);
    }
  };

  const handleResetCamera = () => {
    cameraDistanceRef.current = 260;
    targetRotationRef.current = { x: 0.2, y: 0 };
    flyAnimationRef.current = {
      active: true,
      targetRotX: 0.2,
      targetRotY: 0,
      progress: 0,
    };
    onSelectQuake(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#060911] cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      {/* 3D View Controls HUD Overlay */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={onToggleAutoRotate}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-md transition-all ${
            autoRotate
              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-lg shadow-sky-950/40'
              : 'bg-slate-900/80 text-slate-400 border-slate-700/60 hover:text-slate-200'
          }`}
          title="Toggle Auto-Rotation"
        >
          <Compass className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }} />
          <span>{autoRotate ? 'Orbit: ON' : 'Orbit: OFF'}</span>
        </button>

        <button
          onClick={handleResetCamera}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border bg-slate-900/80 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800 backdrop-blur-md transition-all"
          title="Reset Camera View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset View</span>
        </button>
      </div>

      {/* Depth Legend Floating HUD */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 border border-slate-800/80 rounded-xl p-3 backdrop-blur-md shadow-xl text-xs font-mono pointer-events-auto flex flex-col gap-1.5">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Seismic Hypocenter Depth</span>
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
          <span className="text-slate-400 text-[11px]">Tectonic Plate Boundaries</span>
        </div>
      </div>

      {/* Hover Tooltip / Floating Card */}
      {hoveredQuake && tooltipPos && (
        <div
          className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 min-w-[240px] bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono"
          style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-white font-bold text-sm"
                  style={{ backgroundColor: getDepthColor(hoveredQuake.geometry.coordinates[2]) }}
                >
                  M {hoveredQuake.properties.mag.toFixed(1)}
                </span>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                  {getDepthCategory(hoveredQuake.geometry.coordinates[2])}
                </span>
              </div>
              <p className="text-slate-200 font-sans font-medium text-xs mt-1 leading-snug line-clamp-2">
                {hoveredQuake.properties.place}
              </p>
            </div>
            {hoveredQuake.properties.tsunami === 1 && (
              <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/50 text-[10px] uppercase font-bold flex items-center gap-1">
                <Waves className="w-2.5 h-2.5" /> Tsunami
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px]">DEPTH</span>
              <span className="font-semibold text-slate-200">{hoveredQuake.geometry.coordinates[2]} km</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">TIME</span>
              <span className="font-semibold text-slate-200">{formatRelativeTime(hoveredQuake.properties.time)}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">EST. MMI</span>
              <span className="font-semibold text-amber-400">
                {estimateMMI(hoveredQuake.properties.mag, hoveredQuake.geometry.coordinates[2]).roman} (
                {estimateMMI(hoveredQuake.properties.mag, hoveredQuake.geometry.coordinates[2]).label})
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">ENERGY</span>
              <span className="font-semibold text-emerald-400">
                {formatSeismicEnergy(calculateSeismicEnergyJoules(hoveredQuake.properties.mag)).tntEquivalent}
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Coordinates: {hoveredQuake.geometry.coordinates[1].toFixed(2)}°, {hoveredQuake.geometry.coordinates[0].toFixed(2)}°</span>
            <span className="text-sky-400">Click to focus</span>
          </div>
        </div>
      )}

      {/* Selected Earthquake Detailed Floating Card */}
      {selectedQuake && (
        <div className="absolute top-4 right-4 z-20 w-80 bg-slate-950/95 border border-sky-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl pointer-events-auto">
          <div className="flex items-start justify-between mb-3 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-md text-white font-mono font-bold text-base shadow-md"
                  style={{ backgroundColor: getDepthColor(selectedQuake.geometry.coordinates[2]) }}
                >
                  M {selectedQuake.properties.mag.toFixed(1)}
                </span>
                <span className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-300">
                  {selectedQuake.properties.magType.toUpperCase()} Magnitude
                </span>
              </div>
              <h3 className="font-sans font-semibold text-slate-100 text-sm mt-1.5 leading-snug">
                {selectedQuake.properties.place}
              </h3>
            </div>
            <button
              onClick={() => onSelectQuake(null)}
              className="text-slate-500 hover:text-slate-300 text-lg leading-none p-1"
            >
              ×
            </button>
          </div>

          <div className="space-y-2 font-mono text-xs text-slate-300">
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-sky-400" /> Hypocenter Depth
              </span>
              <span className="font-bold text-slate-100">{selectedQuake.geometry.coordinates[2]} km</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Radiated Energy
              </span>
              <span className="font-bold text-emerald-400">
                {formatSeismicEnergy(calculateSeismicEnergyJoules(selectedQuake.properties.mag)).tntEquivalent}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400">Peak Ground Intensity (MMI)</span>
              <span className="font-bold text-amber-300">
                {estimateMMI(selectedQuake.properties.mag, selectedQuake.geometry.coordinates[2]).roman} -{' '}
                {estimateMMI(selectedQuake.properties.mag, selectedQuake.geometry.coordinates[2]).label}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400">Occurred (UTC)</span>
              <span className="text-slate-200">{new Date(selectedQuake.properties.time).toUTCString().slice(5, 22)}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400">Epicenter Coordinates</span>
              <span className="text-slate-200">
                {selectedQuake.geometry.coordinates[1].toFixed(3)}°N, {selectedQuake.geometry.coordinates[0].toFixed(3)}°E
              </span>
            </div>

            {selectedQuake.properties.felt !== null && selectedQuake.properties.felt > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Felt Reports</span>
                <span className="text-sky-300 font-bold">{selectedQuake.properties.felt} citizens</span>
              </div>
            )}
          </div>

          <a
            href={selectedQuake.properties.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono text-xs font-semibold transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>USGS Seismogram & Event Page</span>
          </a>
        </div>
      )}
    </div>
  );
};

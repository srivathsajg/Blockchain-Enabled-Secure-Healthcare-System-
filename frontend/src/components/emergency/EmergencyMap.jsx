import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin, Navigation, Truck, RefreshCw, Crosshair,
  Clock, AlertTriangle, CheckCircle2, Signal, Loader2, Maximize2, ShieldCheck
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
const ARRIVAL_RADIUS_METERS = 75;
const ROUTE_RECALC_DISTANCE_METERS = 100; // recalc route when ambulance moves > 100m
const ROUTE_RECALC_INTERVAL_MS = 35000;   // periodic check every 35s

// Haversine distance in meters
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371e3;
  const rad = Math.PI / 180;
  const f1 = lat1 * rad;
  const f2 = lat2 * rad;
  const df = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const formatDistance = (meters) => {
  if (meters == null) return '--';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatEta = (minutes, isArrived, status) => {
  if (isArrived || status === 'AMBULANCE_ARRIVED') return 'Arrived';
  if (minutes == null) return '--';
  if (minutes <= 1) return '< 1 min';
  return `${minutes} min`;
};

// Custom Leaflet DivIcons
const createAmbulanceIcon = (heading) => {
  return L.divIcon({
    className: 'custom-ambulance-marker',
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(16, 185, 129, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #059669, #10b981); border: 2px solid #34d399; box-shadow: 0 0 16px rgba(16,185,129,0.6); display: flex; align-items: center; justify-content: center; font-size: 20px;">
          🚑
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
};

const createPatientIcon = () => {
  return L.divIcon({
    className: 'custom-patient-marker',
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(239, 68, 68, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #dc2626, #ef4444); border: 2px solid #f87171; box-shadow: 0 0 16px rgba(239,68,68,0.6); display: flex; align-items: center; justify-content: center; font-size: 20px;">
          📍
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
};

/**
 * EmergencyMap — OpenStreetMap & OSRM Live Ambulance Tracking Component
 */
const EmergencyMap = ({
  patientLocation,
  ambulanceLocation,
  patientName = 'Patient',
  status = 'AMBULANCE_ASSIGNED',
  distanceMeters: propDistanceMeters,
  etaMinutes: propEtaMinutes,
  isAmbulanceView = false,
  className = '',
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const patientMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastRouteOriginRef = useRef(null);
  const routeTimerRef = useRef(null);
  const isFetchingRouteRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [routeDistance, setRouteDistance] = useState(null); // in meters from OSRM
  const [routeEta, setRouteEta] = useState(null); // in minutes from OSRM
  const [routeUpdatedAt, setRouteUpdatedAt] = useState(null);
  const [followAmbulance, setFollowAmbulance] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);

  // Extract valid numerical coordinates
  const pLat = patientLocation?.latitude != null ? Number(patientLocation.latitude) : null;
  const pLng = patientLocation?.longitude != null ? Number(patientLocation.longitude) : null;
  const aLat = ambulanceLocation?.latitude != null ? Number(ambulanceLocation.latitude) : null;
  const aLng = ambulanceLocation?.longitude != null ? Number(ambulanceLocation.longitude) : null;

  const hasPatientCoords = pLat != null && pLng != null && !isNaN(pLat) && !isNaN(pLng);
  const hasAmbulanceCoords = aLat != null && aLng != null && !isNaN(aLat) && !isNaN(aLng);

  // Fallback straight-line distance
  const localDistance = useMemo(() => {
    if (!hasPatientCoords || !hasAmbulanceCoords) return null;
    return haversineMeters(aLat, aLng, pLat, pLng);
  }, [hasPatientCoords, hasAmbulanceCoords, aLat, aLng, pLat, pLng]);

  const displayDistance = routeDistance ?? propDistanceMeters ?? localDistance;
  const displayEta = routeEta ?? propEtaMinutes ?? (localDistance ? Math.max(1, Math.round((localDistance / 1000 / 40) * 60)) : null);

  const isArrived = status === 'AMBULANCE_ARRIVED' || (displayDistance != null && displayDistance <= ARRIVAL_RADIUS_METERS);

  // ── 1. Fetch Driving Route from OSRM ─────────────────────────────────────────
  const fetchOsrmRoute = useCallback(async (startLat, startLng, destLat, destLng) => {
    if (isFetchingRouteRef.current) return;
    if (startLat == null || startLng == null || destLat == null || destLng == null) return;

    try {
      isFetchingRouteRef.current = true;
      setRouteLoading(true);

      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

        if (routePolylineRef.current && mapInstanceRef.current) {
          routePolylineRef.current.setLatLngs(coordinates);
        } else if (mapInstanceRef.current) {
          routePolylineRef.current = L.polyline(coordinates, {
            color: '#10b981',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round',
            dashArray: null,
          }).addTo(mapInstanceRef.current);
        }

        const distM = Math.round(route.distance);
        const durSec = Math.round(route.duration);
        const etaMin = Math.max(1, Math.ceil(durSec / 60));

        setRouteDistance(distM);
        setRouteEta(etaMin);
        setRouteUpdatedAt(new Date());
        lastRouteOriginRef.current = { lat: startLat, lng: startLng };
      }
    } catch (err) {
      console.warn('OSRM routing fallback to straight line:', err.message);
      // Fallback straight line polyline if OSRM is unreachable
      if (mapInstanceRef.current) {
        const fallbackCoords = [
          [startLat, startLng],
          [destLat, destLng],
        ];
        if (routePolylineRef.current) {
          routePolylineRef.current.setLatLngs(fallbackCoords);
        } else {
          routePolylineRef.current = L.polyline(fallbackCoords, {
            color: '#10b981',
            weight: 4,
            opacity: 0.8,
            dashArray: '8, 8',
          }).addTo(mapInstanceRef.current);
        }
      }
    } finally {
      isFetchingRouteRef.current = false;
      setRouteLoading(false);
    }
  }, []);

  // ── 2. Initialize Leaflet Map ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter = hasPatientCoords
      ? [pLat, pLng]
      : hasAmbulanceCoords
      ? [aLat, aLng]
      : [12.9716, 77.5946];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    // Dark Matter CartoDB tiles with standard OSM fallback
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (routeTimerRef.current) clearInterval(routeTimerRef.current);
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 3. Place / Update Markers & Route ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Patient Marker
    if (hasPatientCoords) {
      if (!patientMarkerRef.current) {
        patientMarkerRef.current = L.marker([pLat, pLng], {
          icon: createPatientIcon(),
          zIndexOffset: 500,
        }).addTo(map);

        patientMarkerRef.current.bindPopup(
          `<div style="font-family: sans-serif; font-size: 12px; font-weight: bold; color: #111; padding: 2px;">
            📍 Pickup: ${patientName}
          </div>`
        );
      } else {
        patientMarkerRef.current.setLatLng([pLat, pLng]);
      }
    }

    // Ambulance Marker with Smooth Movement Interpolation
    if (hasAmbulanceCoords) {
      if (!ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current = L.marker([aLat, aLng], {
          icon: createAmbulanceIcon(ambulanceLocation?.heading),
          zIndexOffset: 1000,
        }).addTo(map);

        ambulanceMarkerRef.current.bindPopup(
          `<div style="font-family: sans-serif; font-size: 12px; font-weight: bold; color: #111; padding: 2px;">
            🚑 Ambulance ${status === 'AMBULANCE_ARRIVED' ? '(Arrived)' : '(En Route)'}
          </div>`
        );
      } else {
        // Smooth Interpolation from current marker pos to new pos
        const currentLatLng = ambulanceMarkerRef.current.getLatLng();
        const startLat = currentLatLng.lat;
        const startLng = currentLatLng.lng;
        const endLat = aLat;
        const endLng = aLng;

        if (startLat !== endLat || startLng !== endLng) {
          const duration = 700; // ms
          const startTime = performance.now();

          const animateStep = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quad
            const ease = 1 - (1 - progress) * (1 - progress);

            const curLat = startLat + (endLat - startLat) * ease;
            const curLng = startLng + (endLng - startLng) * ease;

            if (ambulanceMarkerRef.current) {
              ambulanceMarkerRef.current.setLatLng([curLat, curLng]);
            }

            if (followAmbulance && mapInstanceRef.current) {
              mapInstanceRef.current.panTo([curLat, curLng], { animate: false });
            }

            if (progress < 1) {
              animationFrameRef.current = requestAnimationFrame(animateStep);
            }
          };

          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = requestAnimationFrame(animateStep);
        }
      }
    }

    // Fetch initial route or recalculate if ambulance moved significantly
    if (hasPatientCoords && hasAmbulanceCoords) {
      const last = lastRouteOriginRef.current;
      if (!last) {
        fetchOsrmRoute(aLat, aLng, pLat, pLng);
        // Initial auto-fit bounds
        const bounds = L.latLngBounds([
          [pLat, pLng],
          [aLat, aLng],
        ]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        const movedMeters = haversineMeters(last.lat, last.lng, aLat, aLng);
        if (movedMeters >= ROUTE_RECALC_DISTANCE_METERS) {
          fetchOsrmRoute(aLat, aLng, pLat, pLng);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pLat, pLng, aLat, aLng, hasPatientCoords, hasAmbulanceCoords]);

  // ── 4. Periodic Route Refresh ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !hasPatientCoords || !hasAmbulanceCoords) return;

    if (routeTimerRef.current) clearInterval(routeTimerRef.current);
    routeTimerRef.current = setInterval(() => {
      fetchOsrmRoute(aLat, aLng, pLat, pLng);
    }, ROUTE_RECALC_INTERVAL_MS);

    return () => {
      if (routeTimerRef.current) clearInterval(routeTimerRef.current);
    };
  }, [mapReady, hasPatientCoords, hasAmbulanceCoords, aLat, aLng, pLat, pLng, fetchOsrmRoute]);

  // ── 5. Recenter & Navigation Handlers ──────────────────────────────────────
  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (hasPatientCoords && hasAmbulanceCoords) {
      const bounds = L.latLngBounds([
        [pLat, pLng],
        [aLat, aLng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (hasPatientCoords) {
      map.setView([pLat, pLng], 15);
    } else if (hasAmbulanceCoords) {
      map.setView([aLat, aLng], 15);
    }
    setFollowAmbulance(false);
  };

  const openNavigation = () => {
    if (!hasPatientCoords) return;
    const origin = hasAmbulanceCoords ? `${aLat},${aLng}` : '';
    const dest = `${pLat},${pLng}`;
    // Opens Google Maps / Apple Maps / OSM directions
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${dest}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Accuracy display logic
  const accuracy = ambulanceLocation?.accuracy || patientLocation?.accuracy;
  const accuracyLabel =
    accuracy == null
      ? null
      : accuracy <= 15
      ? { text: 'GPS: Accurate', color: 'text-emerald-400' }
      : accuracy <= 40
      ? { text: `GPS: ~${Math.round(accuracy)}m`, color: 'text-yellow-400' }
      : { text: 'GPS: Updating…', color: 'text-amber-400' };

  const updatedTimeAgo = routeUpdatedAt
    ? (() => {
        const secs = Math.floor((Date.now() - routeUpdatedAt.getTime()) / 1000);
        if (secs < 20) return 'just now';
        if (secs < 60) return `${secs}s ago`;
        return `${Math.floor(secs / 60)}m ago`;
      })()
    : null;

  return (
    <div className={`rounded-2xl overflow-hidden border border-emerald-500/20 bg-[#0d1117] shadow-xl ${className}`}>
      {/* ── Header Toolbar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#0d1117] border-b border-white/[0.06] gap-2">
        <div className="flex items-center gap-2">
          {isArrived ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
            {isArrived ? 'Ambulance Arrived' : isAmbulanceView ? 'Driver GPS Navigation' : 'Live OpenStreetMap Tracking'}
          </span>
          {accuracyLabel && (
            <span className={`text-[10px] font-semibold hidden sm:inline ${accuracyLabel.color}`}>
              · {accuracyLabel.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {routeLoading && <Loader2 size={13} className="text-emerald-400 animate-spin mr-1" />}
          <button
            type="button"
            onClick={() => hasPatientCoords && hasAmbulanceCoords && fetchOsrmRoute(aLat, aLng, pLat, pLng)}
            title="Recalculate route"
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter view"
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <Crosshair size={13} />
          </button>
          {hasAmbulanceCoords && (
            <button
              type="button"
              onClick={() => setFollowAmbulance((prev) => !prev)}
              title={followAmbulance ? 'Stop following' : 'Follow ambulance'}
              className={`p-1.5 rounded-lg transition-colors ${
                followAmbulance ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Leaflet OpenStreetMap Container ─────────────────────────────── */}
      <div className="relative w-full h-[320px] sm:h-[360px] md:h-[390px] bg-[#0b0d11]">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Arrival Banner Badge */}
        {isArrived && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-emerald-600/90 backdrop-blur-md border border-emerald-400/40 rounded-full px-4 py-1.5 flex items-center gap-2 z-[1000] shadow-2xl">
            <CheckCircle2 size={14} className="text-white" />
            <span className="text-xs font-black text-white uppercase tracking-wider">
              Ambulance Arrived On Scene
            </span>
          </div>
        )}

        {/* Waiting Location Overlay */}
        {!hasPatientCoords && !hasAmbulanceCoords && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1117]/85 backdrop-blur-sm z-[1000] p-6 text-center">
            <MapPin size={32} className="text-gray-400 mb-2" />
            <p className="text-sm font-bold text-gray-200">Waiting for GPS Coordinates…</p>
            <p className="text-xs text-gray-400 mt-1">Live position will automatically pin on the map once acquired.</p>
          </div>
        )}
      </div>

      {/* ── Stats & Route Telemetry Bar ─────────────────────────────────── */}
      <div className="px-4 py-3 bg-[#0d1117] border-t border-white/[0.05]">
        <div className="flex flex-wrap items-center gap-4">
          {/* Distance */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <MapPin size={14} />
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">Distance</p>
              <p className="text-sm font-black text-white">{formatDistance(displayDistance)}</p>
            </div>
          </div>

          <div className="w-px h-8 bg-white/[0.06] hidden sm:block" />

          {/* ETA */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Clock size={14} />
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">ETA (Driving)</p>
              <p className={`text-sm font-black ${isArrived ? 'text-emerald-400' : 'text-white'}`}>
                {formatEta(displayEta, isArrived, status)}
              </p>
            </div>
          </div>

          <div className="w-px h-8 bg-white/[0.06] hidden sm:block" />

          {/* Route Status */}
          {updatedTimeAgo && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Signal size={14} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">OSRM Route</p>
                <p className="text-xs font-semibold text-gray-300">Updated {updatedTimeAgo}</p>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              {patientName}
            </span>
            {hasAmbulanceCoords && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                Ambulance
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Ambulance Navigation Button ──────────────────────────────────── */}
      {isAmbulanceView && hasPatientCoords && (
        <div className="p-3 bg-[#0b0d11] border-t border-white/[0.05]">
          <button
            type="button"
            onClick={openNavigation}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 text-sm transition-all shadow-lg shadow-emerald-900/30 active:scale-[0.99]"
          >
            <Navigation size={16} />
            Navigate to Patient (External Maps)
          </button>
        </div>
      )}
    </div>
  );
};

export default EmergencyMap;

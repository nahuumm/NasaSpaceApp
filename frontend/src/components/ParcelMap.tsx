import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore, type LatLng } from '../store/useStore';
import { rectanguloDesdeEsquinas, seCruza } from '../lib/geo';
import DrawToolbar, { type Herramienta } from './map/DrawToolbar';
import EditableParcel from './map/EditableParcel';

function ClickCapture({ herramienta }: { herramienta: Herramienta }) {
  const drawing = useStore((s) => s.drawing);
  useMapEvents({
    click(e) {
      if (!drawing) return;
      const punto: LatLng = [e.latlng.lat, e.latlng.lng];
      const { points, addPoint, finishDrawing } = useStore.getState();
      if (herramienta === 'rectangulo') {
        if (points.length === 0) { addPoint(punto); return; }       // primera esquina
        const a = points[0];
        if (a[0] === punto[0] || a[1] === punto[1]) return;          // esquinas sin área
        useStore.setState({ points: rectanguloDesdeEsquinas(a, punto) });
        finishDrawing();                                              // segunda esquina: termina sola
        return;
      }
      addPoint(punto);
    },
  });
  return null;
}

// Mueve el mapa solo la primera vez que se termina la parcela (no al editar sus puntos).
function FlyToParcel() {
  const map = useMap();
  const geometry = useStore((s) => s.geometry);
  const anterior = useRef<GeoJSON.Polygon | null>(null);
  useEffect(() => {
    const { points } = useStore.getState();
    if (geometry && !anterior.current && points.length >= 3) {
      map.flyToBounds(L.latLngBounds(points), { padding: [80, 80], duration: 1.1, easeLinearity: 0.2 });
    }
    anterior.current = geometry;
  }, [geometry, map]);
  return null;
}

export default function ParcelMap() {
  const { drawing, points, geometry, areaHa, startDrawing, finishDrawing, clearParcel } = useStore();
  const [herramienta, setHerramienta] = useState<Herramienta>('poligono');
  const [editando, setEditando] = useState(false);
  const [borrarPunto, setBorrarPunto] = useState(false);
  const [historial, setHistorial] = useState<LatLng[][]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  // Los avisos desaparecen solos.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const reiniciarEdicion = () => {
    setEditando(false);
    setBorrarPunto(false);
    setHistorial([]);
  };

  const iniciar = () => {
    reiniciarEdicion();
    startDrawing();
  };

  const terminar = () => {
    if (points.length < 3) return;
    if (seCruza(points)) {
      setAviso('Los lados se cruzan. Deshaz el último punto o empieza de nuevo.');
      return;
    }
    finishDrawing();
  };

  const borrarTodo = () => {
    reiniciarEdicion();
    clearParcel();
  };

  const cambiarHerramienta = (h: Herramienta) => {
    setHerramienta(h);
    if (drawing) useStore.setState({ points: [] }); // otra forma: se empieza la actual desde cero
  };

  const registrarCambio = (anteriores: LatLng[]) => setHistorial((h) => [...h.slice(-19), anteriores]);

  const deshacer = () => {
    const s = useStore.getState();
    if (s.drawing) {
      if (s.points.length > 0) useStore.setState({ points: s.points.slice(0, -1) });
      return;
    }
    if (s.geometry && historial.length > 0) {
      const previo = historial[historial.length - 1];
      setHistorial(historial.slice(0, -1));
      useStore.setState({ points: previo });
      useStore.getState().finishDrawing();
    }
  };
  const puedeDeshacer = drawing ? points.length > 0 : !!geometry && historial.length > 0;

  // Ctrl+Z (o Cmd+Z en Mac), salvo si se está escribiendo en un campo.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      deshacer();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  });

  const ayuda = drawing
    ? herramienta === 'rectangulo'
      ? points.length === 0 ? 'Toca una esquina del rectángulo' : 'Ahora toca la esquina opuesta'
      : `Toca el mapa para marcar las esquinas (${points.length}) y pulsa «Terminar»`
    : geometry && editando
      ? borrarPunto ? 'Toca un punto para quitarlo' : 'Arrastra los puntos para ajustar la parcela'
      : null;

  return (
    <div className={`relative h-full w-full ${drawing ? 'cursor-crosshair' : ''}`}>
      <MapContainer center={[31.8667, -116.5963]} zoom={13} doubleClickZoom={false} zoomControl={false} className="h-full w-full">
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles © Esri"
        />
        <ClickCapture herramienta={herramienta} />
        <FlyToParcel />

        {drawing && points.length > 1 && (
          <Polyline positions={points} pathOptions={{ color: '#FFFFFF', weight: 2.5, dashArray: '6 6' }} />
        )}
        {drawing &&
          points.map((p, i) => (
            <CircleMarker key={i} center={p} radius={6}
              pathOptions={{ color: '#3F7D4A', weight: 2.5, fillColor: '#FFFFFF', fillOpacity: 1 }} />
          ))}
        {geometry && (
          <EditableParcel editando={editando} borrarPunto={borrarPunto} onCambio={registrarCambio} onAviso={setAviso} />
        )}
      </MapContainer>

      {/* En lg+ se descuenta el ancho del panel lateral (360/400 px + márgenes) para no quedar debajo de él */}
      <div className="absolute left-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 lg:max-w-[calc(100%-360px-2.75rem)] xl:max-w-[calc(100%-400px-2.75rem)]">
        <DrawToolbar
          herramienta={herramienta} onHerramienta={cambiarHerramienta}
          editando={editando} onEditando={(v) => { setEditando(v); if (!v) setBorrarPunto(false); }}
          borrarPunto={borrarPunto} onBorrarPunto={setBorrarPunto}
          puedeDeshacer={puedeDeshacer} onDeshacer={deshacer}
          onIniciar={iniciar} onTerminar={terminar} onBorrarTodo={borrarTodo}
        />
        {ayuda && <p role="status" className="rounded-full bg-orbit/80 px-4 py-2 text-sm text-paper">{ayuda}</p>}
        {aviso && <p role="alert" className="rounded-xl border border-danger/40 bg-surface-raised px-3 py-2 text-sm text-ink-900 shadow-card">{aviso}</p>}
      </div>

      {geometry && areaHa && (
        // En celular quedaría bajo el panel, que ya muestra las hectáreas.
        <div className="absolute bottom-6 left-4 z-[1000] hidden rounded-lg lg:block bg-orbit/80 px-3 py-1.5 font-mono text-xs text-paper">
          {areaHa.toFixed(1)} ha
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";

// SF center coordinates
const SF_CENTER = [-122.4058, 37.7859];

const CATEGORY_COLORS = {
  venue: "#2ec4b6",
  food: "#f2b84b",
  media: "#ff7765",
};

const CATEGORY_EMOJI = {
  venue: "🏛️",
  food: "🍽️",
  media: "📸",
};

export default function VenueMap({
  vendors = [],
  selectedIds = {},
  eligibleVenueIds = new Set(),
  onVendorClick,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupsRef = useRef([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapRef.current) return; // already initialized

    // Lazy-load mapbox-gl so Next.js SSR doesn't break
    import("mapbox-gl").then((mapboxgl) => {
      mapboxgl = mapboxgl.default || mapboxgl;
      mapboxgl.accessToken =
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
        "pk.eyJ1IjoibG9vcGV2ZW50ZGVtbyIsImEiOiJjbHcyZ3E5NXUwMDFtMmtsejNuZGlrOHFuIn0.placeholder";

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: SF_CENTER,
        zoom: 13.5,
        pitch: 40,
        bearing: -10,
        antialias: true,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        renderMarkers(mapboxgl, map, vendors, selectedIds, eligibleVenueIds, onVendorClick);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      popupsRef.current.forEach((p) => p.remove());
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever selection changes
  useEffect(() => {
    if (!mapRef.current) return;
    import("mapbox-gl").then((mapboxgl) => {
      mapboxgl = mapboxgl.default || mapboxgl;
      markersRef.current.forEach((m) => m.remove());
      popupsRef.current.forEach((p) => p.remove());
      markersRef.current = [];
      popupsRef.current = [];
      if (mapRef.current.loaded()) {
        renderMarkers(mapboxgl, mapRef.current, vendors, selectedIds, eligibleVenueIds, onVendorClick);
      }
    });
  }, [vendors, selectedIds, eligibleVenueIds, onVendorClick]);

  function renderMarkers(mapboxgl, map, vendors, selectedIds, eligibleVenueIds, onVendorClick) {
    vendors.forEach((vendor) => {
      if (!vendor.lat || !vendor.lng) return;

      const isSelected = Object.values(selectedIds).includes(vendor.vendor_id);
      const isEligible =
        vendor.category !== "venue" || eligibleVenueIds.has(vendor.vendor_id);
      const color = CATEGORY_COLORS[vendor.category] || "#ccc";

      // Build marker element
      const el = document.createElement("div");
      el.className = "map-marker";
      el.dataset.category = vendor.category;
      el.dataset.selected = isSelected ? "true" : "false";
      el.dataset.ineligible = !isEligible ? "true" : "false";

      el.innerHTML = `
        <div class="marker-pin" style="
          background: ${isSelected ? "#fff" : color};
          border: 3px solid ${color};
          opacity: ${isEligible ? 1 : 0.45};
          box-shadow: ${isSelected ? `0 0 0 6px ${color}44` : "0 4px 12px rgba(0,0,0,0.4)"};
          transform: ${isSelected ? "scale(1.3)" : "scale(1)"};
        ">
          <span>${CATEGORY_EMOJI[vendor.category]}</span>
        </div>
        <div class="marker-label" style="color:${color}">${vendor.name}</div>
      `;

      // Popup
      const popup = new mapboxgl.Popup({
        offset: 28,
        closeButton: false,
        className: "map-popup",
      }).setHTML(`
        <div class="popup-inner">
          <div class="popup-category">${vendor.category.toUpperCase()}</div>
          <div class="popup-name">${vendor.name}</div>
          <div class="popup-address">${vendor.address || ""}</div>
          <div class="popup-stats">
            <span class="popup-cost">$${vendor.cost_usd.toLocaleString()}</span>
            ${vendor.review_score ? `<span class="popup-rating">⭐ ${vendor.review_score} (${vendor.review_count})</span>` : ""}
            ${vendor.capacity ? `<span class="popup-cap">👥 ${vendor.capacity.toLocaleString()}</span>` : ""}
          </div>
          ${vendor.description ? `<div class="popup-desc">${vendor.description}</div>` : ""}
          <button class="popup-select-btn" data-vendor-id="${vendor.vendor_id}">
            ${isSelected ? "✓ Selected" : "Select this vendor"}
          </button>
        </div>
      `);
      popupsRef.current.push(popup);

      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([vendor.lng, vendor.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);

      // Handle select button inside popup
      popup.on("open", () => {
        const btn = document.querySelector(`[data-vendor-id="${vendor.vendor_id}"]`);
        if (btn && onVendorClick) {
          btn.onclick = () => {
            onVendorClick(vendor);
            popup.remove();
          };
        }
      });
    });
  }

  return (
    <div className="venue-map-wrapper">
      <div ref={mapContainer} className="venue-map" />
      <div className="map-legend">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <span key={cat} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}

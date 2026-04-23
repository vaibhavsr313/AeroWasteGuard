/* ═══════════════════════════════════════════
   AEROWASTEGUARD — SCRIPT.JS
   Full mission system + map + charts + stream
═══════════════════════════════════════════ */

/* ══════════════════════════════════
   1. SIDEBAR NAVIGATION
══════════════════════════════════ */
const toggleBtn = document.getElementById('toggleSidebar');
const sidebar   = document.getElementById('sidebar');
const overlay   = document.getElementById('sidebarOverlay');

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('active');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('active');
  overlay.classList.remove('active');
});

// Page switching
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    navigateTo(page);
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  });
});

function navigateTo(pageName) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target page
  const target = document.getElementById('page-' + pageName);
  if (target) target.classList.add('active');

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
  if (navItem) navItem.classList.add('active');

  // Trigger page-specific logic
  if (pageName === 'missions')   renderMissionsList();
  if (pageName === 'analytics')  renderAnalytics();
  if (pageName === 'dashboard')  {
    updateDashboardCards();
    updateWasteChart();
    // Resize map after it becomes visible
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
  }
}

/* ══════════════════════════════════
   2. MISSION DATA (localStorage)
══════════════════════════════════ */
const STORAGE_KEY = 'awg_missions';

function getMissions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveMissions(missions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(missions));
}

function getLatestMission() {
  const missions = getMissions();
  return missions.length ? missions[missions.length - 1] : null;
}

/* ══════════════════════════════════
   3. SAVE MISSION (Add Mission form)
══════════════════════════════════ */
function saveMission() {
  const name    = document.getElementById('f-name').value.trim();
  const date    = document.getElementById('f-date').value;
  const tiles   = document.getElementById('f-tiles').value.trim();
  const volume  = parseFloat(document.getElementById('f-volume').value);
  const density = parseFloat(document.getElementById('f-density').value);
  const weight  = parseFloat(document.getElementById('f-weight').value);
  const gas     = document.getElementById('f-gas').value === 'true';
  const gasLvl  = document.getElementById('f-gas-level').value;
  const fire    = document.getElementById('f-fire').value === 'true';
  const notes   = document.getElementById('f-notes').value.trim();

  if (!name) { showToast('⚠ Mission name is required', 'error'); return; }
  if (!date) { showToast('⚠ Date is required', 'error'); return; }
  if (isNaN(volume) || volume <= 0) { showToast('⚠ Enter a valid waste volume', 'error'); return; }

  const mission = {
    id:      'mission_' + Date.now(),
    name,
    date,
    tileFolder: tiles || '',
    wasteVolume: volume,
    wasteDensity: isNaN(density) ? 0 : density,
    estimatedWeight: isNaN(weight) ? 0 : weight,
    gasDetected: gas,
    gasLevel: gas ? gasLvl : 'None',
    fireDetected: fire,
    notes
  };

  const missions = getMissions();
  missions.push(mission);
  saveMissions(missions);

  showToast('✦ Mission saved: ' + name, 'success');
  clearForm();

  // Refresh dashboard in background
  updateDashboardCards();
  updateWasteChart();
}

function clearForm() {
  ['f-name','f-date','f-tiles','f-volume','f-density','f-weight','f-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-gas').value = 'false';
  document.getElementById('f-gas-level').value = 'None';
  document.getElementById('f-fire').value = 'false';
}

/* ══════════════════════════════════
   4. DASHBOARD — UPDATE CARDS
══════════════════════════════════ */
function updateDashboardCards() {
  const m = getLatestMission();

  if (!m) {
    // No missions yet — show dashes
    setEl('val-mission', '—');
    setEl('val-mission-date', 'No missions yet');
    setEl('val-volume', '—');
    setEl('val-density', '—');
    setEl('val-weight', '—');
    setEl('val-gas', '—');
    setEl('val-gas-level', '—');
    setEl('val-fire', '—');
    return;
  }

  // Mission card
  setEl('val-mission', m.name);
  setEl('val-mission-date', formatDate(m.date));

  // Numeric cards
  setEl('val-volume',  m.wasteVolume.toLocaleString());
  setEl('val-density', m.wasteDensity.toFixed(2));
  setEl('val-weight',  m.estimatedWeight.toLocaleString());

  // Gas status
  const gasEl = document.getElementById('val-gas');
  const gasLvlEl = document.getElementById('val-gas-level');
  gasEl.className = 'card-value status-value';
  if (m.gasDetected) {
    gasEl.textContent = 'DETECTED';
    gasEl.classList.add('status-detected');
    gasLvlEl.textContent = 'Level: ' + m.gasLevel;
  } else {
    gasEl.textContent = 'CLEAR';
    gasEl.classList.add('status-clear');
    gasLvlEl.textContent = 'No gas detected';
  }

  // Fire status
  const fireEl = document.getElementById('val-fire');
  fireEl.className = 'card-value status-value';
  if (m.fireDetected) {
    fireEl.textContent = 'YES ⚠';
    fireEl.classList.add('status-detected');
  } else {
    fireEl.textContent = 'NO';
    fireEl.classList.add('status-clear');
  }
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ══════════════════════════════════
   5. DELETE MISSION
══════════════════════════════════ */
function deleteMission(id, e) {
  e.stopPropagation(); // don't trigger card click
  if (!confirm('Delete this mission? This cannot be undone.')) return;
  const missions = getMissions().filter(m => m.id !== id);
  saveMissions(missions);
  renderMissionsList();
  updateDashboardCards();
  updateWasteChart();
  showToast('Mission deleted', 'error');
}

/* ══════════════════════════════════
   6. MISSIONS LIST PAGE
══════════════════════════════════ */
function renderMissionsList() {
  const missions = getMissions();
  const list    = document.getElementById('missions-list');
  const noMsg   = document.getElementById('no-missions');

  list.innerHTML = '';

  if (missions.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';

  // Show newest first
  [...missions].reverse().forEach((m, idx) => {
    const isLatest = idx === 0;

    const card = document.createElement('div');
    card.className = 'mission-card' + (isLatest ? ' latest' : '');
    card.title = 'Click to load on map';

    card.innerHTML = `
      <div class="mission-card-left">
        <div class="mission-card-name">${escHtml(m.name)}</div>
        <div class="mission-card-date">${formatDate(m.date)}</div>
        <div class="mission-card-stats">
          <div class="mission-stat">VOL <span>${m.wasteVolume.toLocaleString()} m³</span></div>
          <div class="mission-stat">DENSITY <span>${m.wasteDensity.toFixed(2)} t/m³</span></div>
          <div class="mission-stat">WEIGHT <span>${m.estimatedWeight.toLocaleString()} t</span></div>
          ${m.notes ? `<div class="mission-stat">NOTE <span>${escHtml(m.notes.substring(0,40))}${m.notes.length > 40 ? '…' : ''}</span></div>` : ''}
        </div>
      </div>
      <div class="mission-card-right">
        ${isLatest ? '<span class="badge badge-latest">LATEST</span>' : ''}
        <span class="badge ${m.gasDetected ? 'badge-gas-yes' : 'badge-gas-no'}">${m.gasDetected ? 'GAS: ' + m.gasLevel : 'NO GAS'}</span>
        <span class="badge ${m.fireDetected ? 'badge-fire-yes' : 'badge-fire-no'}">${m.fireDetected ? '🔥 FIRE' : 'NO FIRE'}</span>
        <button class="btn-delete" onclick="deleteMission('${m.id}', event)">✕</button>
      </div>
    `;

    // Click card → load tiles on map
    card.addEventListener('click', () => {
      loadMissionOnMap(m);
      navigateTo('dashboard');
      showToast('Loaded: ' + m.name);
    });

    list.appendChild(card);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════
   7. ANALYTICS PAGE
══════════════════════════════════ */
function renderAnalytics() {
  const missions = getMissions();
  const total    = missions.length;
  const totalVol = missions.reduce((s, m) => s + (m.wasteVolume || 0), 0);
  const totalWt  = missions.reduce((s, m) => s + (m.estimatedWeight || 0), 0);
  const gasCount = missions.filter(m => m.gasDetected).length;
  const fireCount= missions.filter(m => m.fireDetected).length;
  const avgVol   = total ? Math.round(totalVol / total) : 0;

  setEl('an-total',  total);
  setEl('an-volume', totalVol.toLocaleString());
  setEl('an-weight', totalWt.toLocaleString());
  setEl('an-gas',    gasCount);
  setEl('an-fire',   fireCount);
  setEl('an-avg',    avgVol.toLocaleString());
}

/* ══════════════════════════════════
   8. LEAFLET MAP
══════════════════════════════════ */
var map, orthoLayer, dsmLayer, cameraLayer;
var currentOrthoLayer = null;

// ── Base tile layers ──
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 22
});

var satellite = L.tileLayer(
  'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  { maxZoom: 22, subdomains: ['mt0','mt1','mt2','mt3'] }
);

// No setView — let fitBounds handle it
map = L.map('map', { layers: [osm] });

var baseMaps = {
  '🗺️ OpenStreetMap': osm,
  '🛰️ Satellite': satellite
};

// ── ODM Tile Layers ──
orthoLayer = L.tileLayer('tiles/orthophoto/{z}/{x}/{y}.png', {
  maxZoom: 22,
  tms: false,
  opacity: 1.0,
  attribution: 'ODM Orthophoto'
}).addTo(map);

dsmLayer = L.tileLayer('tiles/dsm/{z}/{x}/{y}.png', {
  maxZoom: 22,
  tms: false,
  opacity: 0.6,
  attribution: 'ODM DSM'
});

// ── Camera positions from GeoJSON ──
cameraLayer = L.layerGroup();

fetch('data/cameras.geojson')
  .then(r => r.json())
  .then(geojson => {

    var geojsonLayer = L.geoJSON(geojson, {
      pointToLayer: function(feature, latlng) {
        return L.circleMarker(latlng, {
          radius: 5,
          color: '#00c8ff',
          fillColor: '#00c8ff',
          fillOpacity: 0.8,
          weight: 1
        });
      },
      onEachFeature: function(feature, layer) {
        const props = feature.properties || {};
        const info  = Object.entries(props)
          .map(([k, v]) => `<b>${k}:</b> ${v}`)
          .join('<br>');
        if (info) layer.bindPopup(info);
      }
    });

    geojsonLayer.addTo(cameraLayer);
    cameraLayer.addTo(map);

    // ✅ Fit map to actual camera positions — this is your real location
    var bounds = geojsonLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

  })
  .catch(e => {
    console.warn('cameras.geojson not found or invalid:', e);
    // ── Fallback: fit to orthophoto tiles if geojson fails ──
    // Try to read bounds from tilemapresource.xml if QGIS generated one
    fetch('tiles/orthophoto/tilemapresource.xml')
      .then(r => r.text())
      .then(xml => {
        const parser  = new DOMParser();
        const doc     = parser.parseFromString(xml, 'text/xml');
        const bbox    = doc.querySelector('BoundingBox');
        if (bbox) {
          const minx = parseFloat(bbox.getAttribute('minx'));
          const miny = parseFloat(bbox.getAttribute('miny'));
          const maxx = parseFloat(bbox.getAttribute('maxx'));
          const maxy = parseFloat(bbox.getAttribute('maxy'));
          map.fitBounds([[miny, minx], [maxy, maxx]], { padding: [40, 40] });
          console.log('[MAP] Fitted to tilemapresource.xml bounds');
        }
      })
      .catch(() => {
        // Last resort fallback — at least zoom to India not Mumbai specifically
        map.setView([20.5937, 78.9629], 5);
        console.warn('[MAP] No location data found, showing India overview');
      });
  });

// ── Overlays ──
var overlays = {
  'Orthophoto': orthoLayer,
  'Surface Model (DSM)': dsmLayer,
  'Camera Positions': cameraLayer
};

// ── Layer control ──
L.control.layers(baseMaps, overlays).addTo(map);

// ── DSM Opacity control ──
var opacityControl = L.control({ position: 'topright' });
opacityControl.onAdd = function () {
  var div = L.DomUtil.create('div', 'leaflet-control-opacity');
  div.innerHTML = `
    <label>DSM Opacity</label>
    <input type="range" id="opacitySlider" min="0" max="1" step="0.05" value="0.6">
  `;
  L.DomEvent.disableScrollPropagation(div);
  L.DomEvent.disableClickPropagation(div);
  return div;
};
opacityControl.addTo(map);

document.addEventListener('input', e => {
  if (e.target && e.target.id === 'opacitySlider') {
    dsmLayer.setOpacity(parseFloat(e.target.value));
  }
});

// ── Load a mission's tiles on map ──
function loadMissionOnMap(mission) {
  if (!mission.tileFolder) {
    showToast('No tile folder path set for this mission', 'error');
    return;
  }
  if (currentOrthoLayer) {
    map.removeLayer(currentOrthoLayer);
  }
  currentOrthoLayer = L.tileLayer(mission.tileFolder + '/{z}/{x}/{y}.png', {
    maxZoom: 22,
    tms: true,
    attribution: 'ODM © ' + mission.name
  }).addTo(map);

  showToast('Loaded tiles for: ' + mission.name, 'success');
}

/* ══════════════════════════════════
   9. CHARTS
══════════════════════════════════ */

// ── Chart.js global defaults ──
Chart.defaults.color = '#7a8fa8';
Chart.defaults.borderColor = '#1e2a38';
Chart.defaults.font.family = "'JetBrains Mono', monospace";

// ── Methane Chart (dummy data) ──
const methaneCtx = document.getElementById('methaneChart').getContext('2d');
const methaneChart = new Chart(methaneCtx, {
  type: 'line',
  data: {
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
    datasets: [{
      label: 'Methane (ppm)',
      data: [20, 35, 30, 45, 50],
      borderColor: '#ff3c5a',
      backgroundColor: 'rgba(255,60,90,0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#ff3c5a',
      pointRadius: 4
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#1e2a38' } },
      y: { grid: { color: '#1e2a38' } }
    }
  }
});

// ── Waste Volume Chart (from missions) ──
const wasteCtx = document.getElementById('wasteChart').getContext('2d');
let wasteChart = new Chart(wasteCtx, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{
      label: 'Waste Volume (m³)',
      data: [],
      backgroundColor: 'rgba(0,200,255,0.2)',
      borderColor: '#00c8ff',
      borderWidth: 1,
      borderRadius: 3
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#1e2a38' } },
      y: { grid: { color: '#1e2a38' }, beginAtZero: true }
    }
  }
});

function updateWasteChart() {
  const missions = getMissions();
  wasteChart.data.labels   = missions.map(m => m.name);
  wasteChart.data.datasets[0].data = missions.map(m => m.wasteVolume);
  wasteChart.update();
}

/* ══════════════════════════════════
   10. 3D VIEWER
══════════════════════════════════ */
let scene, camera, renderer, controls3D;

function showMap() {
  document.getElementById('viewer3d').style.display = 'none';
  document.getElementById('map').style.display = 'block';
  document.getElementById('btn2D').classList.add('active');
  document.getElementById('btn3D').classList.remove('active');
  setTimeout(() => map.invalidateSize(), 100);
}

function show3D() {
  document.getElementById('map').style.display = 'none';
  const viewer = document.getElementById('viewer3d');
  viewer.style.display = 'block';
  document.getElementById('btn3D').classList.add('active');
  document.getElementById('btn2D').classList.remove('active');

  setTimeout(() => {
    if (!renderer) {
      init3D();
    } else {
      renderer.setSize(viewer.clientWidth, viewer.clientHeight);
      camera.aspect = viewer.clientWidth / viewer.clientHeight;
      camera.updateProjectionMatrix();
    }
  }, 200);
}

function init3D() {
  const container = document.getElementById('viewer3d');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1017);

  camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
  camera.position.set(0, 200, 300);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.appendChild(renderer.domElement);

  controls3D = new THREE.OrbitControls(camera, renderer.domElement);
  controls3D.target.set(0, 0, 0);
  controls3D.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(100, 200, 100);
  scene.add(light);

  const grid = new THREE.GridHelper(500, 50, 0x1e2a38, 0x141820);
  scene.add(grid);

  const loader = new THREE.GLTFLoader();
  const dracoLoader = new THREE.DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
  loader.setDRACOLoader(dracoLoader);

  loader.load(
    'models/model.glb',
    gltf => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const center= box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const size  = box.getSize(new THREE.Vector3()).length();
      model.scale.setScalar(100 / size);
      scene.add(model);
      showToast('3D model loaded', 'success');
    },
    xhr => console.log((xhr.loaded / xhr.total * 100).toFixed(0) + '% loaded'),
    err => {
      console.error(err);
      showToast('❌ 3D model not found — place model.glb in /models/', 'error');
    }
  );

  animate3D();
}

function animate3D() {
  requestAnimationFrame(animate3D);
  controls3D.update();
  renderer.render(scene, camera);
}

/* ══════════════════════════════════
   11. LIVE STREAM
══════════════════════════════════ */
let streamPollInterval = null;

function startStream() {
  const urlInput = document.getElementById('streamUrl');
  const url = urlInput.value.trim() || localStorage.getItem('awg_pi_ip') || '';

  if (!url) {
    showToast('Enter Pi stream URL first', 'error');
    return;
  }

  const img = document.getElementById('streamImg');
  const placeholder = document.getElementById('streamPlaceholder');

  img.src = url;
  img.style.display = 'block';
  placeholder.style.display = 'none';

  document.getElementById('btnStreamStart').style.display = 'none';
  document.getElementById('btnStreamStop').style.display  = 'inline-flex';

  // Poll Pi for fire/gas status
  const piBase = url.replace('/video_feed', '');
  streamPollInterval = setInterval(() => pollPiStatus(piBase), 2000);

  showToast('Stream started', 'success');
}

function stopStream() {
  const img = document.getElementById('streamImg');
  img.src = '';
  img.style.display = 'none';
  document.getElementById('streamPlaceholder').style.display = 'flex';
  document.getElementById('btnStreamStart').style.display = 'inline-flex';
  document.getElementById('btnStreamStop').style.display  = 'none';

  if (streamPollInterval) {
    clearInterval(streamPollInterval);
    streamPollInterval = null;
  }

  // Reset detection cards
  setDetStatus('det-fire-status', 'INACTIVE', false);
  setDetStatus('det-gas-status',  'INACTIVE', false);
  setEl('det-pi-status', 'OFFLINE');

  showToast('Stream stopped');
}

// NEW
function pollPiStatus(baseUrl) {
  fetch(baseUrl + '/api/fire')
    .then(r => r.json())
    .then(data => {
      setDetStatus('det-fire-status', data.fire  ? '🔥 DETECTED' : 'CLEAR', data.fire);
      setDetStatus('det-smoke-status', data.smoke ? '💨 DETECTED' : 'CLEAR', data.smoke);
      setEl('det-pi-status', 'ONLINE');
    })
    .catch(() => setEl('det-pi-status', 'OFFLINE'));

  fetch(baseUrl + '/api/gas')
    .then(r => r.json())
    .then(data => {
      const label = data.detected ? ('DETECTED — ' + (data.level || '')) : 'CLEAR';
      setDetStatus('det-gas-status', label, data.detected);
    })
    .catch(() => {});
}

function setDetStatus(id, text, isAlert) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'det-status' + (isAlert ? ' active-yes' : ' active-no');
}

function savePiIp() {
  const ip = document.getElementById('piIpInput').value.trim();
  if (!ip) return;
  localStorage.setItem('awg_pi_ip', ip);
  document.getElementById('streamUrl').value = 'http://' + ip + '/video_feed';
  showToast('Pi IP saved: ' + ip, 'success');
}

// Restore saved Pi IP on load
window.addEventListener('load', () => {
  const savedIp = localStorage.getItem('awg_pi_ip');
  if (savedIp) {
    const el = document.getElementById('piIpInput');
    if (el) el.value = savedIp;
  }
});

/* ══════════════════════════════════
   12. TOAST
══════════════════════════════════ */
let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = type;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

/* ══════════════════════════════════
   13. INIT ON PAGE LOAD
══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  updateDashboardCards();
  updateWasteChart();

  // Set today's date as default in Add Mission form
  const dateInput = document.getElementById('f-date');
  if (dateInput) dateInput.valueAsDate = new Date();
});
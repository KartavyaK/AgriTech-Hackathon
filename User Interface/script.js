// TerraBot Controller Application
// Pure JavaScript - No Frameworks

// ==================== STATE MANAGEMENT ====================
const state = {
  connectedDevice: null,
  availableDevices: ['TerraBot-001', 'TerraBot-002', 'ESP32-AgriBot'],
  savedMaps: [],
  currentMapData: [],
  isMapping: false,
  selectedCrop: null,
  detectionStatus: 'idle', // idle, positioning, detecting, complete
  report: null,
  activeDirection: null
};

// ==================== DOM ELEMENTS ====================
const pages = {
  main: document.getElementById('main-page'),
  maps: document.getElementById('maps-page'),
  addMap: document.getElementById('add-map-page'),
  loading: document.getElementById('loading-page'),
  report: document.getElementById('report-page')
};

// ==================== UTILITY FUNCTIONS ====================
function navigateTo(pageName) {
  Object.values(pages).forEach(page => page.classList.remove('active'));
  pages[pageName].classList.add('active');
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== MAIN PAGE ====================
function initMainPage() {
  const deviceDropdown = document.getElementById('device-dropdown');
  const deviceTrigger = document.getElementById('device-trigger');
  const deviceMenu = document.getElementById('device-menu');
  const selectedDeviceSpan = document.getElementById('selected-device');
  
  // Populate device list
  deviceMenu.innerHTML = state.availableDevices.map(device => `
    <button class="dropdown-item" data-device="${device}">
      <div class="device-status"></div>
      <span>${device}</span>
    </button>
  `).join('');
  
  // Toggle dropdown
  deviceTrigger.addEventListener('click', () => {
    deviceDropdown.classList.toggle('open');
  });
  
  // Handle device selection
  deviceMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) {
      const device = item.dataset.device;
      state.connectedDevice = device;
      selectedDeviceSpan.textContent = device;
      deviceTrigger.classList.add('has-value');
      deviceDropdown.classList.remove('open');
      
      // Send to ESP32/Python (mock)
      console.log(`Connected to device: ${device}`);
      
      // Navigate to maps page
      setTimeout(() => navigateTo('maps'), 300);
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!deviceDropdown.contains(e.target)) {
      deviceDropdown.classList.remove('open');
    }
  });
}

// ==================== MAPS PAGE ====================
function initMapsPage() {
  renderMapsGrid();
}

function renderMapsGrid() {
  const mapsGrid = document.getElementById('maps-grid');
  const maxMaps = 5;
  
  let html = '';
  
  // Render saved maps
  state.savedMaps.forEach(map => {
    html += `
      <div class="map-card" data-map-id="${map.id}">
        <button class="delete-btn" data-delete-id="${map.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
        <svg class="map-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
          <line x1="8" y1="2" x2="8" y2="18"/>
          <line x1="16" y1="6" x2="16" y2="22"/>
        </svg>
        <span class="map-name">${map.name}</span>
        <span class="map-date">${formatDate(map.createdAt)}</span>
      </div>
    `;
  });
  
  // Add button (if less than 5 maps)
  if (state.savedMaps.length < maxMaps) {
    html += `
      <div class="map-card add-card" id="add-map-btn">
        <div class="add-icon-container">
          <svg class="add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span class="map-name">ADD</span>
      </div>
    `;
  }
  
  // Empty slots
  const emptySlots = Math.max(0, maxMaps - state.savedMaps.length);
  for (let i = 0; i < emptySlots; i++) {
    html += `<div class="map-card empty"></div>`;
  }
  
  mapsGrid.innerHTML = html;
  
  // Add event listeners
  const addBtn = document.getElementById('add-map-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (state.savedMaps.length >= maxMaps) {
        showMaxMapsModal();
      } else {
        resetAddMapPage();
        navigateTo('addMap');
      }
    });
  }
  
  // Map click handlers
  mapsGrid.querySelectorAll('.map-card[data-map-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.delete-btn')) {
        const mapId = card.dataset.mapId;
        resetLoadingPage();
        navigateTo('loading');
      }
    });
  });
  
  // Delete handlers
  mapsGrid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mapId = btn.dataset.deleteId;
      state.savedMaps = state.savedMaps.filter(m => m.id !== mapId);
      renderMapsGrid();
    });
  });
}

function showMaxMapsModal() {
  const modal = document.getElementById('max-maps-modal');
  modal.classList.add('active');
  setTimeout(() => modal.classList.remove('active'), 3000);
}

// ==================== ADD MAP PAGE ====================
function initAddMapPage() {
  const disclaimerModal = document.getElementById('disclaimer-modal');
  const disclaimerStartBtn = document.getElementById('disclaimer-start-btn');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const saveBtn = document.getElementById('save-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const centerDot = document.getElementById('center-dot');
  const directionBtns = ['forward', 'backward', 'left', 'right'].map(
    dir => document.getElementById(`btn-${dir}`)
  );
  
  // Disclaimer start button
  disclaimerStartBtn.addEventListener('click', () => {
    disclaimerModal.classList.remove('active');
    startMapping();
  });
  
  // Start button
  startBtn.addEventListener('click', startMapping);
  
  // Stop button
  stopBtn.addEventListener('click', stopMapping);
  
  // Save button
  saveBtn.addEventListener('click', saveMap);
  
  // Direction buttons
  directionBtns.forEach(btn => {
    if (btn) {
      const direction = btn.id.replace('btn-', '');
      
      // Mouse events
      btn.addEventListener('mousedown', () => handleDirectionPress(direction));
      btn.addEventListener('mouseup', handleDirectionRelease);
      btn.addEventListener('mouseleave', handleDirectionRelease);
      
      // Touch events
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleDirectionPress(direction);
      });
      btn.addEventListener('touchend', handleDirectionRelease);
    }
  });
}

function resetAddMapPage() {
  const disclaimerModal = document.getElementById('disclaimer-modal');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const saveBtn = document.getElementById('save-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const centerDot = document.getElementById('center-dot');
  const mapNameInput = document.getElementById('map-name-input');
  const directionBtns = document.querySelectorAll('.direction-btn');
  
  disclaimerModal.classList.add('active');
  state.isMapping = false;
  state.currentMapData = [];
  state.activeDirection = null;
  
  mapNameInput.value = `Map ${state.savedMaps.length + 1}`;
  startBtn.disabled = true;
  stopBtn.disabled = true;
  saveBtn.disabled = true;
  startBtn.classList.remove('mapping');
  startBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    START
  `;
  statusIndicator.classList.remove('active');
  statusIndicator.querySelector('span').textContent = 'Ready';
  centerDot.classList.remove('active');
  directionBtns.forEach(btn => {
    btn.disabled = true;
    btn.classList.remove('active');
  });
}

function startMapping() {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const centerDot = document.getElementById('center-dot');
  const directionBtns = document.querySelectorAll('.direction-btn');
  
  state.isMapping = true;
  state.currentMapData = [];
  
  startBtn.disabled = true;
  startBtn.classList.add('mapping');
  startBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    MAPPING...
  `;
  stopBtn.disabled = false;
  statusIndicator.classList.add('active');
  statusIndicator.querySelector('span').textContent = 'Recording Path...';
  centerDot.classList.add('active');
  directionBtns.forEach(btn => btn.disabled = false);
  
  console.log('Mapping started - sending to Python/ESP32');
}

function stopMapping() {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const saveBtn = document.getElementById('save-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const centerDot = document.getElementById('center-dot');
  const directionBtns = document.querySelectorAll('.direction-btn');
  
  state.isMapping = false;
  
  startBtn.disabled = false;
  startBtn.classList.remove('mapping');
  startBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    START
  `;
  stopBtn.disabled = true;
  saveBtn.disabled = false;
  statusIndicator.classList.remove('active');
  statusIndicator.querySelector('span').textContent = 'Ready to Save';
  centerDot.classList.remove('active');
  directionBtns.forEach(btn => btn.disabled = true);
  
  console.log('Mapping stopped');
}

function saveMap() {
  const mapNameInput = document.getElementById('map-name-input');
  const mapName = mapNameInput.value.trim() || `Map ${state.savedMaps.length + 1}`;
  
  const newMap = {
    id: generateId(),
    name: mapName,
    createdAt: new Date(),
    encoderData: [...state.currentMapData]
  };
  
  state.savedMaps.push(newMap);
  state.currentMapData = [];
  
  console.log(`Map saved: ${mapName}`, newMap);
  
  renderMapsGrid();
  navigateTo('maps');
}

let encoderInterval = null;

function handleDirectionPress(direction) {
  if (!state.isMapping) return;
  
  state.activeDirection = direction;
  const btn = document.getElementById(`btn-${direction}`);
  btn.classList.add('active');
  
  // Simulate encoder data
  encoderInterval = setInterval(() => {
    const value = Math.random() * 100;
    state.currentMapData.push({ direction, value, timestamp: Date.now() });
    console.log(`Encoder data: ${direction} - ${value.toFixed(2)}`);
  }, 100);
  
  console.log(`Direction: ${direction}`);
}

function handleDirectionRelease() {
  if (state.activeDirection) {
    const btn = document.getElementById(`btn-${state.activeDirection}`);
    if (btn) btn.classList.remove('active');
  }
  
  state.activeDirection = null;
  
  if (encoderInterval) {
    clearInterval(encoderInterval);
    encoderInterval = null;
  }
  
  console.log('Direction: STOP');
}

// ==================== LOADING PAGE ====================
function initLoadingPage() {
  const cropDropdown = document.getElementById('crop-dropdown');
  const cropTrigger = document.getElementById('crop-trigger');
  const cropMenu = document.getElementById('crop-menu');
  const doneBtn = document.getElementById('done-btn');
  
  // Toggle dropdown
  cropTrigger.addEventListener('click', () => {
    cropDropdown.classList.toggle('open');
  });
  
  // Handle crop selection
  cropMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) {
      const crop = item.dataset.crop;
      state.selectedCrop = crop;
      
      const selectedCropSpan = document.getElementById('selected-crop');
      selectedCropSpan.textContent = item.textContent.trim();
      cropTrigger.classList.add('has-value');
      cropDropdown.classList.remove('open');
      
      console.log(`Crop selected: ${crop} - sending to Python`);
      
      // Show position section
      setTimeout(() => {
        document.getElementById('crop-selection-section').classList.add('hidden');
        document.getElementById('position-section').classList.remove('hidden');
      }, 300);
    }
  });
  
  // Done button
  doneBtn.addEventListener('click', () => {
    console.log('Bot positioned, starting detection - sending to Python');
    
    document.getElementById('position-section').classList.add('hidden');
    document.getElementById('detecting-section').classList.remove('hidden');
    
    const detectingText = document.getElementById('detecting-text');
    const cropName = state.selectedCrop.charAt(0).toUpperCase() + state.selectedCrop.slice(1);
    detectingText.textContent = `Analyzing ${cropName.toLowerCase()} plants for diseases...`;
    
    // Simulate detection
    setTimeout(() => {
      document.getElementById('detecting-section').classList.add('hidden');
      document.getElementById('complete-section').classList.remove('hidden');
      
      // Generate report
      state.report = generateReport(state.selectedCrop);
      
      // Navigate to report
      setTimeout(() => {
        renderReport();
        navigateTo('report');
      }, 2000);
    }, 5000);
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!cropDropdown.contains(e.target)) {
      cropDropdown.classList.remove('open');
    }
  });
}

function resetLoadingPage() {
  state.selectedCrop = null;
  state.detectionStatus = 'idle';
  
  const selectedCropSpan = document.getElementById('selected-crop');
  const cropTrigger = document.getElementById('crop-trigger');
  
  selectedCropSpan.textContent = 'Select a crop...';
  cropTrigger.classList.remove('has-value');
  
  document.getElementById('crop-selection-section').classList.remove('hidden');
  document.getElementById('position-section').classList.add('hidden');
  document.getElementById('detecting-section').classList.add('hidden');
  document.getElementById('complete-section').classList.add('hidden');
}

function generateReport(crop) {
  const cropName = crop.charAt(0).toUpperCase() + crop.slice(1);
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return {
    title: 'TerraBot Field Analysis Report',
    crop: cropName,
    date: date,
    environmental: {
      temperature: '24.5°C',
      humidity: '65%',
      soilMoisture: '42%'
    },
    diseases: [
      { name: 'Early Blight', count: 12, severity: 'Moderate' },
      { name: 'Late Blight', count: 3, severity: 'Low' },
      { name: 'Leaf Spot', count: 8, severity: 'Low' }
    ],
    recommendations: [
      'Apply fungicide treatment to affected areas within the next 48 hours.',
      'Current soil moisture levels are adequate. Maintain current watering schedule.',
      'Schedule follow-up inspection in 7 days to assess treatment effectiveness.',
      'Consider crop rotation for next season to reduce disease pressure.'
    ],
    healthScore: 78
  };
}

// ==================== REPORT PAGE ====================
function initReportPage() {
  const backBtn = document.getElementById('back-btn');
  const downloadBtn = document.getElementById('download-btn');
  const shareBtn = document.getElementById('share-btn');
  
  backBtn.addEventListener('click', () => {
    state.detectionStatus = 'idle';
    resetLoadingPage();
    navigateTo('maps');
  });
  
  downloadBtn.addEventListener('click', downloadReport);
  
  shareBtn.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({
        title: 'TerraBot Field Report',
        text: 'Check out my field analysis report from TerraBot!',
        url: window.location.href
      });
    } else {
      alert('Sharing is not supported on this browser');
    }
  });
}

function renderReport() {
  const reportCard = document.getElementById('report-card');
  const r = state.report;
  
  if (!r) {
    reportCard.innerHTML = '<p>No report available</p>';
    return;
  }
  
  reportCard.innerHTML = `
    <h1>${r.title}</h1>
    
    <h2>Crop: ${r.crop}</h2>
    
    <h3>Environmental Conditions</h3>
    <ul>
      <li><strong>Temperature:</strong> ${r.environmental.temperature}</li>
      <li><strong>Humidity:</strong> ${r.environmental.humidity}</li>
      <li><strong>Soil Moisture:</strong> ${r.environmental.soilMoisture}</li>
    </ul>
    
    <h3>Disease Detection Summary</h3>
    <table>
      <thead>
        <tr>
          <th>Disease</th>
          <th>Count</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        ${r.diseases.map(d => `
          <tr>
            <td>${d.name}</td>
            <td>${d.count}</td>
            <td>${d.severity}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h3>Recommendations</h3>
    <ol>
      ${r.recommendations.map(rec => `
        <li><strong>${rec.split(':')[0]}${rec.includes(':') ? ':' : ''}</strong>${rec.includes(':') ? rec.split(':').slice(1).join(':') : rec}</li>
      `).join('')}
    </ol>
    
    <h3>Overall Health Score: ${r.healthScore}/100</h3>
    <p>The ${r.crop.toLowerCase()} crop is in generally good condition with localized disease presence. Early intervention is recommended to prevent spread.</p>
    
    <hr>
    <p><em>Report generated by TerraBot AI Analysis System</em></p>
    <p><em>Date: ${r.date}</em></p>
  `;
}

function downloadReport() {
  const r = state.report;
  if (!r) return;
  
  const content = `
# ${r.title}

## Crop: ${r.crop}

### Environmental Conditions
- Temperature: ${r.environmental.temperature}
- Humidity: ${r.environmental.humidity}
- Soil Moisture: ${r.environmental.soilMoisture}

### Disease Detection Summary

| Disease | Count | Severity |
|---------|-------|----------|
${r.diseases.map(d => `| ${d.name} | ${d.count} | ${d.severity} |`).join('\n')}

### Recommendations

${r.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

### Overall Health Score: ${r.healthScore}/100

The ${r.crop.toLowerCase()} crop is in generally good condition with localized disease presence. Early intervention is recommended to prevent spread.

---
*Report generated by TerraBot AI Analysis System*
*Date: ${r.date}*
  `;
  
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `terrabot-report-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== INITIALIZATION ====================
function init() {
  initMainPage();
  initMapsPage();
  initAddMapPage();
  initLoadingPage();
  initReportPage();
  
  // Start on main page
  navigateTo('main');
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', init);

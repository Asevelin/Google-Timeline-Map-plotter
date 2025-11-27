const map = L.map('map', {
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
    minZoom: 3,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
    preferCanvas: true // Performance boost for many markers
}).setView([20, 0], 3);

const layers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        crossOrigin: 'anonymous'
    }),
    carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        crossOrigin: 'anonymous'
    }),
    geoq: L.tileLayer('http://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineCommunity/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; GeoQ',
        crossOrigin: 'anonymous'
    }),
    esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        crossOrigin: 'anonymous'
    }),
    'esri-dark': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        crossOrigin: 'anonymous'
    })
};

// Default layer
layers['esri-dark'].addTo(map);

// Initialize Screenshoter
const screenshoter = L.simpleMapScreenshoter({
    hidden: true, // hide screen shotted
    mimeType: 'image/png',
    hideElementsWithSelectors: ['#controls', '.leaflet-control-container'] 
}).addTo(map);

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const mapControls = document.getElementById('map-controls');
const yearSelect = document.getElementById('year-select');
const mapProviderSelect = document.getElementById('map-provider');
const downloadBtn = document.getElementById('download-map');
const dotSizeInput = document.getElementById('dot-size');
const dotSizeValue = document.getElementById('dot-size-value');
const colorModeRadios = document.getElementsByName('color-mode');
const singleColorPicker = document.getElementById('single-color-picker');
const multiColorList = document.getElementById('multi-color-list');
const globalColorInput = document.getElementById('global-color');

// New Elements
const centerUpload = document.getElementById('center-upload');
const controlsDiv = document.getElementById('controls');
const topButtons = document.getElementById('top-buttons');
const topDownloadBtn = document.getElementById('top-download-btn');
const restartBtn = document.getElementById('restart-btn');
const toggleControlsBtn = document.getElementById('toggle-controls');
const overlay = document.getElementById('overlay');
const loadingOverlay = document.getElementById('loading-overlay');

let currentLayerGroup = L.layerGroup().addTo(map);
let currentDotSize = 0.5;
let colorMode = 'single'; // 'multi' or 'single'
let customYearColors = {}; // year -> hex
let availableYears = [];
let autoMapFilename = null;
let colorDebounceTimer;

// Initial State
function setInitialState() {
    overlay.style.display = 'flex'; // Show overlay (contains upload box)
    controlsDiv.style.display = 'none';
    topButtons.style.display = 'none';
    currentLayerGroup.clearLayers();
    uploadStatus.textContent = '';
    fileInput.value = '';
}

// Call on load
setInitialState();

// Restart Button
restartBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to restart? This will clear the current map.')) {
        setInitialState();
    }
});

// Toggle Controls
toggleControlsBtn.addEventListener('click', () => {
    if (controlsDiv.style.display === 'none') {
        // Show controls
        controlsDiv.style.display = 'block';
        toggleControlsBtn.textContent = 'Hide Options';
        topDownloadBtn.style.display = 'none';
    } else {
        // Hide controls
        controlsDiv.style.display = 'none';
        toggleControlsBtn.textContent = 'Show Options';
        topDownloadBtn.style.display = 'inline-block';
    }
});

// Color Mode Change
colorModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        colorMode = e.target.value;
        updateColorUI();
        refreshMapColors();
    });
});

globalColorInput.addEventListener('change', () => {
    refreshMapColors();
});

function updateColorUI() {
    if (colorMode === 'single') {
        singleColorPicker.style.display = 'block';
        multiColorList.style.display = 'none';
    } else {
        singleColorPicker.style.display = 'none';
        multiColorList.style.display = 'block';
        renderMultiColorList();
    }
}

function renderMultiColorList() {
    multiColorList.innerHTML = '';
    availableYears.forEach(year => {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.marginBottom = '2px';
        
        const label = document.createElement('span');
        label.textContent = year + ': ';
        label.style.width = '50px';
        
        const input = document.createElement('input');
        input.type = 'color';
        input.value = getYearColor(year);
        input.style.border = 'none';
        input.style.padding = '0';
        input.style.height = '20px';
        
        input.addEventListener('change', (e) => {
            customYearColors[year] = e.target.value;
            refreshMapColors();
        });
        
        container.appendChild(label);
        container.appendChild(input);
        multiColorList.appendChild(container);
    });
}

function getYearColor(year) {
    if (colorMode === 'single') {
        return globalColorInput.value;
    }
    if (customYearColors[year]) {
        return customYearColors[year];
    }
    return getDefaultColorForYear(year);
}

function refreshMapColors() {
    currentLayerGroup.eachLayer(layer => {
        if (layer instanceof L.CircleMarker && layer.options.year) {
            const color = getYearColor(layer.options.year);
            layer.setStyle({
                fillColor: color,
                color: color
            });
        }
    });
}

// Map Provider Change
mapProviderSelect.addEventListener('change', (e) => {
    const provider = e.target.value;
    
    // Remove all layers
    Object.values(layers).forEach(layer => map.removeLayer(layer));
    
    // Add selected layer
    if (layers[provider]) {
        layers[provider].addTo(map);
    }
});

// Dot Size Slider
let debounceTimer;
dotSizeInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    dotSizeValue.textContent = val;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        currentDotSize = val;
        currentLayerGroup.eachLayer((layer) => {
            if (layer instanceof L.CircleMarker) {
                layer.setRadius(currentDotSize);
            }
        });
    }, 100); // 100ms debounce
});

// Drag and Drop
dropZone.addEventListener('click', () => fileInput.click());

// Allow dropping on the entire overlay
overlay.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

overlay.addEventListener('dragleave', (e) => {
    // Only remove if we are leaving the overlay (not entering a child)
    if (e.relatedTarget && !overlay.contains(e.relatedTarget) && e.relatedTarget !== overlay) {
        dropZone.classList.remove('dragover');
    }
});

overlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
    e.stopPropagation(); // Prevent bubbling to overlay
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    e.stopPropagation(); // Prevent bubbling to overlay
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        uploadStatus.textContent = 'Please upload a JSON file.';
        return;
    }

    uploadStatus.textContent = 'Uploading and processing... This may take a while.';
    
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            uploadStatus.textContent = 'Error: ' + data.error;
        } else {
            uploadStatus.textContent = 'Processing complete!';
            
            // Update UI State
            overlay.style.display = 'none';
            controlsDiv.style.display = 'block';
            topButtons.style.display = 'flex';
            topDownloadBtn.style.display = 'none'; // Hidden by default when controls are shown
            toggleControlsBtn.textContent = 'Hide Options';
            
            autoMapFilename = data.auto_map;
            populateYears(data.years);
            // Auto load all years
            yearSelect.value = 'all';
            loadAllYears();
        }
    })
    .catch(err => {
        uploadStatus.textContent = 'Error uploading file.';
        console.error(err);
    });
}

function populateYears(years) {
    yearSelect.innerHTML = '<option value="">Select a year</option>';
    
    // Add All Years option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Years';
    yearSelect.appendChild(allOption);

    availableYears = [];
    years.forEach(yearFile => {
        // Handle prefixed filenames (uuid_year.csv)
        const parts = yearFile.replace('.csv', '').split('_');
        const year = parts[parts.length - 1];
        
        availableYears.push(year);
        const option = document.createElement('option');
        option.value = yearFile;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
    
    updateColorUI();
}

yearSelect.addEventListener('change', (e) => {
    const filename = e.target.value;
    if (filename === 'all') {
        loadAllYears();
    } else if (filename) {
        loadYearData(filename);
    } else {
        currentLayerGroup.clearLayers();
    }
});

function loadAllYears() {
    uploadStatus.textContent = 'Loading all years...';
    currentLayerGroup.clearLayers();
    
    // Fetch list of years again to be safe, or we could pass it around.
    // Since we populated the dropdown, we know the files exist, but let's just fetch them.
    // We can iterate over the options in the select, skipping the first two (placeholder and 'all').
    
    const options = Array.from(yearSelect.options);
    const files = options.slice(2).map(opt => opt.value);
    
    const promises = files.map(filename => 
        fetch(`/data/${filename}`).then(res => res.text()).then(text => ({filename, text}))
    );
    
    Promise.all(promises)
        .then(results => {
            results.forEach(result => {
                plotData(result.text, result.filename, false);
            });
            uploadStatus.textContent = 'Loaded all years';
            
            // Fit bounds after all points are added
            if (currentLayerGroup.getLayers().length > 0) {
                 // Collect all latlngs to fit the map bounds
                 const latlngs = [];
                 currentLayerGroup.eachLayer(layer => {
                     if (layer.getLatLng) {
                         latlngs.push(layer.getLatLng());
                     }
                 });
                 
                 if (latlngs.length > 0) {
                     map.fitBounds(L.latLngBounds(latlngs));
                 }
                 
                 // Trigger Auto Save
                 if (autoMapFilename) {
                     setTimeout(() => {
                         autoSaveMap(autoMapFilename);
                     }, 2000); // Wait for render
                 }
            }
        })
        .catch(err => {
            console.error(err);
            uploadStatus.textContent = 'Error loading all years';
        });
}

function loadYearData(filename) {
    uploadStatus.textContent = `Loading data for ${filename}...`;
    
    fetch(`/data/${filename}`)
    .then(response => response.text())
    .then(csvText => {
        plotData(csvText, filename, true);
        uploadStatus.textContent = `Loaded ${filename}`;
    })
    .catch(err => console.error(err));
}

function plotData(csvText, filename, clear = true) {
    if (clear) {
        currentLayerGroup.clearLayers();
    }
    
    const lines = csvText.split('\n');
    // Skip header
    const dataLines = lines.slice(1);
    
    // Handle prefixed filenames (uuid_year.csv)
    const parts = filename.replace('.csv', '').split('_');
    const year = parts[parts.length - 1];

    const points = [];

    dataLines.forEach(line => {
        if (!line.trim()) return;
        
        // Date,Time,Longitude,Latitude,Accuracy
        const parts = line.split(',');
        if (parts.length >= 4) {
            const lat = parseFloat(parts[3]);
            const lng = parseFloat(parts[2]);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                points.push([lat, lng]);
                
                const color = getYearColor(year);
                
                L.circleMarker([lat, lng], {
                    radius: currentDotSize,
                    fillColor: color,
                    color: color,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                    year: year // Store year for updates
                }).addTo(currentLayerGroup);
            }
        }
    });
}

function getDefaultColorForYear(year) {
    // Simple hash to color
    // Removed white (#ffffff) from list
    const colors = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080', '#000000'];
    const index = parseInt(year) % colors.length;
    return colors[index];
}

function handleDownload() {
    uploadStatus.textContent = 'Taking screenshot...';
    
    // Hide UI elements for screenshot
    const topBar = document.getElementById('top-bar');
    const leafletControls = document.querySelector('.leaflet-control-container');
    const centerUpload = document.getElementById('center-upload');
    
    // Show loading overlay
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    if (topBar) topBar.style.display = 'none';
    if (controlsDiv) controlsDiv.style.display = 'none';
    if (centerUpload) centerUpload.style.display = 'none';
    if (leafletControls) leafletControls.style.display = 'none';

    // Use setTimeout to allow the UI to update (show loading overlay) before the heavy task
    setTimeout(() => {
        // Use Leaflet's screenshoter plugin which is faster and better for maps
        screenshoter.takeScreen('blob', {
            mimeType: 'image/png'
        }).then(blob => {
            const link = document.createElement('a');
            link.download = 'map.png';
            link.href = URL.createObjectURL(blob);
            link.click();
            
            // Restore UI
            if (topBar) topBar.style.display = 'flex';
            
            // Only restore controls if we are in "uploaded" state and they were visible
            if (topButtons.style.display !== 'none') {
                 if (toggleControlsBtn.textContent === 'Hide Options') {
                     controlsDiv.style.display = 'block';
                 }
            } else {
                 // Initial state
                 if (centerUpload) centerUpload.style.display = 'block';
            }
            
            if (leafletControls) leafletControls.style.display = 'block';
            uploadStatus.textContent = 'Map downloaded!';
            
            // Hide loading overlay
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }).catch(err => {
            console.error(err);
            uploadStatus.textContent = 'Screenshot failed.';
            // Restore UI (same logic)
            if (topBar) topBar.style.display = 'flex';
            if (topButtons.style.display !== 'none') {
                 if (toggleControlsBtn.textContent === 'Hide Options') {
                     controlsDiv.style.display = 'block';
                 }
            } else {
                 if (centerUpload) centerUpload.style.display = 'block';
            }
            if (leafletControls) leafletControls.style.display = 'block';
            
            // Hide loading overlay
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        });
    }, 100);
}

topDownloadBtn.addEventListener('click', handleDownload);
downloadBtn.addEventListener('click', handleDownload);

function autoSaveMap(filename) {
    uploadStatus.textContent = 'Auto-saving map...';
    
    // Hide UI elements for screenshot
    const topBar = document.getElementById('top-bar');
    const leafletControls = document.querySelector('.leaflet-control-container');
    const centerUpload = document.getElementById('center-upload');
    
    if (topBar) topBar.style.display = 'none';
    if (controlsDiv) controlsDiv.style.display = 'none';
    if (centerUpload) centerUpload.style.display = 'none';
    if (leafletControls) leafletControls.style.display = 'none';

    screenshoter.takeScreen('blob', {
        mimeType: 'image/png'
    }).then(blob => {
        // Upload to backend
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('filename', filename);
        
        fetch('/save_map', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            console.log('Auto-save result:', data);
            uploadStatus.textContent = 'Map auto-saved!';
        })
        .catch(err => {
            console.error('Auto-save error:', err);
            uploadStatus.textContent = 'Auto-save failed.';
        })
        .finally(() => {
            // Restore UI
            if (topBar) topBar.style.display = 'flex';
            if (topButtons.style.display !== 'none') {
                 if (toggleControlsBtn.textContent === 'Hide Options') {
                     controlsDiv.style.display = 'block';
                 }
            }
            if (leafletControls) leafletControls.style.display = 'block';
        });
        
    }).catch(err => {
        console.error(err);
        // Restore UI
        if (topBar) topBar.style.display = 'flex';
        if (topButtons.style.display !== 'none') {
             if (toggleControlsBtn.textContent === 'Hide Options') {
                 controlsDiv.style.display = 'block';
             }
        }
        if (leafletControls) leafletControls.style.display = 'block';
    });
}

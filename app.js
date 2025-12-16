// ===== STATE VARIABLES =====
let watchId = null;
let maxSpeed = 0;
let totalDistance = 0;
let startTime = null;
let prevLat = null;
let prevLon = null;
let currentSpeed = 0;
let wakeLock = null;
let lastTap = 0;
let isTracking = false;

// GPS Options
const gpsOptions = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0
};

// LocalStorage Key
const HISTORY_KEY = 'speedometer_history';

// ===== DOM ELEMENTS =====
const speedEl = document.getElementById('speed');
const maxSpeedEl = document.getElementById('maxSpeed');
const avgSpeedEl = document.getElementById('avgSpeed');
const distanceEl = document.getElementById('distance');
const timeEl = document.getElementById('time');
const statusMsgEl = document.getElementById('statusMsg');
const pocketOverlay = document.getElementById('pocketOverlay');
const pocketSpeedDisplay = document.getElementById('pocketSpeedDisplay');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const btnStartStop = document.getElementById('btnStartStop');
const gpsAccuracyEl = document.getElementById('gpsAccuracy');

// Timer interval reference
let timerInterval = null;

// Speed filter threshold (km/h) - speeds below this when accuracy is poor are ignored
const SPEED_THRESHOLD = 3;
const ACCURACY_GOOD = 10;  // meters
const ACCURACY_MEDIUM = 25; // meters

// ===== TRACKING FUNCTIONS =====
function toggleTracking() {
    if (isTracking) {
        stopTracking();
    } else {
        startTracking();
    }
}

function startTracking() {
    if (!navigator.geolocation) {
        statusMsgEl.innerText = "GPS tidak didukung di browser ini";
        return;
    }

    isTracking = true;
    startTime = new Date();
    watchId = navigator.geolocation.watchPosition(updatePosition, handleError, gpsOptions);
    timerInterval = setInterval(updateTimeAndAvg, 1000);
    requestWakeLock();

    // Update button
    btnStartStop.innerText = "⏹ Stop";
    btnStartStop.classList.remove('btn-start');
    btnStartStop.classList.add('btn-stop');
    statusMsgEl.innerText = "Menunggu sinyal GPS...";
}

function stopTracking() {
    isTracking = false;

    // Stop GPS watching
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    // Stop timer
    if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Prompt to save trip if there's meaningful data
    if (totalDistance > 0.01 || maxSpeed > 0) {
        if (confirm("Simpan perjalanan ini ke riwayat?")) {
            saveTripToHistory();
        }
    }

    // Update button
    btnStartStop.innerText = "▶ Start";
    btnStartStop.classList.remove('btn-stop');
    btnStartStop.classList.add('btn-start');
    statusMsgEl.innerText = "Tracking dihentikan";

    // Reset speed display (but keep stats visible)
    currentSpeed = 0;
    speedEl.innerText = "0";
    pocketSpeedDisplay.innerText = "0";
}

function updatePosition(position) {
    const accuracy = position.coords.accuracy; // in meters
    let speedMs = position.coords.speed;
    let rawSpeed = (speedMs && speedMs > 0) ? (speedMs * 3.6) : 0;

    // Update GPS accuracy indicator
    updateAccuracyIndicator(accuracy);

    // Filter out GPS drift: if accuracy is poor and speed is low, assume stationary
    if (accuracy > ACCURACY_MEDIUM && rawSpeed < SPEED_THRESHOLD) {
        currentSpeed = 0;
    } else if (accuracy > ACCURACY_GOOD && rawSpeed < SPEED_THRESHOLD / 2) {
        // Medium accuracy but very low speed - likely drift
        currentSpeed = 0;
    } else {
        currentSpeed = rawSpeed;
    }

    statusMsgEl.innerText = "GPS Aktif - Tracking...";

    // Update Main UI
    speedEl.innerText = Math.round(currentSpeed);
    // Update Pocket Mode UI
    pocketSpeedDisplay.innerText = Math.round(currentSpeed);

    if (currentSpeed > maxSpeed) {
        maxSpeed = currentSpeed;
        maxSpeedEl.innerText = Math.round(maxSpeed);
    }

    let currLat = position.coords.latitude;
    let currLon = position.coords.longitude;

    // Only calculate distance if accuracy is reasonable and moving
    if (prevLat != null && prevLon != null) {
        if (currentSpeed > SPEED_THRESHOLD && accuracy < ACCURACY_MEDIUM * 2) {
            let dist = calculateDistance(prevLat, prevLon, currLat, currLon);
            totalDistance += dist;
            distanceEl.innerText = totalDistance.toFixed(2);
        }
    }
    prevLat = currLat;
    prevLon = currLon;
}

function updateAccuracyIndicator(accuracy) {
    let label, className;

    if (accuracy <= ACCURACY_GOOD) {
        label = `📍 Akurasi: ±${Math.round(accuracy)}m (Bagus)`;
        className = 'good';
    } else if (accuracy <= ACCURACY_MEDIUM) {
        label = `📍 Akurasi: ±${Math.round(accuracy)}m (Sedang)`;
        className = 'medium';
    } else {
        label = `📍 Akurasi: ±${Math.round(accuracy)}m (Buruk)`;
        className = 'poor';
    }

    gpsAccuracyEl.innerText = label;
    gpsAccuracyEl.className = 'gps-accuracy ' + className;
}

function updateTimeAndAvg() {
    if (!startTime) return;
    let now = new Date();
    let diffMs = now - startTime;
    let diffHrs = diffMs / (1000 * 60 * 60);

    let seconds = Math.floor((diffMs / 1000) % 60);
    let minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    let hours = Math.floor((diffMs / (1000 * 60 * 60)));

    let timeString =
        (hours > 0 ? String(hours).padStart(2, '0') + ":" : "") +
        String(minutes).padStart(2, '0') + ":" +
        String(seconds).padStart(2, '0');

    timeEl.innerText = timeString;

    if (diffHrs > 0 && totalDistance > 0) {
        let avg = totalDistance / diffHrs;
        avgSpeedEl.innerText = Math.round(avg);
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function handleError(error) {
    statusMsgEl.innerText = "Error GPS: " + error.message;
}

// ===== RESET FUNCTION =====
function resetTrip() {
    // Don't save if no meaningful data
    if (totalDistance > 0.01 || maxSpeed > 0) {
        if (confirm("Simpan perjalanan ini ke riwayat sebelum reset?")) {
            saveTripToHistory();
        }
    }

    // Reset all values
    maxSpeed = 0;
    totalDistance = 0;
    currentSpeed = 0;
    startTime = new Date();
    prevLat = null;
    prevLon = null;

    // Reset UI
    speedEl.innerText = "0";
    maxSpeedEl.innerText = "0";
    avgSpeedEl.innerText = "0";
    distanceEl.innerText = "0.00";
    timeEl.innerText = "00:00";
}

// ===== WAKE LOCK =====
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
        console.log('Wake Lock API tidak didukung');
        return;
    }
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock Active');
        wakeLock.addEventListener('release', () => {
            console.log('Screen Wake Lock Released');
            requestWakeLock();
        });
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// ===== POCKET MODE =====
function enablePocketMode() {
    pocketOverlay.style.display = 'flex';
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch((e) => { });
    }
}

function disablePocketMode() {
    pocketOverlay.style.display = 'none';
    if (document.exitFullscreen) {
        document.exitFullscreen().catch((e) => { });
    }
}

// Double tap to exit pocket mode
pocketOverlay.addEventListener('click', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
        disablePocketMode();
        e.preventDefault();
    }
    lastTap = currentTime;
});

// ===== HISTORY MANAGEMENT =====
function saveTripToHistory() {
    const now = new Date();
    const trip = {
        id: Date.now(),
        date: now.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }),
        time: now.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        }),
        maxSpeed: Math.round(maxSpeed),
        avgSpeed: parseInt(avgSpeedEl.innerText) || 0,
        distance: parseFloat(distanceEl.innerText) || 0,
        duration: timeEl.innerText
    };

    const history = loadHistory();
    history.unshift(trip); // Add to beginning

    // Keep only last 50 trips
    if (history.length > 50) {
        history.pop();
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    console.log('Trip saved:', trip);
}

function loadHistory() {
    try {
        const data = localStorage.getItem(HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error loading history:', e);
        return [];
    }
}

function toggleHistoryPanel() {
    historyPanel.classList.toggle('active');
    if (historyPanel.classList.contains('active')) {
        renderHistory();
    }
}

function renderHistory() {
    const history = loadHistory();

    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">Belum ada riwayat perjalanan</div>';
        return;
    }

    historyList.innerHTML = history.map(trip => `
        <div class="history-item" data-id="${trip.id}">
            <div class="history-item-header">
                <span class="history-date">${trip.date} • ${trip.time}</span>
                <button class="history-delete" onclick="deleteHistoryItem(${trip.id})">Hapus</button>
            </div>
            <div class="history-stats">
                <div class="history-stat">
                    <div class="history-stat-value">${trip.maxSpeed} km/h</div>
                    <div class="history-stat-label">Max Speed</div>
                </div>
                <div class="history-stat">
                    <div class="history-stat-value">${trip.avgSpeed} km/h</div>
                    <div class="history-stat-label">Rata-rata</div>
                </div>
                <div class="history-stat">
                    <div class="history-stat-value">${trip.distance.toFixed(2)} km</div>
                    <div class="history-stat-label">Jarak</div>
                </div>
                <div class="history-stat">
                    <div class="history-stat-value">${trip.duration}</div>
                    <div class="history-stat-label">Durasi</div>
                </div>
            </div>
        </div>
    `).join('');
}

function deleteHistoryItem(id) {
    if (!confirm('Hapus riwayat ini?')) return;

    let history = loadHistory();
    history = history.filter(trip => trip.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
}

function clearAllHistory() {
    if (!confirm('Hapus semua riwayat perjalanan?')) return;

    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
}

// ===== INITIALIZE =====
// Tracking tidak otomatis dimulai - user harus klik tombol Start

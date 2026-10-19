// --- VALIDACIÓN DE SESIÓN ---
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) {
    window.location.href = 'login.html';
}

// --- ESTADO DE LA APLICACIÓN ---
const state = {
    theme: localStorage.getItem('app_theme') || 'light',
    currentView: 'ride',
    origin: { name: 'Ubicación actual', lat: 19.4326, lng: -99.1332 },
    destination: null,
    selectedVehicle: 'uberx',
    selectedPayment: { text: 'Visa •••• 4242', icon: 'fa-solid fa-credit-card' },
    tripState: 'idle',
    tripProgress: 0,
    history: [
        { id: 1, dest: 'Aeropuerto CDMX', date: 'Ayer, 18:30', price: '$180.00', status: 'Completado' }
    ],
    favorites: JSON.parse(localStorage.getItem('user_favorites') || '[]')
};

let map, originMarker, destMarker, driverMarker, routePolyline;
let tripInterval = null;
let searchTimeout = null;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    initUserInformation();
    initMap();
    getUserLocation();
    setupEventListeners();
    renderHistory();
    renderFavorites();
});

window.addEventListener('load', () => {
    if (map) map.invalidateSize();
});

function applyTheme(themeName) {
    state.theme = themeName;
    localStorage.setItem('app_theme', themeName);
    document.body.className = themeName + '-mode';

    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (themeIcon && themeText) {
        if (themeName === 'light') {
            themeIcon.className = 'fa-solid fa-moon';
            themeText.textContent = 'Modo Oscuro';
        } else {
            themeIcon.className = 'fa-solid fa-sun';
            themeText.textContent = 'Modo Claro';
        }
    }
}

function initUserInformation() {
    if (currentUser) {
        const name = currentUser.name || 'Usuario';
        const rating = currentUser.rating || '4.92';

        document.getElementById('display-user-name').textContent = name;
        document.getElementById('display-user-rating').textContent = rating;

        const mobileName = document.getElementById('mobile-user-name');
        const mobileRating = document.getElementById('mobile-user-rating');
        if (mobileName) mobileName.textContent = name;
        if (mobileRating) mobileRating.textContent = rating;
    }
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([state.origin.lat, state.origin.lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
        referrerPolicy: 'no-referrer-when-downgrade'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    updateOriginMarker();

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 400);

    window.addEventListener('resize', () => {
        if (map) map.invalidateSize();
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getUserLocation() {
    const originInput = document.getElementById('origin-input');
    originInput.value = 'Detectando ubicación...';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                state.origin.lat = latitude;
                state.origin.lng = longitude;
                map.setView([latitude, longitude], 16);
                updateOriginMarker();

                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                    const data = await res.json();
                    const locationName = data.display_name.split(',')[0] || 'Mi Ubicación Actual';
                    state.origin.name = locationName;
                    originInput.value = locationName;
                    showToast('Ubicación detectada con éxito');
                } catch (e) {
                    state.origin.name = 'Mi Ubicación Actual';
                    originInput.value = 'Mi Ubicación Actual';
                }
            },
            (error) => {
                console.warn('Geolocalización fallida:', error);
                originInput.value = state.origin.name;
                showToast('No se pudo obtener el GPS. Usando ubicación por defecto.', 'error');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        originInput.value = state.origin.name;
        showToast('Geolocalización no soportada en tu navegador', 'error');
    }
}

function updateOriginMarker() {
    if (originMarker) map.removeLayer(originMarker);
    const originIcon = L.divIcon({
        className: 'custom-marker',
        html: '<i class="fa-solid fa-circle"></i>',
        iconSize: [20, 20]
    });
    originMarker = L.marker([state.origin.lat, state.origin.lng], { icon: originIcon }).addTo(map);
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Cambio de Tema desde Modal Configuración
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
    });

    // Navegación Sidebar / Menú Inferior
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            if (target.id === 'mobile-profile-tab') {
                document.getElementById('mobile-account-modal').classList.remove('hidden');
            } else {
                switchView(target.dataset.view);
            }
        });
    });

    document.getElementById('close-account-modal').addEventListener('click', () => {
        document.getElementById('mobile-account-modal').classList.add('hidden');
    });

    document.getElementById('recenter-gps-btn').addEventListener('click', getUserLocation);

    // Menú Perfil Escritorio
    const profileBtn = document.getElementById('user-profile-btn');
    const dropdown = document.getElementById('user-dropdown');
    if (profileBtn && dropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', () => dropdown.classList.add('hidden'));
    }

    // Modal Configuración (Escritorio y Móvil)
    const openSettings = () => {
        document.getElementById('modal-user-name').textContent = currentUser.name;
        document.getElementById('modal-user-email').textContent = currentUser.email;
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('mobile-account-modal').classList.add('hidden');
    };

    document.getElementById('btn-settings-desktop').addEventListener('click', openSettings);
    document.getElementById('open-settings-btn').addEventListener('click', openSettings);
    document.getElementById('close-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.add('hidden');
    });

    // Logout (Escritorio y Móvil)
    const logout = () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    };
    document.getElementById('btn-logout-desktop').addEventListener('click', logout);
    document.getElementById('btn-logout-mobile').addEventListener('click', logout);

    // Modal Pagos
    const paymentModal = document.getElementById('payment-modal');
    document.getElementById('open-payment-modal').addEventListener('click', () => paymentModal.classList.remove('hidden'));
    document.getElementById('close-payment').addEventListener('click', () => paymentModal.classList.add('hidden'));

    document.querySelectorAll('.payment-option-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const el = e.currentTarget;
            state.selectedPayment = { text: el.dataset.text, icon: el.dataset.icon };
            document.getElementById('selected-payment-text').textContent = state.selectedPayment.text;
            document.getElementById('selected-payment-icon').className = state.selectedPayment.icon;
            paymentModal.classList.add('hidden');
            showToast(`Método de pago cambiado a ${state.selectedPayment.text}`);
        });
    });

    // Guardar en Favoritos
    document.getElementById('save-favorite-btn').addEventListener('click', () => {
        if (!state.destination) return;
        if (!state.favorites.some(f => f.name === state.destination.name)) {
            state.favorites.push(state.destination);
            localStorage.setItem('user_favorites', JSON.stringify(state.favorites));
            renderFavorites();
            showToast('Destino guardado en favoritos');
        }
    });

    // Búsqueda en Inputs
    document.getElementById('origin-input').addEventListener('input', (e) => handleSearchInput(e.target.value, 'origin'));
    document.getElementById('destination-input').addEventListener('input', (e) => handleSearchInput(e.target.value, 'destination'));

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) {
            document.getElementById('origin-results').classList.add('hidden');
            document.getElementById('destination-results').classList.add('hidden');
        }
    });

    document.getElementById('clear-dest').addEventListener('click', resetDestination);

    document.querySelectorAll('.vehicle-card').forEach(card => {
        card.addEventListener('click', (e) => {
            document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            state.selectedVehicle = e.currentTarget.dataset.type;
            const btn = document.getElementById('request-ride-btn');
            btn.textContent = `Confirmar ${e.currentTarget.querySelector('.vehicle-title span').textContent}`;
        });
    });

    document.getElementById('request-ride-btn').addEventListener('click', startSearchTrip);
    document.getElementById('cancel-ride-btn').addEventListener('click', cancelTrip);
    document.getElementById('cancel-active-btn').addEventListener('click', cancelTrip);
    document.getElementById('finish-trip-btn').addEventListener('click', completeTripProcess);
}

// --- FAVORITOS Y RECIENTES ---
function renderFavorites() {
    const listContainer = document.getElementById('favorites-list');
    if (!listContainer) return;

    if (state.favorites.length === 0) {
        listContainer.innerHTML = `<span style="font-size: 12px; color: var(--text-secondary);">No hay destinos guardados</span>`;
        return;
    }

    listContainer.innerHTML = state.favorites.map(fav => `
        <div class="favorite-item" data-lat="${fav.lat}" data-lng="${fav.lng}" data-name="${fav.name}">
            <i class="fa-solid fa-star" style="color: var(--star-color);"></i>
            <span>${fav.name}</span>
        </div>
    `).join('');

    listContainer.querySelectorAll('.favorite-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const el = e.currentTarget;
            setDestination({
                name: el.dataset.name,
                lat: parseFloat(el.dataset.lat),
                lng: parseFloat(el.dataset.lng)
            });
        });
    });
}

// --- BÚSQUEDA Y GEOCODIFICACIÓN ---
function handleSearchInput(query, type) {
    clearTimeout(searchTimeout);
    const containerId = type === 'origin' ? 'origin-results' : 'destination-results';
    const container = document.getElementById(containerId);

    if (!query || query.trim().length < 3) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    searchTimeout = setTimeout(() => searchLocation(query, type), 400);
}

async function searchLocation(query, type) {
    const containerId = type === 'origin' ? 'origin-results' : 'destination-results';
    const container = document.getElementById(containerId);

    try {
        const lat = state.origin.lat;
        const lng = state.origin.lng;
        const delta = 0.25;
        const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
        const cleanQuery = query.trim();

        let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=5&viewbox=${viewbox}`;
        let response = await fetch(url);
        let data = await response.json();

        if (data.length === 0) {
            const simplifiedQuery = cleanQuery.replace(/#/g, '').replace(/no\.|num\.|n°/gi, '');
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(simplifiedQuery)}&limit=5&viewbox=${viewbox}`;
            response = await fetch(url);
            data = await response.json();
        }

        container.innerHTML = '';
        if (data.length === 0) {
            container.innerHTML = `<div class="search-result-item"><span>Sin resultados encontrados</span></div>`;
        } else {
            data.forEach(place => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                const parts = place.display_name.split(',');
                item.innerHTML = `<i class="fa-solid fa-location-dot"></i> <div><strong>${parts.slice(0, 2).join(', ')}</strong><br><span style="font-size:11px;color:var(--text-secondary);">${parts.slice(2, 4).join(', ')}</span></div>`;
                item.addEventListener('click', () => {
                    selectLocation(place, type);
                    container.classList.add('hidden');
                });
                container.appendChild(item);
            });
        }
        container.classList.remove('hidden');
    } catch (error) {
        console.error('Error al buscar:', error);
    }
}

function selectLocation(place, type) {
    const coords = {
        name: place.display_name.split(',')[0],
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon)
    };

    if (type === 'origin') {
        state.origin = coords;
        document.getElementById('origin-input').value = coords.name;
        updateOriginMarker();
        if (state.destination) drawRoute();
        else map.setView([coords.lat, coords.lng], 15);
    } else {
        setDestination(coords);
    }
}

// --- VISTAS Y DESTINOS ---
function switchView(viewName) {
    state.currentView = viewName;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    document.getElementById('view-ride').classList.toggle('hidden', viewName !== 'ride');
    document.getElementById('view-history').classList.toggle('hidden', viewName !== 'history');

    if (viewName === 'ride' && map) {
        setTimeout(() => map.invalidateSize(), 300);
    }
}

function setDestination(dest) {
    state.destination = dest;
    document.getElementById('destination-input').value = dest.name;
    document.getElementById('clear-dest').classList.remove('hidden');
    document.getElementById('ride-options').classList.remove('hidden');
    document.getElementById('save-favorite-btn').classList.remove('hidden');

    const distanceKm = calculateDistance(state.origin.lat, state.origin.lng, dest.lat, dest.lng);
    updatePricesAndEtas(distanceKm);
    drawRoute();
}

function resetDestination() {
    state.destination = null;
    document.getElementById('destination-input').value = '';
    document.getElementById('clear-dest').classList.add('hidden');
    document.getElementById('ride-options').classList.add('hidden');
    document.getElementById('save-favorite-btn').classList.add('hidden');

    if (destMarker) map.removeLayer(destMarker);
    if (routePolyline) map.removeLayer(routePolyline);
    map.setView([state.origin.lat, state.origin.lng], 15);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function updatePricesAndEtas(distance) {
    const baseFare = 30;
    const pricePerKm = 12;

    document.querySelectorAll('.vehicle-card').forEach(card => {
        const mult = parseFloat(card.dataset.priceMult);
        const total = (baseFare + (distance * pricePerKm)) * mult;
        const type = card.dataset.type;
        document.getElementById(`price-${type}`).textContent = `$${total.toFixed(2)}`;
        
        const etaMinutes = Math.max(2, Math.round(distance * 2.5));
        document.getElementById(`eta-${type}`).textContent = `${etaMinutes} min de espera`;
    });
}

function drawRoute() {
    if (destMarker) map.removeLayer(destMarker);
    if (routePolyline) map.removeLayer(routePolyline);

    const destIcon = L.divIcon({
        className: 'custom-marker',
        html: '<i class="fa-solid fa-square"></i>',
        iconSize: [20, 20]
    });
    destMarker = L.marker([state.destination.lat, state.destination.lng], { icon: destIcon }).addTo(map);

    const points = [
        [state.origin.lat, state.origin.lng],
        [state.destination.lat, state.destination.lng]
    ];
    routePolyline = L.polyline(points, { color: '#000000', weight: 4, opacity: 0.8 }).addTo(map);
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    setTimeout(() => map.invalidateSize(), 200);
}

// --- FLUJO DEL VIAJE ---
function startSearchTrip() {
    showStatusCard('searching');
    showToast('Buscando conductor cercano...');
    setTimeout(() => {
        if (state.tripState === 'searching') startTripSimulation();
    }, 3000);
}

function startTripSimulation() {
    state.tripState = 'in_progress';
    showStatusCard('active');
    showToast('¡Conductor asignado! En camino a recogerte.');

    const carIcon = L.divIcon({
        className: 'custom-marker car-marker',
        html: '<i class="fa-solid fa-car" id="car-icon-el"></i>',
        iconSize: [24, 24]
    });

    driverMarker = L.marker([state.origin.lat, state.origin.lng], { icon: carIcon }).addTo(map);

    let progress = 0;
    const steps = 100;
    let prevLat = state.origin.lat;
    let prevLng = state.origin.lng;

    tripInterval = setInterval(() => {
        progress += 1;
        state.tripProgress = progress;

        document.getElementById('progress-fill').style.width = `${progress}%`;
        
        const remainingMinutes = Math.max(1, Math.round((100 - progress) / 10));
        document.getElementById('trip-eta').textContent = `Llegada estimada: ${remainingMinutes} min`;

        const currentLat = state.origin.lat + (state.destination.lat - state.origin.lat) * (progress / steps);
        const currentLng = state.origin.lng + (state.destination.lng - state.origin.lng) * (progress / steps);

        const angle = Math.atan2(currentLng - prevLng, currentLat - prevLat) * (180 / Math.PI);
        const carEl = document.getElementById('car-icon-el');
        if (carEl) {
            carEl.style.transform = `rotate(${angle}deg)`;
        }

        prevLat = currentLat;
        prevLng = currentLng;

        driverMarker.setLatLng([currentLat, currentLng]);
        map.panTo([currentLat, currentLng]);

        if (progress >= steps) {
            clearInterval(tripInterval);
            finishTrip();
        }
    }, 120);
}

function finishTrip() {
    state.tripState = 'rating';
    showStatusCard('rating');
    showToast('Has llegado a tu destino');
}

function completeTripProcess() {
    const selectedCard = document.querySelector('.vehicle-card.selected');
    const priceText = selectedCard.querySelector('.price').textContent;

    state.history.unshift({
        id: Date.now(),
        dest: state.destination.name,
        date: 'Hoy, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: priceText,
        status: 'Completado'
    });

    renderHistory();
    resetTripState();
    showToast('¡Gracias por tu viaje!');
}

function cancelTrip() {
    if (tripInterval) clearInterval(tripInterval);
    resetTripState();
    showToast('Viaje cancelado', 'error');
}

function resetTripState() {
    state.tripState = 'idle';
    if (driverMarker) map.removeLayer(driverMarker);
    document.getElementById('status-card').classList.add('hidden');
    resetDestination();
}

function showStatusCard(stateName) {
    state.tripState = stateName;
    document.getElementById('status-card').classList.remove('hidden');
    document.getElementById('status-searching').classList.toggle('hidden', stateName !== 'searching');
    document.getElementById('status-active').classList.toggle('hidden', stateName !== 'active');
    document.getElementById('status-rating').classList.toggle('hidden', stateName !== 'rating');
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;

    if (state.history.length === 0) {
        container.innerHTML = '<p style="font-size: 14px; color: var(--text-secondary);">No hay viajes registrados aún.</p>';
        return;
    }

    container.innerHTML = state.history.map(item => `
        <div class="history-item">
            <div>
                <strong>${item.dest}</strong>
                <div style="font-size: 12px; color: var(--text-secondary);">${item.date} • ${item.status}</div>
            </div>
            <div style="font-weight: 700;">${item.price}</div>
        </div>
    `).join('');
}
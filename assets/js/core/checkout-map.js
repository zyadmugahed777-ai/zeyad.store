/**
 * Zeyad For Business - Interactive Checkout Map & Geocoding Component
 * Standard OpenStreetMap / CartoDB provider, robust GPS with Arabic toasts,
 * Canonical Location State, and Bidirectional Form Sync.
 */

(function () {
  'use strict';

  class ZFBCheckoutMap {
    constructor(containerId = 'zfb-checkout-map-container', options = {}) {
      this.containerId = containerId;
      this.container = document.getElementById(containerId);
      this.options = Object.assign({
        defaultLat: 15.369445,
        defaultLng: 44.191006,
        defaultZoom: 13,
        onLocationSelected: null
      }, options);

      this.map = null;
      this.marker = null;
      this.currentLat = this.options.defaultLat;
      this.currentLng = this.options.defaultLng;
      this.searchDebounceTimer = null;
      this._toastTimer = null;
      this._fallbackApplied = false;

      if (this.container) {
        this.init();
      }
    }

    async init() {
      // 1. Ensure Leaflet assets are loaded
      await this.ensureLeafletLoaded();

      // 2. Render Map UI Shell inside container
      this.renderMapShell();

      // 3. Initialize Leaflet Map instance
      this.initLeaflet();

      // 4. Bind Search and Geolocation Events
      this.bindEvents();

      // 5. Initial reverse geocode for default point
      this.resolveLocation(this.currentLat, this.currentLng, false);
    }

    ensureLeafletLoaded() {
      return new Promise((resolve) => {
        if (window.L) {
          return resolve();
        }

        // Load Leaflet CSS
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        // Load Leaflet JS with CDN fallback
        if (!document.getElementById('leaflet-js')) {
          const script = document.createElement('script');
          script.id = 'leaflet-js';
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => resolve();
          script.onerror = () => {
            console.warn('[ZFB Map] Leaflet unpkg failed, trying cdnjs...');
            const fallbackScript = document.createElement('script');
            fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
            fallbackScript.onload = () => resolve();
            fallbackScript.onerror = () => resolve();
            document.head.appendChild(fallbackScript);
          };
          document.head.appendChild(script);
        } else {
          resolve();
        }
      });
    }

    renderMapShell() {
      this.container.innerHTML = `
        <div class="zfb-map-wrapper">
          <div class="zfb-map-header">
            <div class="zfb-map-search-row">
              <div class="zfb-map-search-field">
                <span class="zfb-map-search-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                </span>
                <input type="text" class="zfb-map-search-input" id="zfb-map-search-input" 
                       placeholder="ابحث عن منطقتك (مثال: السائلة، حدة، المنصورة، شارع تعز)..." autocomplete="off" dir="rtl">
                <div class="zfb-map-suggestions" id="zfb-map-suggestions"></div>
              </div>
              <button type="button" class="zfb-map-locate-btn" id="zfb-map-locate-btn" title="تحديد موقعي عبر GPS">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                <span>موقعي الحالي</span>
              </button>
            </div>
          </div>
          <div class="zfb-map-canvas" id="zfb-leaflet-canvas"></div>
          <div class="zfb-map-footer">
            <div class="zfb-map-selected-info">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--primary-gold, #c79a52)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span id="zfb-map-address-display" style="font-weight: 500;">جاري تحديد الموقع...</span>
            </div>
            <div class="zfb-map-coord-pill" id="zfb-map-coord-display">${this.currentLat.toFixed(4)}, ${this.currentLng.toFixed(4)}</div>
          </div>
        </div>
      `;
    }

    initLeaflet() {
      if (!window.L) return;

      const mapEl = document.getElementById('zfb-leaflet-canvas');
      if (!mapEl) return;

      // Initialize global map without artificial country bounding box restrictions
      this.map = L.map(mapEl, {
        center: [this.currentLat, this.currentLng],
        zoom: this.options.defaultZoom,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true
      });

      // High-speed Arabic road tiles provider with automatic OSM fallback
      const primaryTiles = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
      });

      // Controlled Fallback Provider: OpenStreetMap / CartoDB if primary tile encounters an issue
      primaryTiles.on('tileerror', () => {
        if (!this._fallbackApplied && this.map) {
          this._fallbackApplied = true;
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          }).addTo(this.map);
        }
      });

      primaryTiles.addTo(this.map);

      // Custom Luxury Gold Pin Marker
      const goldPinIcon = L.divIcon({
        className: 'zfb-custom-pin-wrapper',
        html: `
          <div class="zfb-luxury-pin">
            <svg viewBox="0 0 24 24" width="34" height="42" fill="#c79a52" stroke="#ffffff" stroke-width="1.2">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `,
        iconSize: [34, 42],
        iconAnchor: [17, 42]
      });

      this.marker = L.marker([this.currentLat, this.currentLng], {
        draggable: true,
        icon: goldPinIcon
      }).addTo(this.map);

      // Listen to Marker Drag (Manual Pinning)
      this.marker.on('dragend', (e) => {
        const position = e.target.getLatLng();
        this.setLocation(position.lat, position.lng, true);
      });

      // Listen to Map Click to move pin (Manual Pinning)
      this.map.on('click', (e) => {
        this.setLocation(e.latlng.lat, e.latlng.lng, true);
      });

      // Efficient size invalidation on render and viewport resize
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 150);

      window.addEventListener('resize', () => {
        if (this.map) this.map.invalidateSize();
      });
      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          if (this.map) this.map.invalidateSize();
        }, 150);
      });
    }

    bindEvents() {
      const searchInput = document.getElementById('zfb-map-search-input');
      const suggestionsBox = document.getElementById('zfb-map-suggestions');
      const locateBtn = document.getElementById('zfb-map-locate-btn');

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          clearTimeout(this.searchDebounceTimer);
          if (val.length < 1) {
            suggestionsBox.classList.remove('active');
            suggestionsBox.innerHTML = '';
            return;
          }

          this.searchDebounceTimer = setTimeout(() => {
            this.searchLocations(val);
          }, 150);
        });

        // Handle Enter key for instant location selection
        searchInput.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = searchInput.value.trim();
            if (!val) return;

            const firstSuggestion = suggestionsBox.querySelector('.zfb-map-suggestion-item');
            if (firstSuggestion && suggestionsBox.classList.contains('active')) {
              firstSuggestion.click();
              return;
            }

            try {
              const res = await fetch(`/api/geocoding/search?q=${encodeURIComponent(val)}`);
              const json = await res.json();
              if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                const top = json.data[0];
                const lat = top.latitude;
                const lng = top.longitude;
                suggestionsBox.classList.remove('active');
                searchInput.value = top.formatted_address || top.name;
                if (this.map && !isNaN(lat) && !isNaN(lng)) {
                  this.map.setView([lat, lng], 15);
                  this.map.invalidateSize();
                }
                this.setLocation(lat, lng, false, {
                  city: top.city,
                  province: top.province,
                  district: top.district,
                  formatted_address: top.formatted_address || top.name
                });
              }
            } catch (_) {}
          }
        });

        // Hide suggestions on click outside
        document.addEventListener('click', (e) => {
          if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.remove('active');
          }
        });
      }

      if (locateBtn) {
        locateBtn.addEventListener('click', () => {
          this.locateUser();
        });
      }
    }

    async searchLocations(query) {
      const suggestionsBox = document.getElementById('zfb-map-suggestions');
      if (!suggestionsBox) return;

      try {
        const res = await fetch(`/api/geocoding/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          suggestionsBox.innerHTML = json.data.map(item => `
            <div class="zfb-map-suggestion-item" data-lat="${item.latitude}" data-lng="${item.longitude}" data-address="${item.formatted_address || item.name}" data-city="${item.city || ''}" data-province="${item.province || ''}" data-district="${item.district || ''}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span>${item.formatted_address || item.name}</span>
            </div>
          `).join('');

          suggestionsBox.classList.add('active');

          // Bind item clicks
          suggestionsBox.querySelectorAll('.zfb-map-suggestion-item').forEach(el => {
            const selectItem = () => {
              const lat = parseFloat(el.getAttribute('data-lat'));
              const lng = parseFloat(el.getAttribute('data-lng'));
              const city = el.getAttribute('data-city');
              const province = el.getAttribute('data-province');
              const district = el.getAttribute('data-district');
              const addr = el.getAttribute('data-address');

              suggestionsBox.classList.remove('active');
              const input = document.getElementById('zfb-map-search-input');
              if (input) input.value = addr;

              if (this.map && !isNaN(lat) && !isNaN(lng)) {
                this.map.setView([lat, lng], 15);
                this.map.invalidateSize();
              }
              this.setLocation(lat, lng, false, { city, province, district, formatted_address: addr });
            };

            el.addEventListener('click', selectItem);
            el.addEventListener('pointerdown', selectItem);
          });
        } else {
          suggestionsBox.classList.remove('active');
        }
      } catch (err) {
        console.warn('[ZFB Map] Search failed:', err);
      }
    }

    locateUser() {
      const locateBtn = document.getElementById('zfb-map-locate-btn');
      if (!navigator.geolocation) {
        this.showToast('خدمة تحديد الموقع غير مدعومة في متصفحك. يرجى النقر على الخريطة لتحديد موقعك.', 'warning');
        return;
      }

      if (locateBtn) {
        locateBtn.disabled = true;
        locateBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"></circle></svg>
          <span>جاري التحديد...</span>
        `;
      }

      const resetBtn = () => {
        if (locateBtn) {
          locateBtn.disabled = false;
          locateBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
            <span>موقعي الحالي</span>
          `;
        }
      };

      const onLocationSuccess = (pos) => {
        resetBtn();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (this.map) {
          this.map.flyTo([lat, lng], 16, { duration: 1.2 });
        }
        this.setLocation(lat, lng, false);
        this.showToast('تم تحديد موقعك الحالي بنجاح عبر GPS', 'success');
      };

      const onLocationError = (err) => {
        resetBtn();
        let message = 'تعذر الوصول إلى موقعك الحالي.';
        if (err.code === 1 /* PERMISSION_DENIED */) {
          message = 'اسمح للمتصفح بالوصول إلى موقعك لتحديد عنوان التوصيل، أو يمكنك النقر على الخريطة مباشرة.';
        } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
          message = 'إشارة الموقع الجغرافي غير متوفرة حالياً. يمكنك تحديد موقعك بالنقر على الخريطة أو البحث باسم منطقتك.';
        } else if (err.code === 3 /* TIMEOUT */) {
          message = 'استغرق تحديد الموقع وقتاً طويلاً. يرجى النقر على موقعك على الخريطة مباشرة أو البحث.';
        }
        this.showToast(message, 'warning');
      };

      navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        onLocationError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }

    showToast(message, type = 'info') {
      if (!this.container) return;
      const wrapper = this.container.querySelector('.zfb-map-wrapper');
      if (!wrapper) return;

      let toast = wrapper.querySelector('.zfb-map-toast');
      if (!toast) {
        toast = document.createElement('div');
        const footer = wrapper.querySelector('.zfb-map-footer');
        if (footer) footer.before(toast);
        else wrapper.appendChild(toast);
      }
      toast.className = `zfb-map-toast ${type}`;
      toast.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          ${type === 'success' ? '<path d="M20 6L9 17l-5-5"></path>' : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}
        </svg>
        <span>${message}</span>
      `;
      toast.style.display = 'flex';

      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        if (toast) toast.style.display = 'none';
      }, 6000);
    }

    setLocation(lat, lng, pan = true, presetDetails = null) {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;

      this.currentLat = lat;
      this.currentLng = lng;

      if (this.marker) {
        this.marker.setLatLng([lat, lng]);
      }
      if (this.map && pan) {
        this.map.panTo([lat, lng]);
      }

      const coordEl = document.getElementById('zfb-map-coord-display');
      if (coordEl) {
        coordEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      if (presetDetails) {
        this.applyLocationDetails(presetDetails, lat, lng);
      } else {
        this.resolveLocation(lat, lng, true);
      }
    }

    async resolveLocation(lat, lng, triggerCallback = true) {
      const addrEl = document.getElementById('zfb-map-address-display');
      if (addrEl) addrEl.textContent = 'جاري التحقق من تفاصيل العنوان...';

      try {
        const res = await fetch(`/api/geocoding/reverse?lat=${lat}&lng=${lng}`);
        const json = await res.json();
        if (json.success && json.data) {
          this.applyLocationDetails(json.data, lat, lng, triggerCallback);
        } else {
          this.fallbackLocationDetails(lat, lng, triggerCallback);
        }
      } catch (err) {
        this.fallbackLocationDetails(lat, lng, triggerCallback);
      }
    }

    applyLocationDetails(details, lat, lng, triggerCallback = true) {
      const addrEl = document.getElementById('zfb-map-address-display');
      if (addrEl) {
        addrEl.textContent = details.formatted_address || `${details.city || 'صنعاء'} - ${details.district || ''}`;
      }

      // Maintain Single Canonical Frontend Location State
      window.ZFB_CHECKOUT_LOCATION = {
        latitude: lat,
        longitude: lng,
        country: details.country || 'اليمن',
        province: details.province || 'صنعاء',
        city: details.city || 'صنعاء',
        district: details.district || '',
        street: details.street || '',
        formatted_address: details.formatted_address || '',
        address_line: details.street || details.address_line || ''
      };

      // Sync with hidden and visible checkout form fields
      const latInput = document.getElementById('address-latitude');
      const lngInput = document.getElementById('address-longitude');
      const provInput = document.getElementById('province');
      const formattedInput = document.getElementById('formatted-address');
      const citySelect = document.getElementById('city');
      const districtInput = document.getElementById('district');
      const addressDetailInput = document.getElementById('address-detail');

      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;
      if (provInput) provInput.value = details.province || details.city || 'صنعاء';
      if (formattedInput) formattedInput.value = details.formatted_address || '';

      if (citySelect && (details.city || details.province)) {
        const targetCity = details.city || details.province;
        for (let i = 0; i < citySelect.options.length; i++) {
          const optText = citySelect.options[i].text;
          const optVal = citySelect.options[i].value;
          if (optVal === targetCity || optText === targetCity || targetCity.includes(optText) || optText.includes(targetCity)) {
            citySelect.selectedIndex = i;
            break;
          }
        }
      }

      if (districtInput && details.district && !districtInput.value) {
        districtInput.value = details.district;
      }
      if (addressDetailInput && details.street && !addressDetailInput.value) {
        addressDetailInput.value = details.street;
      }

      // Dispatch global location event
      window.dispatchEvent(new CustomEvent('zfb-location-change', {
        detail: window.ZFB_CHECKOUT_LOCATION
      }));

      if (triggerCallback && typeof this.options.onLocationSelected === 'function') {
        this.options.onLocationSelected(window.ZFB_CHECKOUT_LOCATION);
      }
    }

    fallbackLocationDetails(lat, lng, triggerCallback = true) {
      const isSanaa = (lat >= 15.15 && lat <= 15.55 && lng >= 44.05 && lng <= 44.38);
      const details = {
        country: 'اليمن',
        province: isSanaa ? 'صنعاء' : 'المحافظات',
        city: isSanaa ? 'صنعاء' : 'خارج صنعاء',
        district: '',
        formatted_address: isSanaa ? 'صنعاء، اليمن' : 'المحافظات، اليمن'
      };
      this.applyLocationDetails(details, lat, lng, triggerCallback);
    }
  }

  window.ZFBCheckoutMap = ZFBCheckoutMap;
})();

/* Mapa Leaflet + mosaico histórico RainViewer. Sem nowcast fictício e sem scraping do IPMet. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const core = window.ClimaRadarMapCore;
  const state = {
    map: null, marker: null, overlay: null, meta: null,
    place: { name: 'São Joaquim da Barra', latitude: -20.581, longitude: -47.859 },
    initiated: false, initializing: null, request: 0, pendingFrame: null, frameTimer: null,
    lastMetadataAt: 0, lastFrameIndex: -1
  };
  const status = value => { const node = $('#radarStatus'); if (node) node.textContent = value; };
  const timeLabel = unix => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(unix * 1000));

  function ensureLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (state.loadingLibrary) return state.loadingLibrary;
    state.loadingLibrary = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
      css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      js.crossOrigin = 'anonymous';
      js.onload = () => window.L ? resolve(window.L) : reject(new Error('Biblioteca de mapas não inicializou.'));
      js.onerror = () => reject(new Error('Não foi possível carregar os componentes do mapa.'));
      document.head.appendChild(js);
    }).catch(error => { state.loadingLibrary = null; throw error; });
    return state.loadingLibrary;
  }

  async function loadMetadata(force = false) {
    if (!force && state.meta && Date.now() - state.lastMetadataAt < 600000) return state.meta;
    const response = await fetch(core.METADATA_ENDPOINT, { cache: 'default' });
    if (!response.ok) throw new Error(`O servidor de radar respondeu ${response.status}.`);
    const meta = core.parseMetadata(await response.json());
    state.meta = meta;
    state.lastMetadataAt = Date.now();
    return meta;
  }

  function setFrame(index) {
    if (!state.map || !state.meta) return;
    const frames = state.meta.frames;
    const i = Math.max(0, Math.min(index, frames.length - 1));
    const f = frames[i];
    if (i === state.lastFrameIndex && state.overlay) return;
    const L = window.L;
    const url = core.tileTemplate(state.meta, f);
    const layer = L.tileLayer(url, {
      opacity: 0.76,
      tileSize: 256,
      maxNativeZoom: 7,
      maxZoom: 11,
      updateWhenIdle: true,
      keepBuffer: 0,
      attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by RainViewer</a>'
    });
    const old = state.overlay;
    state.overlay = layer;
    state.lastFrameIndex = i;
    layer.on('load', () => { if (old && state.map.hasLayer(old)) state.map.removeLayer(old); });
    layer.on('tileerror', () => status('Alguns mosaicos do radar não estão disponíveis para esta área. Confira o radar IPMet pelo link ao lado.'));
    layer.addTo(state.map);
    // Remova a camada antiga após breve espera também quando não há mosaicos.
    if (old) setTimeout(() => { if (state.map && state.map.hasLayer(old)) state.map.removeLayer(old); }, 2500);
    const clock = timeLabel(f.time);
    $('#radarFrameTime').textContent = clock;
    $('#radarObservedAt').textContent = `Quadro ${clock} · Brasília`;
    const minutes = core.ageMinutes(f.time);
    const freshness = minutes > 40 ? ` Último quadro com cerca de ${minutes} minutos de atraso.` : '';
    status(`Quadro observado às ${clock} (horário de Brasília).${freshness} Imagem de radar: a ausência de cor não garante ausência de chuva.`);
    $('#radarFrameRange').value = String(i);
  }

  function queueFrame(index) {
    if (state.frameTimer) clearTimeout(state.frameTimer);
    state.pendingFrame = index;
    // Evita dezenas de downloads de tiles ao arrastar o controle.
    state.frameTimer = setTimeout(() => {
      state.frameTimer = null;
      setFrame(state.pendingFrame);
    }, 750);
  }

  async function refresh(force = false) {
    const token = ++state.request;
    status('Consultando o histórico de radar…');
    $('#radarRefresh').disabled = true;
    try {
      const meta = await loadMetadata(force);
      if (token !== state.request) return;
      const range = $('#radarFrameRange');
      range.min = '0';
      range.max = String(meta.frames.length - 1);
      range.disabled = meta.frames.length < 2;
      state.lastFrameIndex = -1;
      setFrame(meta.frames.length - 1);
    } catch (error) {
      if (token === state.request) {
        status(`${error.message || 'Dados de radar indisponíveis.'} O mapa base e o acesso ao IPMet continuam disponíveis.`);
        $('#radarObservedAt').textContent = 'Radar indisponível';
        if (state.overlay && state.map) state.map.removeLayer(state.overlay);
        state.overlay = null;
      }
    } finally { $('#radarRefresh').disabled = false; }
  }

  function changePlace(place) {
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return;
    state.place = place;
    $('#radarCityName').textContent = place.name || 'Local selecionado';
    if (state.map) {
      const pos = [place.latitude, place.longitude];
      state.marker.setLatLng(pos);
      state.map.setView(pos, Math.max(6, state.map.getZoom()), { animate: true });
    }
  }

  async function init() {
    if (state.initialized) return;
    if (state.initializing) return state.initializing;
    state.initializing = (async () => {
      status('Carregando mapa meteorológico…');
      try {
        const L = await ensureLeaflet();
        const p = window.ClimaRadarCurrentPlace || state.place;
        changePlace(p);
        state.map = L.map('radarMap', {
          zoomControl: false, scrollWheelZoom: false, maxZoom: 11, minZoom: 3,
          preferCanvas: true, worldCopyJump: false, zoomSnap: 1
        }).setView([state.place.latitude, state.place.longitude], 6);
        L.control.zoom({ position: 'topright' }).addTo(state.map);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 11, updateWhenIdle: true, keepBuffer: 0,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
        }).addTo(state.map);
        const icon = L.divIcon({ className: 'radar-marker-shell', html: '<div class="radar-pin-marker"></div>', iconSize: [24,24], iconAnchor: [12,12] });
        state.marker = L.marker([state.place.latitude, state.place.longitude], { icon, keyboard: false }).addTo(state.map);
        state.initialized = true;
        const placeholder = $('#radarPlaceholder');
        if (placeholder) placeholder.remove();
        setTimeout(() => state.map.invalidateSize(), 80);
        await refresh();
      } catch (error) {
        const placeholder = $('#radarPlaceholder');
        if (placeholder) {
          placeholder.classList.add('is-error');
          placeholder.querySelector('span').textContent = 'Mapa indisponível. Use os links dos serviços oficiais.';
        }
        status(error.message || 'Não foi possível carregar o mapa.');
      }
    })();
    try { await state.initializing; } finally { state.initializing = null; }
  }

  $('#radarFrameRange').addEventListener('input', event => queueFrame(Number(event.target.value)));
  $('#radarCenter').addEventListener('click', () => {
    if (!state.map) { init(); return; }
    const p = state.place;
    state.map.setView([p.latitude,p.longitude],6, { animate: true });
  });
  $('#radarRefresh').addEventListener('click', async () => { if (!state.initialized) await init(); else await refresh(true); });
  document.addEventListener('climaradar:place', event => changePlace(event.detail));
  if (window.ClimaRadarCurrentPlace) changePlace(window.ClimaRadarCurrentPlace);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      init();
    }, { rootMargin: '280px 0px' });
    observer.observe($('#radar'));
  } else {
    init();
  }
})();

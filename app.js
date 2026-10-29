/* ClimaRadar Brasil — frontend estático. Sem scraping nem dependências de build. */
'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { place: null, loadingId: 0, searchId: 0, suggestions: [], abort: null };
const MODEL_CONFIG = [
  { id: 'ecmwf', api: 'https://api.open-meteo.com/v1/ecmwf', model: 'ecmwf_ifs025' },
  { id: 'gfs', api: 'https://api.open-meteo.com/v1/gfs', model: 'gfs_seamless' },
  { id: 'icon', api: 'https://api.open-meteo.com/v1/dwd-icon', model: 'dwd_icon_global' }
];
const MAX_DAYS = 7;
const DAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const NOW_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
function fetchJson(url, options = {}) {
  // Timeout por requisição, independentemente da geolocalização.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort();
    else options.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(url, { signal: ctrl.signal }).then(async r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (data.error) throw new Error(data.reason || 'Dados indisponíveis');
    return data;
  }).finally(() => clearTimeout(timeout));
}
function queryUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
function notify(text, error = false) {
  const node = $('#message');
  node.textContent = text;
  node.classList.remove('hidden');
  node.classList.toggle('error', !!error);
}
function clearNotice() { $('#message').classList.add('hidden'); }
function number(value, decimals = 0) {
  return Number.isFinite(Number(value)) && value !== null ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—';
}
function sum(values) { return values.reduce((a, b) => a + (Number.isFinite(Number(b)) ? Number(b) : 0), 0); }
function weatherLabel(code) {
  if (code === 0) return ['Céu limpo', '☀️'];
  if ([1, 2].includes(code)) return ['Poucas nuvens', '🌤️'];
  if (code === 3) return ['Encoberto', '☁️'];
  if ([45, 48].includes(code)) return ['Neblina', '🌫️'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['Garoa', '🌦️'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Chuva', '🌧️'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Neve', '🌨️'];
  if ([95, 96, 99].includes(code)) return ['Tempestade', '⛈️'];
  return ['Condição variável', '🌥️'];
}
function getIndexForNow(times, currentIso) {
  if (!Array.isArray(times) || !times.length) return -1;
  const nowHour = String(currentIso || '').slice(0, 13);
  let i = times.findIndex(t => String(t).slice(0, 13) >= nowHour);
  return i === -1 ? times.length - 1 : i;
}
function dateShort(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return Number.isFinite(date.getTime()) ? DAY_FORMAT.format(date).replace('.', '') : dateStr;
}
function sameDate(localIso, day) { return String(localIso).slice(0, 10) === day; }
function toHour(localIso) { return String(localIso).slice(11, 16) || '—'; }
function setText(selector, value) { $(selector).textContent = value; }

function renderCurrent(data, location) {
  const current = data.current || {};
  const today = data.daily || {};
  setText('#cityName', location.name + (location.admin1 ? ', ' + location.admin1 : ''));
  const localDate = data.current?.time || data.hourly?.time?.[0];
  const date = localDate && localDate.length >= 10 ? new Date(localDate.slice(0, 10) + 'T12:00:00') : new Date();
  setText('#todayLabel', NOW_FORMAT.format(date));
  const condition = weatherLabel(current.weather_code);
  setText('#heroIcon', condition[1]);
  setText('#currentTemp', number(current.temperature_2m));
  setText('#weatherDesc', condition[0]);
  setText('#tempMax', number(today.temperature_2m_max?.[0]));
  setText('#tempMin', number(today.temperature_2m_min?.[0]));
  setText('#feelsLike', number(current.apparent_temperature) + '°C');
  setText('#humidity', number(current.relative_humidity_2m) + '%');
  setText('#wind', number(current.wind_speed_10m) + ' km/h');
  setText('#rainNow', number(current.precipitation, 1) + ' mm');
  setText('#fetchedAt', 'Consultado às ' + new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
  document.title = location.name + ' — ClimaRadar Brasil';
}
function renderRain(data) {
  const h = data.hourly || {}, currentTime = data.current?.time || '';
  const start = getIndexForNow(h.time, currentTime);
  if (start < 0) return;
  const chance12 = (h.precipitation_probability || []).slice(start, start + 12);
  const chance = chance12.filter(x => typeof x === 'number').length ? Math.max(...chance12.filter(x => typeof x === 'number')) : null;
  setText('#rainChance', chance === null ? '—' : number(chance) + '%');
  const label = chance === null ? 'Probabilidade indisponível' : chance >= 70 ? 'Chance elevada em ao menos uma hora' : chance >= 40 ? 'Chance moderada em ao menos uma hora' : 'Chance baixa no período';
  setText('#riskLabel', label);
  $('#rainBar').style.width = Math.max(0, Math.min(100, chance || 0)) + '%';
  const rain24 = (h.precipitation || []).slice(start, start + 24);
  setText('#rain24', number(sum(rain24), 1) + ' mm');
  const next = (h.precipitation || []).findIndex((mm, idx) => idx >= start && idx < start + 24 && Number(mm) >= 0.2);
  setText('#nextRain', next < 0 ? 'Sem chuva ≥ 0,2 mm/h' : toHour(h.time[next]));
}
function renderHourly(data) {
  const h = data.hourly || {};
  const start = getIndexForNow(h.time, data.current?.time);
  if (start < 0) return;
  const list = h.time.slice(start, start + 24).map((time, i) => ({
    time, temp: h.temperature_2m?.[start + i], chance: h.precipitation_probability?.[start + i], wx: h.weather_code?.[start + i]
  }));
  const sampled = list.filter((_, i) => i % 4 === 0).slice(0, 6);
  $('#hourlyItems').replaceChildren(...sampled.map(item => {
    const root = document.createElement('div'); root.className = 'hourly-item';
    const vals = [['time', toHour(item.time)], ['wx', weatherLabel(item.wx)[1]], ['value', number(item.temp) + '°'], ['chance', number(item.chance) + '% chuva']];
    vals.forEach(([cls, val]) => { const e = document.createElement('span'); e.className = cls; e.textContent = val; root.appendChild(e); });
    return root;
  }));
  const valid = list.filter(x => Number.isFinite(x.temp));
  if (valid.length < 2) { setText('#hourlyChart', 'Previsão horária indisponível.'); return; }
  const width = 940, height = 215, left = 28, right = 18, top = 25, bottom = 28;
  const ymin = Math.floor(Math.min(...valid.map(x => x.temp)) - 1), ymax = Math.ceil(Math.max(...valid.map(x => x.temp)) + 1);
  const range = Math.max(1, ymax - ymin), innerW = width - left - right, innerH = height - top - bottom;
  const px = i => left + i / (list.length - 1) * innerW;
  const py = t => top + ((ymax - t) / range) * (innerH - 18);
  const points = list.map((x, i) => Number.isFinite(x.temp) ? [px(i), py(x.temp)] : null).filter(Boolean);
  const path = points.map((p, i) => (i ? 'L' : 'M') + p.map(v => v.toFixed(2)).join(' ')).join(' ');
  const bars = list.map((x, i) => { const chance = Number.isFinite(x.chance) ? Math.max(0, Math.min(100, x.chance)) : 0; const bh = chance / 100 * 55; return `<rect x="${(px(i)-9).toFixed(1)}" y="${(height-bottom-bh).toFixed(1)}" width="18" height="${bh.toFixed(1)}" rx="3" fill="#62b1ed" opacity=".37"/>`; }).join('');
  const ticks = [0, 4, 8, 12, 16, 20].filter(i => i < list.length).map(i => `<text x="${px(i)}" y="${height - 7}" text-anchor="middle" fill="#95aebe" font-size="12">${toHour(list[i].time)}</text>`).join('');
  const guides = [0, 1, 2, 3].map(i => { const val = ymin + (range / 3) * i; const yy = py(val); return `<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" stroke="#ffffff" stroke-opacity=".09" stroke-dasharray="3,6"/><text x="2" y="${yy+4}" fill="#95aebe" font-size="11">${Math.round(val)}°</text>`; }).join('');
  // Conteúdo do SVG é somente derivado de valores numéricos e horários do provedor.
  $('#hourlyChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Previsão de temperatura em linha verde e chance de chuva em barras azuis ao longo das próximas 24 horas"><defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7be9c9" stop-opacity=".16"/><stop offset="1" stop-color="#7be9c9" stop-opacity="0"/></linearGradient></defs>${guides}${bars}<path d="${path} L ${points.at(-1)[0]} ${height-bottom} L ${points[0][0]} ${height-bottom} Z" fill="url(#tempFill)"/><path d="${path}" fill="none" stroke="#7de4ca" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${points.filter((_,i)=>i%4===0).map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#bafbe9"/>`).join('')}${ticks}</svg>`;
}
function renderDaily(data) {
  const d = data.daily || {};
  if (!Array.isArray(d.time)) { setText('#dailyCards', 'Previsão semanal indisponível.'); return; }
  $('#dailyCards').replaceChildren(...d.time.slice(0, MAX_DAYS).map((day, i) => {
    const el = document.createElement('article'); el.className = 'weather-card daily-card';
    const parts = [
      ['h3', i === 0 ? 'Hoje' : dateShort(day)],
      ['span', weatherLabel(d.weather_code?.[i])[1], 'day-icon'],
      ['div', number(d.temperature_2m_max?.[i]) + '° / ' + number(d.temperature_2m_min?.[i]) + '°', 'day-temps'],
      ['span', number(d.precipitation_probability_max?.[i]) + '% chuva', 'day-rain']
    ];
    parts.forEach(([tag, value, cls]) => { const node = document.createElement(tag); node.textContent = value; if (cls) node.className = cls; el.appendChild(node); });
    return el;
  }));
}
function summarizeModel(data, baseCurrent) {
  const h = data.hourly || {}, currentTime = baseCurrent || h.time?.[0] || '';
  if (!h.time || !h.temperature_2m) throw new Error('Sem série horária');
  const idx = getIndexForNow(h.time, currentTime);
  if (idx < 0) throw new Error('Sem horário válido');
  return { temp: h.temperature_2m[idx], rain: sum((h.precipitation || []).slice(idx, idx + 24)) };
}
function renderModels(results, currentTime) {
  const successful = [];
  for (let i = 0; i < MODEL_CONFIG.length; ++i) {
    const model = MODEL_CONFIG[i], article = $(`[data-model="${model.id}"]`), result = results[i];
    if (result.status === 'fulfilled') {
      try {
        const values = summarizeModel(result.value, currentTime);
        if (!Number.isFinite(values.temp)) throw new Error('Sem temperatura');
        article.querySelector('.model-temp').textContent = number(values.temp) + '°C';
        article.querySelector('.model-rain').textContent = number(values.rain, 1) + ' mm';
        article.querySelector('.model-status').textContent = 'Disponível';
        successful.push({ ...values, id: model.id });
        continue;
      } catch (e) { /* Status de indisponibilidade abaixo. */ }
    }
    article.querySelector('.model-temp').textContent = '—';
    article.querySelector('.model-rain').textContent = '—';
    article.querySelector('.model-status').textContent = 'Indisponível';
  }
  if (successful.length < 2) {
    setText('#consensusTitle', 'Comparação limitada');
    setText('#consensusText', 'É necessário obter ao menos dois modelos para comparar divergências. As previsões principais podem continuar funcionando.');
    return;
  }
  const temps = successful.map(x => x.temp), rains = successful.map(x => x.rain);
  const tSpread = Math.max(...temps) - Math.min(...temps), rSpread = Math.max(...rains) - Math.min(...rains);
  const tone = tSpread < 2 && rSpread < 3 ? 'Baixa divergência entre os modelos' : tSpread > 4 || rSpread > 12 ? 'Divergência elevada entre os modelos' : 'Divergência moderada entre os modelos';
  setText('#consensusTitle', tone);
  setText('#consensusText', `${successful.length} modelos comparados. Diferença de até ${number(tSpread, 1)}°C na temperatura próxima hora e ${number(rSpread, 1)} mm no acumulado de 24h. Isso não mede o acerto real da previsão.`);
}
async function loadPlace(place) {
  const id = ++state.loadingId;
  if (state.abort) state.abort.abort();
  state.abort = new AbortController();
  const signal = state.abort.signal;
  state.place = place;
  clearNotice();
  setText('#cityName', place.name + (place.admin1 ? ', ' + place.admin1 : ''));
  setText('#fetchedAt', 'Carregando...');
  $('#suggestions').classList.add('hidden');
  const common = { latitude: place.latitude, longitude: place.longitude, timezone: 'auto', forecast_days: MAX_DAYS };
  const primaryUrl = queryUrl('https://api.open-meteo.com/v1/forecast', { ...common,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' });
  const params = { ...common, hourly: 'temperature_2m,precipitation' };
  // Cada modelo é requisitado separadamente para deixar indisponibilidade isolada.
  const main = fetchJson(primaryUrl, { signal });
  const models = MODEL_CONFIG.map(config => fetchJson(queryUrl(config.api, { ...params, models: config.model }), { signal }));
  const [primaryResult, ...modelResults] = await Promise.allSettled([main, ...models]);
  if (id !== state.loadingId) return;
  if (primaryResult.status === 'rejected') {
    notify('Não foi possível carregar a previsão desta cidade. Confira sua conexão e tente novamente. Detalhe: ' + (primaryResult.reason?.message || 'fonte indisponível'), true);
    setText('#fetchedAt', 'Indisponível');
    renderModels(modelResults, '');
    return;
  }
  const data = primaryResult.value;
  renderCurrent(data, place);
  renderRain(data);
  renderHourly(data);
  renderDaily(data);
  renderModels(modelResults, data.current?.time);
  try { localStorage.setItem('climaradar-place', JSON.stringify({ name: place.name, admin1: place.admin1 || '', latitude: place.latitude, longitude: place.longitude })); } catch { /* Browser bloqueou armazenamento. */ }
}
async function searchCities(text) {
  const query = text.trim();
  if (query.length < 2) return [];
  const url = queryUrl('https://geocoding-api.open-meteo.com/v1/search', { name: query, count: 8, language: 'pt', countryCode: 'BR' });
  const data = await fetchJson(url);
  return (data.results || []).filter(x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
}
function showSuggestions(results) {
  state.suggestions = results;
  const target = $('#suggestions');
  target.replaceChildren();
  if (!results.length) { target.classList.add('hidden'); return; }
  results.forEach((result, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'suggestion'; button.setAttribute('role','option');
    const city = document.createElement('strong'), detail = document.createElement('span');
    city.textContent = result.name;
    detail.textContent = [result.admin1, result.country].filter(Boolean).join(' · ');
    button.append(city,detail);
    button.addEventListener('click', () => { $('#cityInput').value = result.name; loadPlace(result); });
    target.appendChild(button);
  });
  target.classList.remove('hidden');
}
let searchTimeout;
$('#cityInput').addEventListener('input', event => {
  clearTimeout(searchTimeout);
  const text = event.target.value.trim();
  const current = ++state.searchId;
  if (text.length < 2) { showSuggestions([]); return; }
  searchTimeout = setTimeout(async () => {
    try { const result = await searchCities(text); if (current === state.searchId) showSuggestions(result); }
    catch { if (current === state.searchId) showSuggestions([]); }
  }, 350);
});
$('#searchForm').addEventListener('submit', async event => {
  event.preventDefault(); clearTimeout(searchTimeout);
  const text = $('#cityInput').value.trim();
  if (text.length < 2) { notify('Digite ao menos duas letras do nome da cidade.', true); return; }
  const selected = state.suggestions.find(x => x.name.toLowerCase() === text.toLowerCase());
  if (selected) { loadPlace(selected); return; }
  try {
    const result = await searchCities(text);
    if (result.length) { $('#cityInput').value = result[0].name; loadPlace(result[0]); }
    else notify('Cidade não encontrada. Tente escrever o nome completo.', true);
  } catch { notify('Busca de cidades indisponível no momento.', true); }
});
document.addEventListener('click', event => { if (!event.target.closest('.search-wrapper')) $('#suggestions').classList.add('hidden'); });
$('#geolocate').addEventListener('click', () => {
  if (!navigator.geolocation) { notify('Geolocalização indisponível neste navegador.', true); return; }
  notify('Solicitando permissão de localização no navegador...');
  navigator.geolocation.getCurrentPosition(async position => {
    const lat = position.coords.latitude, lon = position.coords.longitude;
    // Geocoding reverso não é oferecido pelo mesmo endpoint, portanto exibimos coordenadas aproximadas.
    const place = { name: 'Minha localização', admin1: `(${number(lat, 2)}, ${number(lon, 2)})`, latitude: lat, longitude: lon };
    $('#cityInput').value = '';
    loadPlace(place);
  }, error => notify(error.code === 1 ? 'Permissão negada. Pesquise uma cidade para consultar a previsão.' : 'Não foi possível obter sua localização. Pesquise uma cidade.', true), { enableHighAccuracy: false, timeout: 13000, maximumAge: 300000 });
});
async function initialize() {
  try {
    const stored = JSON.parse(localStorage.getItem('climaradar-place') || 'null');
    if (stored && Number.isFinite(stored.latitude) && Number.isFinite(stored.longitude) && typeof stored.name === 'string') { $('#cityInput').value = stored.name === 'Minha localização' ? '' : stored.name; await loadPlace(stored); return; }
  } catch { /* Sem cidade armazenada. */ }
  try {
    const initial = await searchCities('Morro Agudo');
    const choice = initial.find(p => /paulo/i.test(p.admin1 || '')) || initial[0];
    if (!choice) throw new Error('Nenhum município encontrado');
    $('#cityInput').value = choice.name;
    await loadPlace(choice);
  } catch { notify('Não foi possível obter a cidade inicial. Pesquise outra cidade para começar.', true); }
}
initialize();

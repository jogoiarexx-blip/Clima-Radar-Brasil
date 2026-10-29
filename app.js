'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { place: null, loadingId: 0, searchId: 0, suggestions: [], abort: null, lastConsensus: null };
const MAX_DAYS = 7;
const CALIBRATION_KEY = 'climaradar.audit.weights.v2';
const MODEL_CONFIG = [
  { id: 'bestmatch', label: 'Best Match', type: 'primary', baseWeight: 0.22 },
  { id: 'ecmwf', label: 'ECMWF', api: 'https://api.open-meteo.com/v1/forecast', model: 'ecmwf_ifs', baseWeight: 0.32 },
  { id: 'gfs', label: 'GFS', api: 'https://api.open-meteo.com/v1/forecast', model: 'ncep_gfs_seamless', baseWeight: 0.23 },
  { id: 'icon', label: 'ICON', api: 'https://api.open-meteo.com/v1/forecast', model: 'icon_global', baseWeight: 0.23 },
  { id: 'gem', label: 'GEM', api: 'https://api.open-meteo.com/v1/forecast', model: 'cmc_gem_seamless', baseWeight: 0.22 }
];
const DAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const NOW_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort();
    else options.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(url, { signal: ctrl.signal }).then(async response => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
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
  return Number.isFinite(Number(value)) && value !== null
    ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
    : '—';
}
function sum(values) { return values.reduce((acc, val) => acc + (Number.isFinite(Number(val)) ? Number(val) : 0), 0); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function average(values) {
  const valid = values.filter(v => Number.isFinite(v));
  return valid.length ? sum(valid) / valid.length : null;
}
function median(values) {
  const valid = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}
function dateShort(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return Number.isFinite(date.getTime()) ? DAY_FORMAT.format(date).replace('.', '') : dateStr;
}
function toHour(localIso) { return String(localIso).slice(11, 16) || '—'; }
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
function getIndexForNow(times, currentIso) {
  if (!Array.isArray(times) || !times.length) return -1;
  const currentHour = String(currentIso || '').slice(0, 13);
  const found = times.findIndex(time => String(time).slice(0, 13) >= currentHour);
  return found === -1 ? times.length - 1 : found;
}

function weatherLabel(code) {
  if (code === 0) return ['Céu limpo', 'sun'];
  if ([1, 2].includes(code)) return ['Poucas nuvens', 'partly'];
  if (code === 3) return ['Encoberto', 'cloud'];
  if ([45, 48].includes(code)) return ['Neblina', 'fog'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['Garoa', 'drizzle'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Chuva', 'rain'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Neve', 'snow'];
  if ([95, 96, 99].includes(code)) return ['Tempestade', 'storm'];
  return ['Condição variável', 'cloud'];
}
function weatherIconSvg(kind, size = 24) {
  const common = `width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"`;
  const stroke = '#EAF7FB';
  const accent = '#86E3D0';
  const blue = '#4CA2E0';
  switch (kind) {
    case 'sun':
      return `<svg ${common}><circle cx="32" cy="32" r="12" fill="${accent}"/><g stroke="${stroke}" stroke-width="3" stroke-linecap="round"><path d="M32 7v8"/><path d="M32 49v8"/><path d="M7 32h8"/><path d="M49 32h8"/><path d="M14.5 14.5l5.7 5.7"/><path d="M43.8 43.8l5.7 5.7"/><path d="M49.5 14.5l-5.7 5.7"/><path d="M20.2 43.8l-5.7 5.7"/></g></svg>`;
    case 'partly':
      return `<svg ${common}><circle cx="22" cy="23" r="9" fill="${accent}"/><path d="M22 8v5M22 33v5M7 23h5M32 23h5M11.3 12.3l3.5 3.5M29.2 30.2l3.5 3.5" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/><path d="M24 45c0-6.1 4.9-11 11-11c4.3 0 8 2.4 9.8 6c0.9-0.3 1.9-0.5 2.9-0.5c4.6 0 8.3 3.7 8.3 8.3S52.3 56 47.7 56H30.5C26.9 56 24 53.1 24 49.5c0-1.6 0.5-3 1.5-4.5Z" fill="${stroke}" fill-opacity="0.95"/></svg>`;
    case 'cloud':
      return `<svg ${common}><path d="M15 42c0-7.7 6.3-14 14-14c1.3 0 2.5.2 3.7.5C35.8 22.8 41.2 19 47.5 19c9.1 0 16.5 7.4 16.5 16.5S56.6 52 47.5 52H27.5C20.6 52 15 46.4 15 39.5c0-.9 0-1.6 0-2.5Z" fill="${stroke}" fill-opacity="0.95"/></svg>`;
    case 'fog':
      return `<svg ${common}><path d="M16 26c1.8-5.8 7.2-10 13.5-10c4.1 0 7.9 1.7 10.6 4.7c1.8-1 3.8-1.5 5.9-1.5c6.6 0 12 5.4 12 12c0 6.6-5.4 12-12 12H28c-6.6 0-12-5.4-12-12c0-1.8.3-3.5 1-5.2Z" fill="${stroke}" fill-opacity="0.92"/><g stroke="${blue}" stroke-linecap="round" stroke-width="3"><path d="M13 49h16"/><path d="M35 49h16"/><path d="M18 56h28"/></g></svg>`;
    case 'drizzle':
      return `<svg ${common}><path d="M14 28c0-7.2 5.8-13 13-13c1.1 0 2.3.1 3.4.4C33 20 37.6 17 43 17c8.3 0 15 6.7 15 15s-6.7 15-15 15H27C19.8 47 14 41.2 14 34c0-2 .4-4.1 1.3-6Z" fill="${stroke}" fill-opacity="0.95"/><g stroke="${accent}" stroke-linecap="round" stroke-width="3"><path d="M26 49l-3 7"/><path d="M37 49l-3 7"/><path d="M48 49l-3 7"/></g></svg>`;
    case 'rain':
      return `<svg ${common}><path d="M14 28c0-7.2 5.8-13 13-13c1.1 0 2.3.1 3.4.4C33 20 37.6 17 43 17c8.3 0 15 6.7 15 15s-6.7 15-15 15H27C19.8 47 14 41.2 14 34c0-2 .4-4.1 1.3-6Z" fill="${stroke}" fill-opacity="0.95"/><g stroke="${blue}" stroke-linecap="round" stroke-width="4"><path d="M24 49l-4 9"/><path d="M37 49l-4 9"/><path d="M50 49l-4 9"/></g></svg>`;
    case 'snow':
      return `<svg ${common}><path d="M14 28c0-7.2 5.8-13 13-13c1.1 0 2.3.1 3.4.4C33 20 37.6 17 43 17c8.3 0 15 6.7 15 15s-6.7 15-15 15H27C19.8 47 14 41.2 14 34c0-2 .4-4.1 1.3-6Z" fill="${stroke}" fill-opacity="0.95"/><g stroke="${accent}" stroke-width="2.6" stroke-linecap="round"><path d="M23 51h7"/><path d="M26.5 47.5v7"/><path d="M24.2 48.8l4.6 4.4"/><path d="M28.8 48.8l-4.6 4.4"/><path d="M39 51h7"/><path d="M42.5 47.5v7"/><path d="M40.2 48.8l4.6 4.4"/><path d="M44.8 48.8l-4.6 4.4"/></g></svg>`;
    case 'storm':
      return `<svg ${common}><path d="M14 28c0-7.2 5.8-13 13-13c1.1 0 2.3.1 3.4.4C33 20 37.6 17 43 17c8.3 0 15 6.7 15 15s-6.7 15-15 15H27C19.8 47 14 41.2 14 34c0-2 .4-4.1 1.3-6Z" fill="${stroke}" fill-opacity="0.95"/><path d="M33 47h8l-5 7h6L31 63l4-9h-7l5-7Z" fill="${warnColor()}"/></svg>`;
    default:
      return `<svg ${common}><circle cx="32" cy="32" r="12" fill="${accent}" opacity="0.6"/><path d="M15 42c0-7.7 6.3-14 14-14c1.3 0 2.5.2 3.7.5C35.8 22.8 41.2 19 47.5 19c9.1 0 16.5 7.4 16.5 16.5S56.6 52 47.5 52H27.5C20.6 52 15 46.4 15 39.5c0-.9 0-1.6 0-2.5Z" fill="${stroke}" fill-opacity="0.95"/></svg>`;
  }
}
function warnColor() { return '#F6CF83'; }
function setWeatherIcon(target, code, size = 58) {
  const node = typeof target === 'string' ? $(target) : target;
  if (!node) return;
  node.innerHTML = weatherIconSvg(weatherLabel(code)[1], size);
}

function getCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !parsed.weights?.temp) return null;
    return parsed;
  } catch {
    return null;
  }
}
function setCalibrationState() {
  const calibration = getCalibration();
  setText('#calibrationState', calibration ? 'Salva (até 50 km; 45 dias)' : 'Sem calibração');
  window.ClimaRadarCalibration = calibration;
}
window.ClimaRadarSetCalibration = function (payload) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(payload));
  setCalibrationState();
  if (state.place) loadPlace(state.place);
};
window.ClimaRadarClearCalibration = function () {
  localStorage.removeItem(CALIBRATION_KEY);
  setCalibrationState();
  if (state.place) loadPlace(state.place);
};

function getHourlySlice(hourly, start, length = 24) {
  return hourly?.time?.slice(start, start + length).map((time, offset) => ({
    time,
    temp: hourly.temperature_2m?.[start + offset],
    chance: hourly.precipitation_probability?.[start + offset],
    rain: hourly.precipitation?.[start + offset],
    weather_code: hourly.weather_code?.[start + offset]
  })) || [];
}
function summarizeDataset(data, id, label, targetHour) {
  return window.ClimaForecastCore.summary(data, id, label, targetHour || data.current?.time || data.hourly?.time?.[0]);
}
function computeConsensus(primarySummary, modelSummaries) {
  const storedCalibration = getCalibration();
  const distance = storedCalibration?.coords && state.place && typeof window.ClimaAudit?.distanceKm === 'function'
    ? window.ClimaAudit.distanceKm(state.place.latitude, state.place.longitude, storedCalibration.coords.latitude, storedCalibration.coords.longitude)
    : Infinity;
  const ageDays = storedCalibration?.end ? (Date.now() - Date.parse(storedCalibration.end + 'T23:59:59Z')) / 86400000 : Infinity;
  const validCalibration = storedCalibration?.lead === 1 && distance <= 50 && ageDays >= -1 && ageDays <= 45;
  return window.ClimaForecastCore.ensemble(primarySummary, modelSummaries, validCalibration ? storedCalibration : null);
}

function confidenceTone(score) {
  if (score === null) return { text: 'Dados insuficientes', className: 'pill is-warn' };
  if (score >= 80) return { text: 'Acordo alto', className: 'pill is-good' };
  if (score >= 55) return { text: 'Acordo moderado', className: 'pill is-warn' };
  return { text: 'Baixo acordo', className: 'pill is-bad' };
}

function renderCurrent(primaryData, location, consensus) {
  const current = primaryData.current || {};
  const today = primaryData.daily || {};
  const currentDate = primaryData.current?.time || primaryData.hourly?.time?.[0];
  const date = currentDate && currentDate.length >= 10 ? new Date(currentDate.slice(0, 10) + 'T12:00:00') : new Date();
  const tone = confidenceTone(consensus.confidence);
  const conditionCode = consensus.summary?.code ?? current.weather_code;
  const condition = weatherLabel(conditionCode);

  setText('#cityName', location.name + (location.admin1 ? ', ' + location.admin1 : ''));
  setText('#todayLabel', NOW_FORMAT.format(date));
  setWeatherIcon('#heroIcon', conditionCode, 60);
  setText('#currentTemp', number(consensus.summary?.temp));
  setText('#weatherDesc', condition[0]);
  setText('#tempMax', number(today.temperature_2m_max?.[0]));
  setText('#tempMin', number(today.temperature_2m_min?.[0]));
  setText('#feelsLike', number(current.apparent_temperature) + ' °C');
  setText('#humidity', number(current.relative_humidity_2m) + '%');
  setText('#wind', number(current.wind_speed_10m) + ' km/h');
  setText('#rainNow', number(current.precipitation, 1) + ' mm');
  setText('#fetchedAt', new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
  setText('#consensusSummary', `${consensus.modelsOnline} modelo(s) válidos comparados. ${consensus.description}`);
  const badge = $('#confidenceBadge');
  badge.textContent = tone.text;
  badge.className = tone.className;
  document.title = `${location.name} — ClimaRadar Brasil`;
}

function renderConsensus(consensus) {
  setText('#consensusTitle', consensus.label);
  setText('#consensusText', consensus.description);
  setText('#confidenceScore', consensus.confidence === null ? '—' : number(consensus.confidence));
  setText('#spreadTemp', Number.isFinite(consensus.tempSpread) ? `${number(consensus.tempSpread, 1)} °C` : '—');
  setText('#spreadRain', Number.isFinite(consensus.rainSpread) ? `${number(consensus.rainSpread, 1)} mm` : '—');
  setText('#modelsOnline', String(consensus.modelsOnline));
  setText('#calibrationState', consensus.calibrationUsed ? 'Ativa na região' : getCalibration() ? 'Inativa (local ou validade)' : 'Sem calibração');
}

function renderRain(primaryData, consensus) {
  const h = primaryData.hourly || {};
  const currentTime = primaryData.current?.time || '';
  const start = getIndexForNow(h.time, currentTime);
  if (start < 0) return;
  const chance12 = (h.precipitation_probability || []).slice(start, start + 12).filter(v => Number.isFinite(v));
  const baseChance = chance12.length ? Math.max(...chance12) : null;
  const consensusChance = Number.isFinite(consensus.rainChance) ? consensus.rainChance : baseChance;
  setText('#rainChance', consensusChance === null ? '—' : `${number(consensusChance)}%`);
  setText('#riskLabel', consensusChance === null ? 'Probabilidade horária indisponível.' : consensusChance >= 70 ? 'Maior probabilidade horária elevada nas próximas 12 horas.' : consensusChance >= 40 ? 'Maior probabilidade horária moderada nas próximas 12 horas.' : 'Baixa probabilidade em cada hora das próximas 12 horas.');
  $('#rainBar').style.width = `${clamp(consensusChance || 0, 0, 100)}%`;
  const rain24Values = (h.precipitation || []).slice(start, start + 24);
  const rain24Primary = rain24Values.length === 24 && rain24Values.every(Number.isFinite) ? sum(rain24Values) : null;
  const nextRainIndex = (h.precipitation || []).findIndex((value, index) => index >= start && index < start + 24 && Number(value) >= 0.2);
  setText('#rain24', rain24Primary === null ? '—' : `${number(rain24Primary, 1)} mm`);
  setText('#nextRain', nextRainIndex < 0 ? 'Sem sinal relevante' : toHour(h.time[nextRainIndex]));
  setText('#consensusRain24', Number.isFinite(consensus.summary?.rain24) ? `${number(consensus.summary.rain24, 1)} mm` : '—');
  setText('#worstCaseRain', Number.isFinite(consensus.worstCaseRain) ? `${number(consensus.worstCaseRain, 1)} mm` : '—');
}

function renderModels(primarySummary, modelSummaries) {
  const items = [primarySummary, ...modelSummaries].filter(Boolean);
  for (const config of MODEL_CONFIG) {
    const summary = items.find(item => item.id === config.id);
    const card = $(`[data-model="${config.id}"]`);
    if (!card) continue;
    const status = card.querySelector('.model-status');
    const temp = card.querySelector('.model-temp');
    const rain = card.querySelector('.model-rain');
    if (summary && Number.isFinite(summary.temp)) {
      temp.textContent = `${number(summary.temp, 1)} °C`;
      rain.textContent = `${number(summary.rain24, 1)} mm`;
      status.textContent = 'Disponível';
    } else {
      temp.textContent = '—';
      rain.textContent = '—';
      status.textContent = 'Indisponível';
    }
  }
}

function renderHourly(primaryData, consensus) {
  const hourly = primaryData.hourly || {};
  const start = getIndexForNow(hourly.time, primaryData.current?.time);
  if (start < 0) {
    setText('#hourlyChart', 'Previsão horária indisponível.');
    return;
  }
  const list = getHourlySlice(hourly, start, 24);
  const sampled = list.filter((_, index) => index % 4 === 0).slice(0, 6);
  $('#hourlyItems').replaceChildren(...sampled.map(item => {
    const root = document.createElement('div');
    root.className = 'hourly-item';
    const time = document.createElement('span'); time.className = 'time'; time.textContent = toHour(item.time);
    const icon = document.createElement('span'); icon.className = 'wx'; icon.innerHTML = weatherIconSvg(weatherLabel(item.weather_code)[1], 28);
    const value = document.createElement('span'); value.className = 'value'; value.textContent = `${number(item.temp)}°`;
    const chance = document.createElement('span'); chance.className = 'chance'; chance.textContent = `${number(item.chance)}%`;
    root.append(time, icon, value, chance);
    return root;
  }));

  const valid = list.filter(item => Number.isFinite(item.temp));
  if (valid.length < 2) {
    setText('#hourlyChart', 'Previsão horária indisponível.');
    return;
  }
  const width = 980, height = 250, left = 34, right = 18, top = 20, bottom = 36;
  const innerW = width - left - right, innerH = height - top - bottom;
  const tMin = Math.floor(Math.min(...valid.map(item => item.temp)) - 1);
  const tMax = Math.ceil(Math.max(...valid.map(item => item.temp)) + 1);
  const range = Math.max(1, tMax - tMin);
  const px = index => left + (index / Math.max(1, list.length - 1)) * innerW;
  const py = temp => top + ((tMax - temp) / range) * (innerH - 18);
  const points = list.map((item, index) => Number.isFinite(item.temp) ? [px(index), py(item.temp)] : null).filter(Boolean);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ');
  const bars = list.map((item, index) => {
    const rain = clamp(Number(item.rain) || 0, 0, 20);
    const barHeight = rain / 20 * 70;
    return `<rect x="${(px(index) - 7).toFixed(1)}" y="${(height - bottom - barHeight).toFixed(1)}" width="14" height="${barHeight.toFixed(1)}" rx="4" fill="#4CA2E0" opacity="0.42"/>`;
  }).join('');
  const guides = [0, 1, 2, 3].map(i => {
    const value = tMin + (range / 3) * i;
    const y = py(value);
    return `<line x1="${left}" x2="${width - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 7"/><text x="4" y="${(y + 4).toFixed(1)}" fill="#8DA4B5" font-size="11">${Math.round(value)}°</text>`;
  }).join('');
  const ticks = [0, 4, 8, 12, 16, 20].filter(index => index < list.length).map(index => (
    `<text x="${px(index).toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="#8DA4B5" font-size="12">${toHour(list[index].time)}</text>`
  )).join('');
  const consensusMarker = Number.isFinite(consensus.summary?.temp)
    ? `<line x1="${left}" x2="${width - right}" y1="${py(consensus.summary.temp).toFixed(1)}" y2="${py(consensus.summary.temp).toFixed(1)}" stroke="#86E3D0" stroke-opacity="0.22" stroke-dasharray="2 8"/>`
    : '';
  $('#hourlyChart').innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de temperatura e chuva para as próximas 24 horas">
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#86E3D0" stop-opacity="0.18"/>
          <stop offset="1" stop-color="#86E3D0" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${guides}
      ${consensusMarker}
      ${bars}
      <path d="${path} L ${points.at(-1)[0].toFixed(1)} ${height - bottom} L ${points[0][0].toFixed(1)} ${height - bottom} Z" fill="url(#lineFill)"/>
      <path d="${path}" fill="none" stroke="#86E3D0" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.filter((_, index) => index % 3 === 0).map(point => `<circle cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="3.4" fill="#EAF7FB"/>`).join('')}
      ${ticks}
    </svg>`;
}

function renderDaily(primaryData) {
  const daily = primaryData.daily || {};
  if (!Array.isArray(daily.time)) {
    setText('#dailyCards', 'Previsão indisponível.');
    return;
  }
  $('#dailyCards').replaceChildren(...daily.time.slice(0, MAX_DAYS).map((day, index) => {
    const article = document.createElement('article');
    article.className = 'weather-card daily-card';
    const title = document.createElement('h3'); title.textContent = index === 0 ? 'Hoje' : dateShort(day);
    const icon = document.createElement('span'); icon.className = 'day-icon'; icon.innerHTML = weatherIconSvg(weatherLabel(daily.weather_code?.[index])[1], 36);
    const temps = document.createElement('div'); temps.className = 'day-temps'; temps.textContent = `${number(daily.temperature_2m_max?.[index])}° / ${number(daily.temperature_2m_min?.[index])}°`;
    const rain = document.createElement('span'); rain.className = 'day-rain'; rain.textContent = `${number(daily.precipitation_probability_max?.[index])}% de chuva`;
    article.append(title, icon, temps, rain);
    return article;
  }));
}

async function searchCities(text) {
  const query = text.trim();
  if (query.length < 2) return [];
  const url = queryUrl('https://geocoding-api.open-meteo.com/v1/search', { name: query, count: 8, language: 'pt', countryCode: 'BR' });
  const data = await fetchJson(url);
  return (data.results || []).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}
function showSuggestions(results) {
  state.suggestions = results;
  const target = $('#suggestions');
  target.replaceChildren();
  if (!results.length) { target.classList.add('hidden'); return; }
  results.forEach(result => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.setAttribute('role', 'option');
    const title = document.createElement('strong'); title.textContent = result.name;
    const detail = document.createElement('span'); detail.textContent = [result.admin1, result.country].filter(Boolean).join(' · ');
    button.append(title, detail);
    button.addEventListener('click', () => {
      $('#cityInput').value = result.name;
      loadPlace(result);
    });
    target.appendChild(button);
  });
  target.classList.remove('hidden');
}

const RECENT_CITIES_KEY = 'climaradar.recentCities.v1';
function readRecentCities() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_CITIES_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(x => x && typeof x.name === 'string' && Number.isFinite(x.latitude) && Number.isFinite(x.longitude)).slice(0,5) : [];
  } catch { return []; }
}
function renderRecentCities() {
  const container = $('#recentCities');
  if (!container) return;
  const cities = readRecentCities();
  container.replaceChildren();
  if (!cities.length) {const empty=document.createElement('span');empty.className='city-favorites-empty';empty.textContent='Suas consultas aparecerão aqui.';container.append(empty);return;}
  for (const place of cities) {
    const button=document.createElement('button');button.type='button';button.className='recent-city';
    button.textContent=place.name+(place.admin1 ? ` · ${place.admin1}` : '');
    button.title=`Consultar ${place.name}`;
    button.addEventListener('click',()=>{ $('#cityInput').value=place.name; loadPlace(place); });
    container.append(button);
  }
}
function saveRecentCity(place) {
  const normalized={name:place.name,admin1:place.admin1||'',latitude:place.latitude,longitude:place.longitude};
  const cities=readRecentCities().filter(x=> !(x.latitude===normalized.latitude&&x.longitude===normalized.longitude));
  cities.unshift(normalized);
  try{localStorage.setItem(RECENT_CITIES_KEY,JSON.stringify(cities.slice(0,5)));}catch{}
  renderRecentCities();
}

async function loadPlace(place) {
  const id = ++state.loadingId;
  if (state.abort) state.abort.abort();
  state.abort = new AbortController();
  const signal = state.abort.signal;
  state.place = place;
  window.ClimaRadarCurrentPlace = { name: place.name, latitude: place.latitude, longitude: place.longitude };
  document.dispatchEvent(new CustomEvent('climaradar:place', { detail: window.ClimaRadarCurrentPlace }));
  clearNotice();
  setText('#cityName', place.name + (place.admin1 ? ', ' + place.admin1 : ''));
  setText('#fetchedAt', 'Carregando...');
  $('#suggestions').classList.add('hidden');

  const common = { latitude: place.latitude, longitude: place.longitude, timezone: 'auto', forecast_days: MAX_DAYS };
  const primaryUrl = queryUrl('https://api.open-meteo.com/v1/forecast', {
    ...common,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max'
  });
  const modelParams = {
    ...common,
    hourly: 'temperature_2m,precipitation,weather_code'
  };

  const primaryPromise = fetchJson(primaryUrl, { signal });
  const modelPromises = MODEL_CONFIG.filter(model => model.type !== 'primary')
    .map(model => fetchJson(queryUrl(model.api, { ...modelParams, models: model.model }), { signal }));

  const [primaryResult, ...modelResults] = await Promise.allSettled([primaryPromise, ...modelPromises]);
  if (id !== state.loadingId) return;

  if (primaryResult.status === 'rejected') {
    notify('Não foi possível carregar a previsão desta cidade. Tente novamente em instantes. Detalhe: ' + (primaryResult.reason?.message || 'fonte indisponível'), true);
    setText('#fetchedAt', 'Indisponível');
    return;
  }

  const primaryData = primaryResult.value;
  const targetHour = primaryData.current?.time || primaryData.hourly?.time?.[0];
  const primarySummary = summarizeDataset(primaryData, 'bestmatch', 'Best Match', targetHour);
  const modelSummaries = [];
  MODEL_CONFIG.filter(model => model.type !== 'primary').forEach((config, index) => {
    const result = modelResults[index];
    if (result.status === 'fulfilled') {
      try {
        modelSummaries.push(summarizeDataset(result.value, config.id, config.label, targetHour));
      } catch { /* ignora modelo inválido */ }
    }
  });
  const consensus = computeConsensus(primarySummary, modelSummaries);
  state.lastConsensus = consensus;
  renderCurrent(primaryData, place, consensus);
  renderConsensus(consensus);
  renderRain(primaryData, consensus);
  renderHourly(primaryData, consensus);
  renderDaily(primaryData);
  renderModels(primarySummary, modelSummaries);
  saveRecentCity(place);
  document.dispatchEvent(new CustomEvent('climaradar:models-ready', {detail: {primary: primarySummary, models: [primarySummary, ...modelSummaries]}}));
  try {
    localStorage.setItem('climaradar-place', JSON.stringify({ name: place.name, admin1: place.admin1 || '', latitude: place.latitude, longitude: place.longitude }));
  } catch { /* armazenamento indisponível */ }
}

let searchTimeout;
$('#cityInput').addEventListener('input', event => {
  clearTimeout(searchTimeout);
  const text = event.target.value.trim();
  const token = ++state.searchId;
  if (text.length < 2) { showSuggestions([]); return; }
  searchTimeout = setTimeout(async () => {
    try {
      const results = await searchCities(text);
      if (token === state.searchId) showSuggestions(results);
    } catch {
      if (token === state.searchId) showSuggestions([]);
    }
  }, 280);
});
$('#searchForm').addEventListener('submit', async event => {
  event.preventDefault();
  clearTimeout(searchTimeout);
  const text = $('#cityInput').value.trim();
  if (text.length < 2) {
    notify('Digite pelo menos duas letras para pesquisar uma cidade.', true);
    return;
  }
  try {
    const results = await searchCities(text);
    if (!results.length) {
      notify('Nenhuma cidade brasileira encontrada com esse termo.', true);
      showSuggestions([]);
      return;
    }
    if (results.length === 1) loadPlace(results[0]);
    else showSuggestions(results);
  } catch (error) {
    notify('Não foi possível pesquisar cidades agora. ' + (error?.message || ''), true);
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.search-form')) $('#suggestions').classList.add('hidden');
});
$('#useLocation').addEventListener('click', () => {
  if (!navigator.geolocation) {
    notify('Seu navegador não oferece suporte à geolocalização.', true);
    return;
  }
  notify('Obtendo localização atual…');
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      const { latitude, longitude } = position.coords;
      const label = `Sua localização (${number(latitude, 2)}, ${number(longitude, 2)})`;
      $('#cityInput').value = label;
      await loadPlace({ name: 'Sua localização', admin1: '', latitude, longitude });
    } catch (error) {
      notify('A localização foi obtida, mas a previsão não pôde ser carregada. ' + (error?.message || ''), true);
    }
  }, err => {
    notify('Não foi possível acessar sua localização. ' + (err?.message || ''), true);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
});

function boot() {
  setCalibrationState();
  renderRecentCities();
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('climaradar-place')); } catch { return null; }
  })();
  const fallback = saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)
    ? saved
    : { name: 'São Joaquim da Barra', admin1: 'SP', latitude: -20.581, longitude: -47.859 };
  $('#cityInput').value = fallback.name;
  loadPlace(fallback);
}

boot();

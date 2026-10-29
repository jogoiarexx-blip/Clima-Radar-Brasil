/* ClimaRadar: parser de dados observados e métricas — não depende de navegador. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClimaAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  function csvLine(line, sep) {
    const fields = []; let value = '', quotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quotes && line[i + 1] === '"') { value += '"'; i++; }
        else quotes = !quotes;
      } else if (ch === sep && !quotes) { fields.push(value.trim()); value = ''; }
      else value += ch;
    }
    fields.push(value.trim()); return fields;
  }
  function numeric(raw) {
    if (raw === null || raw === undefined) return null;
    let x = String(raw).trim().replace(/\s+/g, '');
    if (!x || /^(NULL|NA|NAN|N\/A|--|-|9999(?:[.,]0*)?|9999[.,]9+)$/i.test(x)) return null;
    // Arquivos INMET usam vírgula decimal, outros usam ponto decimal.
    if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
    else x = x.replace(',', '.');
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(x)) return null;
    const number = Number(x);
    return Number.isFinite(number) && Math.abs(number) < 9999 ? number : null;
  }
  function hour(raw) {
    const v = String(raw ?? '').trim().replace(/\s*UTC\s*/ig, '').replace(/[hH]/g, ':');
    let h = null, m = 0;
    if (/^\d{1,2}:\d{1,2}$/.test(v)) { [h,m] = v.split(':').map(Number); }
    else if (/^\d{4}$/.test(v)) { h = Number(v.slice(0,2)); m = Number(v.slice(2)); }
    else if (/^\d{1,2}$/.test(v)) h = Number(v);
    return Number.isInteger(h) && h >= 0 && h < 24 && Number.isInteger(m) && m >= 0 && m < 60 ? { h, m } : null;
  }
  function dateUtc(raw) {
    const input = String(raw ?? '').trim();
    let y, m, d;
    let match = input.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)$/);
    if (match) { [,y,m,d] = match.map(String); }
    else {
      match = input.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})$/);
      if (!match) return null;
      [,d,m,y] = match;
    }
    const yy = Number(y), mm = Number(m), dd = Number(d);
    const stamp = new Date(Date.UTC(yy, mm - 1, dd));
    if (stamp.getUTCFullYear() !== yy || stamp.getUTCMonth() !== mm - 1 || stamp.getUTCDate() !== dd) return null;
    return `${String(yy).padStart(4,'0')}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  function pickColumn(head, tests) {
    return head.findIndex(key => tests.some(rx => rx.test(key)));
  }
  function parseObservations(raw) {
    const lines = String(raw).replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) throw new Error('Arquivo CSV vazio.');
    if (lines.length > 350000) throw new Error('CSV muito grande. Importe um período menor.');
    const sep = [';', '\t', ','].sort((a, b) => (lines.slice(0, 12).reduce((n,s)=>n+(s.split(b).length-1),0)) - (lines.slice(0, 12).reduce((n,s)=>n+(s.split(a).length-1),0)))[0];
    // Preferência por ponto e vírgula, para não dividir números decimais com vírgula.
    const delimiter = lines.some(l => /^(DATA|DATA.*HORA)/i.test(l) && l.includes(';')) || lines.slice(0,12).some(l => /^(LATITUDE|LONGITUDE|ESTACAO)/i.test(l) && l.includes(';')) ? ';' : sep;
    const metadata = { station: null, code: null, latitude: null, longitude: null };
    let headerIndex = -1, indices = null;
    lines.forEach((line, idx) => {
      if (idx > 55 || headerIndex >= 0) return;
      const parts = csvLine(line, delimiter); const label = normalize(parts[0]).replace(/:$/, '');
      if (label === 'LATITUDE') metadata.latitude = numeric(parts[1]);
      if (label === 'LONGITUDE') metadata.longitude = numeric(parts[1]);
      if (label === 'ESTACAO') metadata.station = parts.slice(1).join(' ').trim() || null;
      if (/^(CODIGO|CODIGO \(WMO\))/.test(label)) metadata.code = parts[1]?.trim() || null;
      const cols = parts.map(normalize);
      const day = pickColumn(cols, [/^DATA(?:\b|\s|\()/, /^DT_MEDICAO$/]);
      const hourIndex = pickColumn(cols, [/^HORA\b/, /^HR_MEDICAO$/, /HORA.*UTC/]);
      const temp = pickColumn(cols, [/TEMPERATURA.*BULBO SECO.*HORARIA/, /^TEMP_INST$/, /^TEMPERATURA$/, /^TEMPERATURA.*INSTANT/]);
      const rain = pickColumn(cols, [/^PRECIPITACAO TOTAL.*HORAR/, /^CHUVA$/, /^PRECIPITACAO$/, /^PRECIPITACAO HORARIA/]);
      if (day >= 0 && hourIndex >= 0 && (temp >= 0 || rain >= 0)) {
        indices = { day, hour: hourIndex, temp, rain }; headerIndex = idx;
      }
    });
    if (headerIndex < 0) throw new Error('Cabeçalho não reconhecido. Use o CSV horário original das estações automáticas INMET (Data, Hora UTC, Temperatura/Chuva).');
    if (metadata.latitude !== null && (metadata.latitude < -90 || metadata.latitude > 90)) metadata.latitude = null;
    if (metadata.longitude !== null && (metadata.longitude < -180 || metadata.longitude > 180)) metadata.longitude = null;
    const byHour = new Map(); let ignored = 0, duplicated = 0, invalid = 0;
    for (const line of lines.slice(headerIndex + 1)) {
      const cols = csvLine(line, delimiter);
      const date = dateUtc(cols[indices.day]), hh = hour(cols[indices.hour]);
      if (!date || !hh || hh.m !== 0) { ignored++; continue; }
      const temp = indices.temp >= 0 ? numeric(cols[indices.temp]) : null;
      const rain = indices.rain >= 0 ? numeric(cols[indices.rain]) : null;
      const safeTemp = temp !== null && temp >= -40 && temp <= 60 ? temp : null;
      const safeRain = rain !== null && rain >= 0 && rain <= 500 ? rain : null;
      if (safeTemp === null && safeRain === null) { invalid++; continue; }
      const time = `${date}T${String(hh.h).padStart(2, '0')}:00`;
      if (byHour.has(time)) duplicated++;
      byHour.set(time, { time, temp: safeTemp, rain: safeRain });
    }
    const observations = [...byHour.values()].sort((a,b) => a.time.localeCompare(b.time));
    if (!observations.length) throw new Error('Nenhuma medição horária válida no arquivo.');
    return { ...metadata, observations, ignored, duplicated, invalid, units: { temp: '°C', rain: 'mm/h' } };
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function evaluate(observations, hourly, lead = 1) {
    const time = hourly?.time;
    if (!Array.isArray(time)) throw new Error('API sem horários.');
    const temp = hourly[`temperature_2m_previous_day${lead}`];
    const rain = hourly[`precipitation_previous_day${lead}`];
    const index = new Map(time.map((t,i) => [String(t).slice(0,16),i]));
    let nTemp = 0, errTemp = 0, biasTemp = 0, nRain = 0, errRain = 0, hits = 0, rainRight = 0;
    for (const record of observations) {
      const i = index.get(record.time);
      if (i === undefined) continue;
      const predictedTemp = Array.isArray(temp) ? temp[i] : null;
      const predictedRain = Array.isArray(rain) ? rain[i] : null;
      if (finite(record.temp) && finite(predictedTemp) && predictedTemp > -90 && predictedTemp < 75) {
        const error = predictedTemp - record.temp;
        errTemp += Math.abs(error); biasTemp += error; nTemp++;
      }
      if (finite(record.rain) && finite(predictedRain) && predictedRain >= 0) {
        errRain += Math.abs(predictedRain - record.rain);
        rainRight += (predictedRain >= 0.2) === (record.rain >= 0.2) ? 1 : 0;
        hits += record.rain >= 0.2 ? 1 : 0;
        nRain++;
      }
    }
    return {
      nTemp, tempMae: nTemp ? errTemp / nTemp : null,
      tempBias: nTemp ? biasTemp / nTemp : null,
      nRain, rainMae: nRain ? errRain / nRain : null,
      rainHitRate: nRain ? rainRight / nRain * 100 : null,
      rainyHours: hits
    };
  }
  function distanceKm(lat1,lon1,lat2,lon2) {
    const radians = d => d * Math.PI / 180;
    const a = Math.sin(radians(lat2-lat1)/2)**2 + Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(radians(lon2-lon1)/2)**2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  return { normalize, csvLine, numeric, dateUtc, hour, parseObservations, evaluate, distanceKm };
});

/* Utilitários puros do radar. API RainViewer pública: somente quadros históricos. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClimaRadarMapCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const METADATA_ENDPOINT = 'https://api.rainviewer.com/public/weather-maps.json';
  const HOSTNAME = 'tilecache.rainviewer.com';
  function parseMetadata(input) {
    if (!input || typeof input !== 'object') throw new Error('Metadados do radar inválidos.');
    const hostUrl = new URL(input.host || '');
    if (hostUrl.protocol !== 'https:' || hostUrl.hostname !== HOSTNAME || hostUrl.username || hostUrl.password || hostUrl.port || hostUrl.search || hostUrl.hash) {
      throw new Error('Servidor de radar não autorizado.');
    }
    const frames = (Array.isArray(input.radar?.past) ? input.radar.past : [])
      .filter(f => Number.isInteger(f.time) && f.time > 0 && /^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(f.path))
      .map(f => ({ time: f.time, path: f.path }))
      .sort((a,b) => a.time - b.time)
      .filter((f, i, arr) => i === 0 || f.time !== arr[i-1].time);
    if (!frames.length) throw new Error('O radar não retornou quadros recentes.');
    return { host: hostUrl.origin, frames, generated: Number(input.generated) || null };
  }
  function tileTemplate(meta, frame) {
    if (!meta?.frames?.some(f => f.path === frame?.path)) throw new Error('Quadro não reconhecido.');
    // RainViewer desde jan/2026: esquema de cores 2 e zoom nativo máximo 7.
    return `${meta.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  }
  function ageMinutes(frameTime, now = Date.now()) { return Math.max(0, Math.floor((now - frameTime * 1000) / 60000)); }
  function isLatestFrameRecent(meta,now=Date.now(),limit=90){return !!meta?.frames?.length&&ageMinutes(meta.frames[meta.frames.length-1].time,now)<=limit;}
  return { METADATA_ENDPOINT, parseMetadata, tileTemplate, ageMinutes, isLatestFrameRecent };
});

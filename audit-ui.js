/* Auditoria de previsões históricas contra leituras locais fornecidas pelo visitante. */
(() => {
  'use strict';
  const $ = sel => document.querySelector(sel);
  const core = window.ClimaAudit;
  const models = [
    { id: 'ecmwf', label: 'ECMWF IFS', model: 'ecmwf_ifs' },
    { id: 'gfs', label: 'GFS Seamless', model: 'ncep_gfs_seamless' },
    { id: 'icon', label: 'ICON Global', model: 'icon_global' },
    { id: 'gem', label: 'GEM Canada', model: 'cmc_gem_seamless' }
  ];
  let station = null;
  let lastReport = null;
  let currentRun = 0;
  const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

  function status(message, type = '') {
    const target = $('#auditStatus');
    target.textContent = message;
    target.className = 'audit-feedback' + (type ? ' ' + type : '');
  }
  function getCoords() {
    const lat = Number($('#stationLat').value.replace(',', '.'));
    const lon = Number($('#stationLon').value.replace(',', '.'));
    if (!$('#stationLat').value.trim() || !$('#stationLon').value.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error('Informe a latitude e a longitude reais da estação do CSV. Não use automaticamente as coordenadas da cidade.');
    }
    return { latitude: lat, longitude: lon };
  }
  function distanceWarning(coords) {
    const place = window.ClimaRadarCurrentPlace;
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return 'Previsão calculada nas coordenadas da estação importada.';
    const distance = core.distanceKm(coords.latitude, coords.longitude, place.latitude, place.longitude);
    return `${number(distance, 0)} km entre a estação e a cidade pesquisada. ${distance > 50 ? 'A estação pode não representar o clima local da cidade.' : 'Mesmo perto, altitude e relevo ainda podem alterar a comparação.'}`;
  }
  async function fetchArchive(model, bounds, coords, lead) {
    const url = new URL('https://previous-runs-api.open-meteo.com/v1/forecast');
    Object.entries({
      ...coords,
      start_date: bounds.start,
      end_date: bounds.end,
      timezone: 'UTC',
      models: model.model,
      hourly: `temperature_2m_previous_day${lead},precipitation_previous_day${lead}`
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.error || !data.hourly?.time) throw new Error(data.reason || 'Série horária ausente');
      return data.hourly;
    } finally {
      clearTimeout(timeout);
    }
  }
  function cell(value, tag = 'td') {
    const el = document.createElement(tag);
    el.textContent = value;
    return el;
  }
  function buildCalibration(report) {
    // Somente pesos aprovados em um bloco cronológico NÃO usado no treino.
    if (report.lead !== 1 || !report.validation) return null;
    const ageDays = (Date.now() - Date.parse(report.end + 'T23:59:59Z')) / 86400000;
    if (!Number.isFinite(ageDays) || ageDays < -1 || ageDays > 45) return null;
    const place = window.ClimaRadarCurrentPlace;
    if (place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude) &&
        core.distanceKm(place.latitude,place.longitude,report.coords.latitude,report.coords.longitude)>50) return null;
    const {temp,rain}=report.validation;
    if (!temp?.eligible && !rain?.eligible) return null;
    return {
      version: 3, createdAt:new Date().toISOString(), station:report.stationName,
      coords:report.coords,start:report.start,end:report.end,lead:report.lead,
      weights:{temp:temp?.eligible?temp.weights:null,rain:rain?.eligible?rain.weights:null},
      validation:{
        temp:{eligible:!!temp?.eligible,trainHours:temp?.trainHours||0,holdoutHours:temp?.holdoutHours||0,
          baselineMae:temp?.baseMae??null,tunedMae:temp?.tunedMae??null,
          improvementPct:temp?.improvementPct??null},
        rain:{eligible:!!rain?.eligible,trainHours:rain?.trainHours||0,holdoutHours:rain?.holdoutHours||0,
          baselineMae:rain?.baseMae??null,tunedMae:rain?.tunedMae??null,
          improvementPct:rain?.improvementPct??null}
      },
      note:'Pesos liberados por validação cronológica com 24h de embargo. Validade local e temporária, sem garantia futura.'
    };
  }
  function renderHoldout(report) {
    const result=report.validation;
    const panel=$('#holdoutPanel');
    if (!panel || !result) return;
    const available=!!buildCalibration(report);
    const badge=$('#holdoutBadge');
    const foundGain=!!(result.temp?.eligible||result.rain?.eligible);
    badge.textContent=available?'Ajuste validado na amostra':foundGain?'Ganho observado · uso bloqueado':'Sem ganho comprovado';
    badge.className='holdout-badge'+(available?' is-approved':'');
    const format=(v,units)=>Number.isFinite(v)?`${number(v,2)} ${units}`:'—';
    const label=(info)=>info.eligible?'Melhora confirmada':'Sem ajuste';
    const titles=[['Temperatura',result.temp,'°C'],['Precipitação',result.rain,'mm/h']];
    const holder=$('#holdoutMetrics');holder.replaceChildren();
    for(const [title,info,units] of titles) {
      const card=document.createElement('div');card.className='holdout-metric';
      const heading=document.createElement('strong');heading.textContent=title;
      const statusText=document.createElement('span');statusText.textContent=label(info);
      const stat=document.createElement('p');
      stat.textContent=`Erro original ${format(info.baseMae,units)} · com pesos ${format(info.tunedMae,units)}`;
      const detail=document.createElement('small');
      detail.textContent=`Treino ${info.trainHours}h · teste ${info.holdoutHours}h · ${info.reason}`;
      card.append(heading,statusText,stat,detail);holder.appendChild(card);
    }
    const validDays=result.temp?.holdoutStart||result.rain?.holdoutStart;
    $('#holdoutDescription').textContent=validDays
      ?`Validação reservada: ${validDays} a ${result.temp?.holdoutEnd||result.rain?.holdoutEnd} (UTC), separados do treino por 24h. O resultado usa as mesmas horas de cada variável para os modelos elegíveis.`
      :'Não há dados suficientes para uma validação cronológica independente.';
    $('#holdoutLimits').textContent='Somente uma estação e um curto intervalo histórico; melhora no teste reservado não garante desempenho futuro em outros locais ou eventos. Quando não existe ganho mensurável, permanecem os pesos padrão.';
  }
  function renderReport(report) {
    $('#auditResult').classList.remove('hidden');
    const body = $('#auditBody');
    body.replaceChildren();
    const withTemp = report.rows.filter(row => row.result && row.result.nTemp >= 24).sort((a, b) => a.result.tempMae - b.result.tempMae);
    const winner = withTemp[0];
    report.rows.forEach(row => {
      const tr = document.createElement('tr');
      const r = row.result;
      tr.append(
        cell(row.label),
        cell(r ? String(r.nTemp) : '—'),
        cell(r ? `${number(r.tempMae, 2)} °C` : '—'),
        cell(r ? `${number(r.tempBias, 2)} °C` : '—'),
        cell(r && r.nRain ? `${number(r.rainMae, 2)} mm/h` : '—'),
        cell(r && r.wetHours ? `${number(r.rainMaeWet, 2)} mm/h` : '—'),
        cell(row.error ? 'Indisponível: ' + row.error : (r?.nTemp < 24 ? 'Amostra insuficiente' : 'Comparado'))
      );
      if (winner && winner.id === row.id) tr.classList.add('best-model');
      body.appendChild(tr);
    });
    $('#auditHeadline').textContent = winner ? `${winner.label}: menor erro médio de temperatura nesta amostra` : 'Sem amostra suficiente para classificar os modelos';
    $('#auditInterpretation').textContent = winner
      ? `O ${winner.label} teve erro absoluto médio de ${number(winner.result.tempMae, 2)} °C em ${winner.result.nTemp} horas válidas. A comparação usa as mesmas horas para todos os modelos elegíveis. Não comprova superioridade futura.`
      : 'São necessárias pelo menos 24 horas válidas e simultâneas em dois modelos para compará-los. Confira a data do arquivo e a disponibilidade das previsões arquivadas.';
    $('#auditScope').textContent = `Estação: ${report.stationName} · Período (UTC): ${report.start} a ${report.end} · Antecedência: ${report.lead * 24}h · Observações no período: ${report.observations.length} · Horas comuns temperatura: ${report.comparable?.commonTempHours ?? 0} · Horas comuns chuva: ${report.comparable?.commonRainHours ?? 0} · ${distanceWarning(report.coords)}`;
    $('#exportAudit').disabled = false;
    renderHoldout(report);
    $('#applyAuditCalibration').disabled = !buildCalibration(report);
    $('#auditCalibrationNote').textContent = buildCalibration(report)
      ? 'Pesos liberados apenas nas variáveis com redução de erro no bloco temporal reservado. Aplicação limitada à estação, a 50 km e por 45 dias.'
      : 'Pesos bloqueados: falta ganho suficiente no teste reservado, dados atuais ou proximidade da estação (até 50 km). Os pesos padrão permanecem ativos.';
  }

  $('#stationCsv').addEventListener('change', async event => {
    currentRun++;
    station = null;
    lastReport = null;
    $('#auditResult').classList.add('hidden');
    $('#exportAudit').disabled = true;
    $('#applyAuditCalibration').disabled = true;
    $('#compareAudit').disabled = false;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      status('Arquivo acima de 10 MB. Extraia somente uma estação e um período menor.', 'error');
      return;
    }
    try {
      const content = await file.text();
      station = core.parseObservations(content);
      $('#stationLat').value = Number.isFinite(station.latitude) ? String(station.latitude) : '';
      $('#stationLon').value = Number.isFinite(station.longitude) ? String(station.longitude) : '';
      const first = station.observations[0].time.slice(0, 10);
      const last = station.observations.at(-1).time.slice(0, 10);
      $('#stationInfo').textContent = `${station.station || file.name}${station.code ? ' (' + station.code + ')' : ''} · ${station.observations.length} horários válidos · ${first} a ${last} (UTC) · ${station.invalid} leituras descartadas · ${station.duplicated} horários duplicados.`;
      status('Arquivo importado localmente. Confirme as coordenadas e clique em Comparar modelos.', 'ok');
    } catch (error) {
      station = null;
      $('#stationInfo').textContent = 'Arquivo não reconhecido.';
      status(error.message || 'Não foi possível interpretar o arquivo.', 'error');
    }
  });

  $('#auditForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!station) { status('Importe primeiro um CSV horário do INMET.', 'error'); return; }
    let coords;
    try { coords = getCoords(); } catch (error) { status(error.message, 'error'); return; }
    const lead = Number($('#auditLead').value);
    if (![1, 2, 3].includes(lead)) { status('Antecedência inválida.', 'error'); return; }
    const maxUtc = new Date().toISOString().slice(0, 13) + ':00';
    const usable = station.observations.filter(obs => obs.time <= maxUtc);
    if (!usable.length) { status('O CSV não contém observações passadas válidas para comparação.', 'error'); return; }
    const lastDay = usable.at(-1).time.slice(0, 10);
    const end = new Date(lastDay + 'T00:00:00Z');
    const begin = new Date(end.getTime() - 13 * 86400000).toISOString().slice(0, 10);
    const subset = usable.filter(obs => obs.time.slice(0, 10) >= begin);
    if (!subset.length) { status('Sem registros nos últimos 14 dias do arquivo.', 'error'); return; }
    const run = ++currentRun;
    $('#compareAudit').disabled = true;
    $('#exportAudit').disabled = true;
    $('#applyAuditCalibration').disabled = true;
    $('#auditResult').classList.add('hidden');
    status('Comparando modelos com previsões históricas emitidas antes das observações…');
    const outcomes = await Promise.allSettled(models.map(model => fetchArchive(model, { start: begin, end: lastDay }, coords, lead)));
    if (run !== currentRun) return;
    $('#compareAudit').disabled = false;
    const candidates = models.map((model, index) => {
      const outcome = outcomes[index];
      return outcome.status === 'fulfilled'
        ? { ...model, hourly: outcome.value }
        : { ...model, error: outcome.reason?.name === 'AbortError'
          ? 'tempo excedido' : String(outcome.reason?.message || 'erro de rede').slice(0, 100) };
    });
    const comparable = core.evaluateComparable(subset, candidates, lead);
    const validation = window.ClimaValidation.validate(subset, candidates, lead);
    const rows = comparable.rows.map(row => ({
      id: row.id, label: row.label, result: row.result,
      error: row.error || (!row.result?.nTemp && !row.result?.nRain ? 'Sem amostra comum válida' : null)
    }));
    lastReport = { rows, comparable, validation, stationName: station.station || 'Estação importada',
      coords, start: begin, end: lastDay, lead, observations: subset };
    renderReport(lastReport);
    const available = rows.filter(row => row.result && row.result.nTemp > 0).length;
    status(available ? `Auditoria concluída: ${available} modelo(s) com temperatura comparável.` : 'Os modelos não retornaram valores comparáveis. Veja os detalhes na tabela.', available ? 'ok' : 'error');
  });

  $('#applyAuditCalibration').addEventListener('click', () => {
    if (!lastReport) return;
    const calibration = buildCalibration(lastReport);
    if (!calibration) {
      status('Os pesos não passaram na validação temporal reservada ou os dados são insuficientes.', 'error');
      return;
    }
    if (typeof window.ClimaRadarSetCalibration === 'function') {
      window.ClimaRadarSetCalibration(calibration);
      status('Ajuste v3 aplicado apenas às variáveis aprovadas no teste reservado. Validade de 45 dias e até 50 km da estação.', 'ok');
    } else {
      status('A interface principal ainda não está pronta para receber calibração.', 'error');
    }
  });

  $('#clearAuditCalibration').addEventListener('click', () => {
    if (typeof window.ClimaRadarClearCalibration === 'function') {
      window.ClimaRadarClearCalibration();
      status('Calibração local removida. O consenso voltou aos pesos padrão.', 'ok');
    }
  });

  $('#exportAudit').addEventListener('click', () => {
    if (!lastReport) return;
    const csv = [
      ['modelo', 'antecedencia_h', 'estacao', 'latitude', 'longitude', 'inicio_utc', 'fim_utc', 'n_temp', 'mae_temp_c', 'bias_temp_c', 'n_chuva', 'mae_chuva_mm_h', 'horas_com_chuva_observada', 'mae_chuva_eventos_mm_h', 'status', 'temp_mae_base_teste', 'temp_mae_ajustado_teste', 'temp_melhora_aprovada', 'chuva_mae_base_teste', 'chuva_mae_ajustado_teste', 'chuva_melhora_aprovada', 'treino_temp_h', 'teste_temp_h', 'treino_chuva_h', 'teste_chuva_h'],
      ...lastReport.rows.map(row => [
        row.label,
        lastReport.lead * 24,
        lastReport.stationName,
        lastReport.coords.latitude,
        lastReport.coords.longitude,
        lastReport.start,
        lastReport.end,
        row.result?.nTemp ?? '',
        row.result?.tempMae ?? '',
        row.result?.tempBias ?? '',
        row.result?.nRain ?? '',
        row.result?.rainMae ?? '',
        row.result?.rainyHours ?? '',
        row.result?.rainMaeWet ?? '',
        row.error || (row.result?.nTemp < 24 ? 'amostra insuficiente' : 'ok'),
        lastReport.validation?.temp?.baseMae??'',lastReport.validation?.temp?.tunedMae??'',lastReport.validation?.temp?.eligible?'sim':'não',
        lastReport.validation?.rain?.baseMae??'',lastReport.validation?.rain?.tunedMae??'',lastReport.validation?.rain?.eligible?'sim':'não',
        lastReport.validation?.temp?.trainHours??'',lastReport.validation?.temp?.holdoutHours??'',lastReport.validation?.rain?.trainHours??'',lastReport.validation?.rain?.holdoutHours??''
      ])
    ].map(values => values.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'climaradar-auditoria-' + lastReport.end + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
})();

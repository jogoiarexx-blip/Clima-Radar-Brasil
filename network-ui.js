/* ClimaRadar v0.9 — auditoria por UF, regiao e antecedencia; dados CSV processados no navegador. */
(() => {
  'use strict';
  const $=q=>document.querySelector(q);
  const models=[
    {id:'ecmwf',label:'ECMWF IFS',model:'ecmwf_ifs'},
    {id:'gfs',label:'GFS',model:'ncep_gfs_seamless'},
    {id:'icon',label:'ICON',model:'icon_global'},
    {id:'gem',label:'GEM',model:'cmc_gem_seamless'}
  ];
  const labels=Object.fromEntries(models.map(m=>[m.id,m.label]));
  const leads=[1,2,3];
  const nf=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)
    ? v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  let runId=0;
  let controller=null;
  let report=null;
  function setStatus(text){$('#networkStatus').textContent=text;}
  function setBusy(busy){$('#networkCompare').disabled=busy;$('#networkCancel').disabled=!busy;$('#networkCsv').disabled=busy;$('#networkLead').disabled=busy;$('#networkDays').disabled=busy;}
  async function json(url,signal){
    const local=new AbortController();
    const timer=setTimeout(()=>local.abort(),26000);
    if(signal) {
      if(signal.aborted)local.abort();
      else signal.addEventListener('abort',()=>local.abort(),{once:true});
    }
    try{
      const response=await fetch(url,{signal:local.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(data.error||!Array.isArray(data.hourly?.time))throw Error(data.reason||'Histórico não disponível');
      return data.hourly;
    }finally{clearTimeout(timer);}
  }
  function dateShift(iso,days){
    const ms=Date.parse(iso+'T00:00:00Z')+days*86400000;
    return new Date(ms).toISOString().slice(0,10);
  }
  function safeCsvValue(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
  function cell(value){const td=document.createElement('td');td.textContent=String(value??'—');return td;}
  async function readStations(files,days){
    if(files.length<3||files.length>6)throw Error('Selecione de 3 a 6 arquivos CSV de estações distintas.');
    if(files.some(file=>file.size>8*1024*1024))throw Error('Cada arquivo deve ter, no máximo, 8 MB.');
    const stations=[];
    for(let i=0;i<files.length;i++){
      const file=files[i];
      setStatus(`Importando CSV ${i+1}/${files.length}: ${file.name}`);
      const parsed=window.ClimaAudit.parseObservations(await file.text());
      if(!Number.isFinite(parsed.latitude)||!Number.isFinite(parsed.longitude))
        throw Error(`${file.name}: CSV sem latitude/longitude. Use um arquivo original INMET com identificação da estação.`);
      const latestUtc=new Date().toISOString().slice(0,13)+':00';
      const past=parsed.observations.filter(row=>row.time<=latestUtc);
      if(past.length<96)throw Error(`${file.name}: menos de 96 observações anteriores disponíveis.`);
      const end=past.at(-1).time.slice(0,10);
      const start=dateShift(end,1-days);
      const observations=past.filter(row=>row.time.slice(0,10)>=start);
      const station={uf:window.ClimaRegional.ufFromMetadata(parsed.uf),id:parsed.code||`${parsed.latitude.toFixed(3)},${parsed.longitude.toFixed(3)}`,
        name:parsed.station||file.name,coords:{lat:parsed.latitude,lon:parsed.longitude},
        start,end,observations,candidates:[]};
      // Erros de digitação e arquivos duplicados são detectados antes das requisições.
      for(const other of stations){
        if(station.id===other.id||window.ClimaNetwork.distanceKm(station.coords,other.coords)<10)
          throw Error(`${station.name}: estação repetida ou a menos de 10 km de ${other.name}.`);
      }
      stations.push(station);
    }
    return stations;
  }
  async function loadCandidates(stations,lead,signal,run){
    const tasks=stations.flatMap(station=>models.map(model=>({station,model})));
    let index=0,done=0;
    const concurrency=3;
    async function worker(){
      while(index<tasks.length){
        if(run!==runId||signal.aborted)throw Error('Análise cancelada.');
        const task=tasks[index++];
        const params=new URLSearchParams({latitude:String(task.station.coords.lat),longitude:String(task.station.coords.lon),
          start_date:task.station.start,end_date:task.station.end,timezone:'UTC',models:task.model.model,
          hourly:(lead===0?leads:[lead]).flatMap(n=>[`temperature_2m_previous_day${n}`,`precipitation_previous_day${n}`]).join(',')});
        const url='https://previous-runs-api.open-meteo.com/v1/forecast?'+params;
        try{
          const hourly=await json(url,signal);
          task.station.candidates.push({...task.model,hourly});
        }catch(err){
          if(signal.aborted)throw Error('Análise cancelada.');
          task.station.candidates.push({...task.model,error:err.message||'falha de rede'});
        }
        done++;
        if(run===runId)setStatus(`Consultando históricos: ${done}/${tasks.length} solicitações concluídas · ${task.station.name}`);
      }
    }
    await Promise.all(Array.from({length:concurrency},()=>worker()));
  }
  function metricCard(kind,detail){
    const card=document.createElement('div');card.className='network-metric';
    const title=document.createElement('strong');title.textContent=kind==='temp'?'Temperatura':'Chuva';
    const main=document.createElement('p');
    const unit=kind==='temp'?'°C':'mm/h';
    main.textContent=`${nf(detail.baseMae)} → ${nf(detail.tunedMae)} ${unit}`;
    const note=document.createElement('small');
    note.textContent=detail.validStations
      ? `${detail.validStations} estações testadas · ${nf(detail.improvementPct,1)}% de mudança · ${detail.eligible?'Melhora na amostra':'Ajuste não aprovado'} · ${detail.reason}`
      : detail.reason;
    card.append(title,main,note);return card;
  }
  function render(result){
    $('#networkResult').classList.remove('hidden');
    const ok=result.temp.eligible||result.rain.eligible;
    const badge=$('#networkBadge');
    badge.textContent=ok?'Ganho observado na amostra':'Sem ganho consistente';
    badge.className='holdout-badge'+(ok?' is-approved':'');
    $('#networkHeadline').textContent=`${result.stationCount} estações · previsão ${result.lead*24}h antes`;
    $('#networkMetrics').replaceChildren(metricCard('temp',result.temp),metricCard('rain',result.rain));
    const robustness=window.ClimaRobustness.summarize(result);
    const cards=$('#networkRobustnessCards');cards.replaceChildren();
    for(const [kind,info] of [['Temperatura',robustness.temp],['Chuva',robustness.rain]]){
      const card=document.createElement('article');card.className='network-robustness-card';
      const heading=document.createElement('strong');heading.textContent=kind;
      const total=document.createElement('p');total.textContent=`${info.improved}/${info.n} estações melhoraram · ${info.worsened} pioraram · ${info.stable} sem mudança`;
      const interval=document.createElement('p');
      const unit=kind==='Temperatura'?'°C':'mm/h';
      interval.textContent=info.limited?'Amostra pequena; não há classificação de consistência.' :
        `Ganho médio ${nf(info.gain,3)} ${unit} · faixa exploratória ${nf(info.range.low,3)} a ${nf(info.range.high,3)} ${unit}`;
      const resultNote=document.createElement('small');resultNote.textContent=info.reason;
      const status=document.createElement('span');status.className='network-robustness-state';
      status.textContent=info.consistent?'Consistente nesta amostra':info.limited?'Amostra limitada':'Sem consistência demonstrada';
      status.dataset.level=info.consistent?'positive':info.limited?'limited':'uncertain';
      card.append(heading,status,total,interval,resultNote);cards.append(card);
    }
    const summaries=[];
    for(const [name,data] of [['Temperatura',result.temp],['Chuva',result.rain]]){
      if(data.models?.length)summaries.push(name+': '+data.models.map(m=>`${labels[m.id]||m.id} ${nf(m.mae)} ${name==='Chuva'?'mm/h':'°C'}`).join(' · '));
    }
    $('#networkModelSummary').textContent=summaries.join(' | ')||'Sem modelos suficientes para comparação.';
    const rows=$('#networkRows');rows.replaceChildren();
    const t=new Map(result.temp.stations.map(item=>[item.id,item]));
    const r=new Map(result.rain.stations.map(item=>[item.id,item]));
    for(const target of result.stationInputs){
      const stationName=target.name;
      const temp=t.get(target.id),rain=r.get(target.id);
      const tr=document.createElement('tr');
      tr.append(cell(stationName),cell(nf(temp?.baseMae)),cell(nf(temp?.tunedMae)),
        cell(nf(rain?.baseMae)),cell(nf(rain?.tunedMae)),
        cell(Math.max(temp?.holdoutHours||0,rain?.holdoutHours||0)),
        cell((temp?.valid||rain?.valid)?'Amostra testada':temp?.reason||rain?.reason||'Sem dados'));
      rows.append(tr);
    }
    $('#networkExport').disabled=false;
  }
  function renderRegional(regional){
    const coverage=regional.coverage;
    $('#regionalCoverage').textContent=`Amostra enviada: ${coverage.stations} estações · ${coverage.states} UF(s) identificada(s) · ${coverage.regions} região(ões) identificada(s)${coverage.withoutUf?` · ${coverage.withoutUf} estação(ões) sem UF`:''}. ${coverage.regions<5?'Cobertura parcial; não representa a precisão nacional.':'Mesmo com cinco regiões, a seleção de estações não é amostra nacional representativa.'}`;
    const kind=$('#regionalMetric').value;
    const rows=$('#regionalRows');rows.replaceChildren();
    const options=regional.rows.filter(r=>r.kind===kind);
    for(const item of options){
      const row=document.createElement('tr');
      row.append(cell(item.region),cell(item.lead*24+'h'),cell(`${item.stationCount}${item.limited?' · amostra pequena':''}`));
      const values=['ecmwf','gfs','icon','gem'].map(id=>item.models[id]);
      const eligibleValues=values.filter(Number.isFinite);
      const minimum=eligibleValues.length?Math.min(...eligibleValues):null;
      for(const value of values){
        const td=cell(Number.isFinite(value)?nf(value,2):'—');
        if(minimum!==null&&value===minimum&&eligibleValues.length>1)td.classList.add('regional-cell-best');
        row.append(td);
      }
      row.append(cell(nf(item.baseMae)),cell(nf(item.tunedMae)));
      if(item.region==='UF não informada')row.classList.add('regional-unmapped');
      rows.append(row);
    }
    if(!options.length){const row=document.createElement('tr');const td=cell('Não há estações com dados históricos suficientes para esta variável e antecedência.');td.colSpan=9;row.append(td);rows.append(row);}
  }
  $('#regionalMetric').addEventListener('change',()=>{if(report)renderRegional(report.regional);});
  $('#networkResultLead').addEventListener('change',()=>{
    if(!report)return;
    const current=report.snapshots.find(shot=>shot.lead===Number($('#networkResultLead').value));
    if(current){current.result.stationInputs=report.stationInputs;render(current.result);}
  });
  $('#networkForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const files=[...$('#networkCsv').files];
    const lead=Number($('#networkLead').value);
    const days=Number($('#networkDays').value);
    const run=++runId;
    if(controller)controller.abort();controller=new AbortController();
    report=null;$('#networkResult').classList.add('hidden');$('#networkExport').disabled=true;
    setBusy(true);
    try{
      const stations=await readStations(files,days);
      await loadCandidates(stations,lead,controller.signal,run);
      if(run!==runId||controller.signal.aborted)return;
      const snapshots=(lead===0?leads:[lead]).map(n=>({lead:n,result:window.ClimaNetwork.evaluate(stations,n)}));
      const stationInputs=stations.map(({id,name,uf})=>({id,name,uf}));
      const regional=window.ClimaRegional.summarize(snapshots,stationInputs);
      report={snapshots,regional,stationInputs};
      const selector=$('#networkResultLead');
      [...selector.options].forEach(opt=>{opt.disabled=!snapshots.some(s=>String(s.lead)===opt.value);});
      selector.value=String(snapshots[0].lead);
      snapshots[0].result.stationInputs=stationInputs;
      render(snapshots[0].result);
      renderRegional(regional);
      setStatus(`Concluído: ${stations.length} estações, até ${days} dias por CSV, ${snapshots.length} antecedência(s). Somente as estações enviadas estão incluídas; não há validação nacional.`);
    }catch(err){
      if(run===runId)setStatus(err.message||'Não foi possível realizar a comparação.');
    }finally{if(run===runId)setBusy(false);}
  });
  $('#networkCancel').addEventListener('click',()=>{
    runId++;if(controller)controller.abort();setBusy(false);setStatus('Análise cancelada.');
  });
  $('#networkExport').addEventListener('click',()=>{
    if(!report)return;
    const lines=[['tipo','antecedencia_h','variavel','regiao','uf','estacao','valida','inicio','fim','horas_teste','mae_base','mae_ajustado','mae_ecmwf','mae_gfs','mae_icon','mae_gem','resultado','ganho_estacao','ganho_robusto_na_amostra','estacoes_melhoraram','faixa_reamostragem_inf','faixa_reamostragem_sup']];
    const stationById=new Map(report.stationInputs.map(x=>[x.id,x]));
    for(const shot of report.snapshots){
      for(const [kind,data] of [['temperatura',shot.result.temp],['chuva',shot.result.rain]]){
        const robustness=window.ClimaRobustness.analyze(data,kind);
        for(const item of data.stations){
          const sta=stationById.get(item.id);
          lines.push(['estacao',shot.lead*24,kind,window.ClimaRegional.regionForUf(sta?.uf)||'UF não informada',sta?.uf||'',item.name,item.valid?'sim':'não',item.holdoutStart||'',item.holdoutEnd||'',item.holdoutHours||0,item.baseMae??'',item.tunedMae??'',item.modelMae?.ecmwf??'',item.modelMae?.gfs??'',item.modelMae?.icon??'',item.modelMae?.gem??'',item.reason||data.reason,item.valid?(item.baseMae-item.tunedMae):'',robustness.consistent?'sim':'não',robustness.improved,robustness.range?.low??'',robustness.range?.high??'']);
        }
      }
    }
    for(const item of report.regional.rows){
      lines.push(['regiao',item.lead*24,item.kind==='temp'?'temperatura':'chuva',item.region,'','',item.limited?'amostra pequena':'descritivo','','',item.hours,item.baseMae??'',item.tunedMae??'',item.models.ecmwf??'',item.models.gfs??'',item.models.icon??'',item.models.gem??'','agregado por estação','','','','','']);
    }
    const csv='\ufeff'+lines.map(line=>line.map(safeCsvValue).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='climaradar-v13-robustez-regional.csv';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  });
})();

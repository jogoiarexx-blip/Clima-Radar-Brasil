/* ClimaRadar v0.9: agregacao regional DESCRITIVA da amostra, sem inferir limites geograficos. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ClimaRegional=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const GROUPS={
    Norte:'AC AM AP PA RO RR TO',
    Nordeste:'AL BA CE MA PB PE PI RN SE',
    'Centro-Oeste':'DF GO MT MS',
    Sudeste:'ES MG RJ SP',
    Sul:'PR RS SC'
  };
  const STATES={
    AC:'ACRE',AL:'ALAGOAS',AP:'AMAPA',AM:'AMAZONAS',BA:'BAHIA',CE:'CEARA',DF:'DISTRITO FEDERAL',ES:'ESPIRITO SANTO',GO:'GOIAS',MA:'MARANHAO',MT:'MATO GROSSO',MS:'MATO GROSSO DO SUL',MG:'MINAS GERAIS',PA:'PARA',PB:'PARAIBA',PR:'PARANA',PE:'PERNAMBUCO',PI:'PIAUI',RJ:'RIO DE JANEIRO',RN:'RIO GRANDE DO NORTE',RS:'RIO GRANDE DO SUL',RO:'RONDONIA',RR:'RORAIMA',SC:'SANTA CATARINA',SP:'SAO PAULO',SE:'SERGIPE',TO:'TOCANTINS'
  };
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const clean=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z ]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
  function ufFromMetadata(raw){
    const text=clean(raw);
    if(Object.hasOwn(STATES,text))return text;
    return Object.keys(STATES).find(uf=>STATES[uf]===text)||null;
  }
  function regionForUf(raw){
    const uf=ufFromMetadata(raw);
    if(!uf)return null;
    return Object.keys(GROUPS).find(group=>GROUPS[group].split(' ').includes(uf))||null;
  }
  const round=x=>finite(x)?Math.round(x*1000)/1000:null;
  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
  /* 
   * snapshots = [{lead, result: ClimaNetwork.evaluate(...)}], stations = [{id,uf}].
   * Cada entrada validada tem exatamente 1 voto por estacao, nao por hora.
   * Falta de dados fica null, nunca 0.
   */
  function summarize(snapshots,stations){
    const byId=new Map(stations.map(s=>[String(s.id),s]));
    const rows=[];
    for(const shot of snapshots){
      for(const kind of ['temp','rain']){
        const data=shot.result?.[kind];
        if(!data)continue;
        const groups=new Map();
        for(const entry of data.stations||[]){
          if(!entry.valid||!finite(entry.baseMae))continue;
          const station=byId.get(String(entry.id));
          const region=regionForUf(station?.uf)||'UF não informada';
          if(!groups.has(region))groups.set(region,[]);
          groups.get(region).push(entry);
        }
        for(const [region,entries] of groups){
          const modelIds=Array.isArray(data.modelIds)?data.modelIds:[];
          const models=Object.fromEntries(modelIds.map(id=>[id,round(mean(entries.map(e=>e.modelMae?.[id]).filter(finite)))]));
          rows.push({lead:shot.lead,kind,region,stationCount:entries.length,
            stationIds:entries.map(e=>e.id),
            hours:entries.reduce((acc,e)=>acc+(e.holdoutHours||0),0),
            baseMae:round(mean(entries.map(e=>e.baseMae))),
            tunedMae:round(mean(entries.map(e=>e.tunedMae).filter(finite))),models,
            limited:region==='UF não informada'||entries.length<3});
        }
      }
    }
    rows.sort((a,b)=>a.kind.localeCompare(b.kind)||a.lead-b.lead||a.region.localeCompare(b.region,'pt-BR'));
    const knownUfs=new Set(stations.map(s=>ufFromMetadata(s.uf)).filter(Boolean));
    const coveredRegions=new Set([...knownUfs].map(regionForUf).filter(Boolean));
    return {rows,coverage:{stations:stations.length,states:knownUfs.size,regions:coveredRegions.size,
      regionNames:[...coveredRegions].sort((a,b)=>a.localeCompare(b,'pt-BR')),
      withoutUf:stations.filter(s=>!ufFromMetadata(s.uf)).length,
      national:false},allLeads:snapshots.map(s=>s.lead)};
  }
  return {ufFromMetadata,regionForUf,summarize};
});

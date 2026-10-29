/* ClimaRadar v0.8 — comparacao espacial/temporal fora da amostra.
 * Esta biblioteca opera somente sobre previsoes historicas observadas.
 * Nunca gera pesos para o forecast ao vivo sem validacao local posterior.
 */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports ? require('./validation-core.js') : root.ClimaValidation);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ClimaNetwork=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(validation){
  'use strict';
  const BASE=validation.BASE;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const day=t=>String(t).slice(0,10);
  const HOUR=3600000;
  const utc=d=>Date.parse(d+'T00:00:00Z');
  const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  function distanceKm(a,b){
    const rad=x=>x*Math.PI/180;
    const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);
    const v=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
    return 6371*2*Math.asin(Math.min(1,Math.sqrt(v)));
  }
  function standardize(input,lead=1){
    if(!input||!input.coords||!finite(input.coords.lat)||!finite(input.coords.lon))throw Error('Estacao sem coordenadas validas.');
    if(!Array.isArray(input.observations))throw Error('Estacao sem observacoes.');
    const models=Array.isArray(input.candidates)?input.candidates:[];
    const temp=validation.commonRecords(input.observations,models,'temp',lead);
    const rain=validation.commonRecords(input.observations,models,'rain',lead);
    return {id:String(input.id||input.name||'estacao'),name:String(input.name||input.id||'Estacao'),coords:input.coords,temp,rain,
      hours:input.observations.length};
  }
  function getModelIntersection(stations,kind){
    const ids=Object.keys(BASE).filter(id=>stations.every(s=>s[kind].ids.includes(id)));
    return ids;
  }
  function evaluateKind(stations,kind){
    const modelIds=getModelIntersection(stations,kind);
    const fail=reason=>({kind,eligible:false,reason,modelIds,stations:[],stationCount:0,
      baseMae:null,tunedMae:null,improvementPct:null,models:[],testHours:0,trainHours:0,validStations:0});
    if(stations.length<3)return fail('Mínimo de 3 estações distintas.');
    if(modelIds.length<2)return fail('Menos de dois modelos com dados comuns em todas as estações.');
    const prepared=stations.map(station=>{
      const rows=station[kind].rows.filter(row=>modelIds.every(id=>finite(row.pred[id])))
        .map(row=>({...row,pred:Object.fromEntries(modelIds.map(id=>[id,row.pred[id]]))}));
      const days=[...new Set(rows.map(row=>day(row.iso)))].sort();
      const start=days.length>=2?utc(days.at(-2)):NaN;
      const holdout=rows.filter(row=>finite(start)&&row.time>=start);
      return {...station,rows,days,start,holdout};
    });
    const details=[];
    for(const target of prepared){
      const skipped=(reason)=>details.push({id:target.id,name:target.name,reason,valid:false,trainHours:0,holdoutHours:target.holdout.length});
      if(target.days.length<6 || !finite(target.start)) {skipped('Menos de 6 dias comuns.');continue;}
      if(target.holdout.length<24 || new Set(target.holdout.map(r=>day(r.iso))).size<2){skipped('Teste precisa de 24 horas em dois dias.');continue;}
      const trainEnd=target.start-24*HOUR;
      const other=prepared.filter(s=>s.id!==target.id).map(s=>({...s,train:s.rows.filter(row=>row.time<trainEnd)}));
      const trainStations=other.filter(s=>s.train.length>=72 &&
        (kind==='temp'||s.train.filter(row=>row.obs>=0.2).length>=5));
      if(trainStations.length<2){skipped('Treino precisa de duas outras estações com 72h antes da janela reservada.');continue;}
      const trainHours=trainStations.reduce((s,x)=>s+x.train.length,0);
      const wetHours=target.holdout.filter(row=>row.obs>=0.2).length;
      if(kind==='rain'&&wetHours<3){skipped('Teste não possui 3 horas com chuva observada.');continue;}
      const errorByModel={};
      for(const id of modelIds){
        const stationErrors=trainStations.map(s=>{
          const subset=kind==='rain'?s.train.filter(row=>row.obs>=0.2):s.train;
          return mean(subset.map(row=>Math.abs(row.pred[id]-row.obs)));
        }).filter(finite);
        errorByModel[id]=mean(stationErrors); // cada estação contribui uma vez
      }
      const scores=Object.fromEntries(modelIds.map(id=>[id,1/Math.max(kind==='temp'?0.2:0.1,errorByModel[id])]));
      const scoreSum=Object.values(scores).reduce((a,b)=>a+b,0);
      const weights=Object.fromEntries(modelIds.map(id=>[id,scores[id]/scoreSum]));
      const baseline=target.holdout.map(row=>validation.averagePred(row.pred,null,kind));
      const tuned=target.holdout.map(row=>validation.averagePred(row.pred,weights,kind));
      const baseMae=mean(target.holdout.map((row,i)=>Math.abs(baseline[i]-row.obs)));
      const tunedMae=mean(target.holdout.map((row,i)=>Math.abs(tuned[i]-row.obs)));
      const modelMae=Object.fromEntries(modelIds.map(id=>[id,mean(target.holdout.map(row=>Math.abs(row.pred[id]-row.obs)))]));
      const wetRows=target.holdout.filter(row=>row.obs>=0.2);
      const wetBase=kind==='rain'?mean(wetRows.map(row=>Math.abs(validation.averagePred(row.pred,null,kind)-row.obs))):null;
      const wetTuned=kind==='rain'?mean(wetRows.map(row=>Math.abs(validation.averagePred(row.pred,weights,kind)-row.obs))):null;
      details.push({id:target.id,name:target.name,valid:true,baseMae,tunedMae,modelMae,wetBase,wetTuned,
        holdoutHours:target.holdout.length,trainHours,trainStations:trainStations.length,
        holdoutStart:day(target.holdout[0].iso),holdoutEnd:day(target.holdout.at(-1).iso),wetHours,weights,
        delta:tunedMae-baseMae});
    }
    const valid=details.filter(d=>d.valid);
    if(valid.length<3)return {...fail('Menos de três estações com treino e validação suficientes.'),stations:details,validStations:valid.length};
    // Agregacao macro: nunca deixar uma estacao dominar por ter mais horas.
    const baseMae=mean(valid.map(d=>d.baseMae)),tunedMae=mean(valid.map(d=>d.tunedMae));
    const delta=baseMae-tunedMae;
    const modelStats=modelIds.map(id=>({id,mae:mean(valid.map(d=>d.modelMae[id]))})).sort((a,b)=>a.mae-b.mae);
    const minGain=kind==='temp'?0.05:0.02;
    const minimum=Math.max(minGain,baseMae*0.02);
    const improved=delta>=minimum;
    const maxWorsening=kind==='temp'?0.25:0.1;
    const stationSafe=valid.every(d=>d.delta<=maxWorsening);
    const wetSafe=kind!=='rain'||valid.every(d=>d.wetTuned<=d.wetBase+0.0000001);
    const eligible=improved&&stationSafe&&wetSafe;
    const reason=eligible?'Melhora observada em estações não usadas no treino, com embargo temporal.':
      !improved?'A redução do erro não atingiu o mínimo exigido.':
      !stationSafe?'A piora em uma estação ultrapassou o limite.':'A piora nos eventos de chuva bloqueou o ajuste.';
    return {kind,eligible,reason,modelIds,stations:details,stationCount:stations.length,validStations:valid.length,
      baseMae,tunedMae,improvementPct:baseMae>0?delta/baseMae*100:null,models:modelStats,
      testHours:valid.reduce((a,d)=>a+d.holdoutHours,0),trainHours:valid.reduce((a,d)=>a+d.trainHours,0),
      embargoHours:24,holdoutDays:2,stationWeighted:true};
  }
  function evaluate(stations,lead=1){
    if(![1,2,3].includes(lead))throw Error('Antecedência inválida.');
    if(!Array.isArray(stations)||stations.length<3||stations.length>8)throw Error('Use de 3 a 8 estações.');
    for(let i=0;i<stations.length;i++)for(let j=0;j<i;j++){
      if(stations[i].id===stations[j].id||distanceKm(stations[i].coords,stations[j].coords)<10)
        throw Error('Estações duplicadas ou a menos de 10 km: '+stations[i].name+' / '+stations[j].name);
    }
    const standardized=stations.map(s=>standardize(s,lead));
    return {lead,stationCount:standardized.length,temp:evaluateKind(standardized,'temp'),
      rain:evaluateKind(standardized,'rain'),stationNames:standardized.map(s=>s.name)};
  }
  return {distanceKm,standardize,getModelIntersection,evaluateKind,evaluate};
});

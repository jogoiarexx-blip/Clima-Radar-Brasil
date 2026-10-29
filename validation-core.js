/* ClimaRadar v0.7: backtest cronológico sem vazamento, independente do navegador.
 * Há embargo de 24h antes do período reservado para previsões previous_day1.
 * Os cálculos mostram erros na amostra; não certificam habilidade futura.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClimaValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const BASE = { ecmwf:0.32, gfs:0.23, icon:0.23, gem:0.22 };
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  function median(a) {
    const v=a.filter(finite).sort((x,y)=>x-y);
    return v.length ? (v.length%2 ? v[(v.length-1)/2] : (v[v.length/2-1]+v[v.length/2])/2) : null;
  }
  function mae(rows, preds, field, onlyWet=false) {
    const usable=rows.filter(row=>!onlyWet||row.obs>=0.2);
    if (!usable.length) return null;
    return usable.reduce((s,row)=>s+Math.abs(preds(row.pred)-row.obs),0)/usable.length;
  }
  function averagePred(pred, weights, kind) {
    const values=Object.values(pred).filter(finite);
    if (values.length<2) return null;
    const med=median(values);
    let weighted=0, sum=0;
    for(const [id,v] of Object.entries(pred)) {
      if(!finite(v)||!(id in BASE))continue;
      const factor=finite(weights?.[id])&&weights[id]>0 ? clamp(weights[id]*3,0.5,1.8) : 1;
      const div=kind==='temp' ? 3.5 : Math.max(4,med+4);
      const w=BASE[id]*factor/(1+Math.abs(v-med)/div);
      sum+=w; weighted+=v*w;
    }
    return sum>0?weighted/sum:null;
  }
  function getTimestamp(value) {
    const text=String(value??'').slice(0,16);
    return /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(text)?Date.parse(text+'Z'):NaN;
  }
  function commonRecords(observations, candidates, kind, lead=1) {
    const field=kind==='temp'?'temp':'rain';
    const forecastKey=kind==='temp'?`temperature_2m_previous_day${lead}`:`precipitation_previous_day${lead}`;
    const byModel=[];
    for(const item of candidates) {
      if(!(item.id in BASE)||!Array.isArray(item.hourly?.time)||!Array.isArray(item.hourly?.[forecastKey]))continue;
      const index=new Map();
      item.hourly.time.forEach((time,i)=>index.set(String(time).slice(0,16),item.hourly[forecastKey][i]));
      const available=observations.filter(o=>{
        const v=index.get(o.time);
        return finite(o[field])&&finite(v)&&(kind==='temp'?v>-90&&v<75:v>=0&&v<=500);
      }).length;
      if(available>=96)byModel.push({id:item.id,index});
    }
    if(byModel.length<2)return {rows:[],ids:byModel.map(x=>x.id)};
    const rows=observations.flatMap(o=>{
      if(!finite(o[field]))return [];
      const time=getTimestamp(o.time);
      if(!finite(time))return [];
      const pred={};
      for(const model of byModel) {
        const v=model.index.get(o.time);
        if(!finite(v)||(kind==='temp'?(v<=-90||v>=75):(v<0||v>500)))return [];
        pred[model.id]=v;
      }
      return [{time,iso:o.time,obs:o[field],pred}];
    }).sort((a,b)=>a.time-b.time);
    return {rows,ids:byModel.map(m=>m.id)};
  }
  function evaluateVariable(observations,candidates,kind,lead=1) {
    const common=commonRecords(observations,candidates,kind,lead);
    const allDates=[...new Set(common.rows.map(r=>r.iso.slice(0,10)))].sort();
    const unavailable=(reason)=>({kind,eligible:false,reason,trainHours:0,holdoutHours:0,trainWetHours:0,holdoutWetHours:0,weights:null,
      baseMae:null,tunedMae:null,baseWetMae:null,tunedWetMae:null,improvementPct:null,modelCount:common.ids.length});
    if(common.ids.length<2)return unavailable('Menos de dois modelos com série suficiente.');
    if(allDates.length<6)return unavailable('São necessários pelo menos seis dias com dados comuns.');
    // Últimos dois dias da série ficam totalmente reservados à validação.
    const holdoutStart=Date.parse(allDates.at(-2)+'T00:00:00Z');
    const trainEnd=holdoutStart-24*3600000;
    const train=common.rows.filter(r=>r.time<trainEnd);
    const holdout=common.rows.filter(r=>r.time>=holdoutStart);
    if(train.length<72||holdout.length<24||new Set(holdout.map(r=>r.iso.slice(0,10))).size<2) {
      return {...unavailable('Treino requer 72 horas e validação reservada requer 24 horas em dois dias, com embargo de 24h.'),
        trainHours:train.length,holdoutHours:holdout.length};
    }
    const trainWetHours=train.filter(r=>r.obs>=0.2).length;
    const holdoutWetHours=holdout.filter(r=>r.obs>=0.2).length;
    if(kind==='rain'&&(trainWetHours<5||holdoutWetHours<3)) {
      return {...unavailable('Chuva insuficiente: mínimo de 5 horas chuvosas no treino e 3 na validação.'),
        trainHours:train.length,holdoutHours:holdout.length,trainWetHours,holdoutWetHours};
    }
    // Os pesos usam APENAS o período de treino.
    const errorByModel=Object.fromEntries(common.ids.map(id=>{
      const sample=kind==='rain'?train.filter(r=>r.obs>=0.2):train;
      const error=sample.reduce((s,r)=>s+Math.abs(r.pred[id]-r.obs),0)/sample.length;
      return [id,error];
    }));
    const scores=Object.fromEntries(common.ids.map(id=>[id,1/Math.max(kind==='temp'?0.2:0.1,errorByModel[id])]));
    const total=Object.values(scores).reduce((a,b)=>a+b,0);
    const weights=Object.fromEntries(common.ids.map(id=>[id,scores[id]/total]));
    const baseline=row=>averagePred(row, null,kind);
    const tuned=row=>averagePred(row,weights,kind);
    const baseMae=mae(holdout,baseline,kind),tunedMae=mae(holdout,tuned,kind);
    const baseWetMae=kind==='rain'?mae(holdout,baseline,kind,true):null;
    const tunedWetMae=kind==='rain'?mae(holdout,tuned,kind,true):null;
    const gain=baseMae-tunedMae;
    // Protege contra diferenças insignificantes e piora no evento de chuva.
    const enoughGain=gain>=Math.max(kind==='temp'?0.05:0.02,baseMae*0.02);
    const wetNotWorse=kind!=='rain'||tunedWetMae<=baseWetMae+1e-10;
    const eligible=enoughGain&&wetNotWorse;
    return {kind,eligible,
      reason:eligible?'Redução de MAE na validação reservada.':!enoughGain?'Sem melhora suficiente nas horas reservadas.':'Erro em horas chuvosas aumentou.',
      trainHours:train.length,holdoutHours:holdout.length,trainWetHours,holdoutWetHours,
      trainStart:train[0].iso.slice(0,10),trainEnd:train.at(-1).iso.slice(0,10),
      holdoutStart:holdout[0].iso.slice(0,10),holdoutEnd:holdout.at(-1).iso.slice(0,10),
      embargoHours:24,weights,modelCount:common.ids.length,
      baseMae,tunedMae,baseWetMae,tunedWetMae,
      improvementPct:baseMae>0?100*gain/baseMae:null};
  }
  function validate(observations,candidates,lead=1) {
    return {temp:evaluateVariable(observations,candidates,'temp',lead),
      rain:evaluateVariable(observations,candidates,'rain',lead)};
  }
  return {BASE,median,averagePred,commonRecords,evaluateVariable,validate};
});

/* ClimaRadar v0.6 — comparação robusta de modelos, sem dependências. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClimaForecastCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const valid = x => typeof x === 'number' && Number.isFinite(x);
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const median = values => {
    const a=values.filter(valid).sort((a,b)=>a-b);
    if(!a.length)return null;
    const mid=Math.floor(a.length/2);
    return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
  };
  const METAS = [
    {id:'bestmatch',weight:0.0,role:'reference'},
    {id:'ecmwf',weight:0.32,role:'independent'},
    {id:'gfs',weight:0.23,role:'independent'},
    {id:'icon',weight:0.23,role:'independent'},
    {id:'gem',weight:0.22,role:'independent'}
  ];
  const timeKey = value => String(value??'').slice(0,13);
  function hours(data,targetTime,amount=24) {
    const h=data?.hourly||{}, time=h.time;
    if(!Array.isArray(time))return [];
    const target=timeKey(targetTime);
    const idx=time.findIndex(t=>timeKey(t)>=target);
    if(idx<0)return [];
    return time.slice(idx,idx+amount).map((time,i)=>({
      time,
      temp:valid(h.temperature_2m?.[idx+i])?h.temperature_2m[idx+i]:null,
      rain:valid(h.precipitation?.[idx+i])&&h.precipitation[idx+i]>=0?h.precipitation[idx+i]:null,
      probability:valid(h.precipitation_probability?.[idx+i])?h.precipitation_probability[idx+i]:null,
      code:valid(h.weather_code?.[idx+i])?h.weather_code[idx+i]:null
    }));
  }
  function summary(data,id,label,targetTime) {
    const list=hours(data,targetTime,24);
    if(!list.length)throw new Error('Sem horas disponíveis');
    const first=list[0];
    const current=data.current||{};
    const aligned=timeKey(current.time)===timeKey(first.time);
    const temp=aligned&&valid(current.temperature_2m)?current.temperature_2m:first.temp;
    const code=aligned&&valid(current.weather_code)?current.weather_code:first.code;
    const completeRain=list.length===24&&list.every(item=>valid(item.rain));
    const rain24=completeRain?list.reduce((a,x)=>a+x.rain,0):null;
    const chances=list.slice(0,12).map(x=>x.probability).filter(valid);
    return {
      id,label,temp:valid(temp)?temp:null,code,
      time:first.time,raw:data,
      rain24, rainSeries:list.map(x=>x.rain), tempSeries:list.map(x=>x.temp),
      next12MaxChance:chances.length?Math.max(...chances):null,
      rainEventShare:null, // não é probabilidade meteorológica
      currentRain:aligned&&valid(current.precipitation)?current.precipitation:first.rain,
      hourly:list
    };
  }
  function weighted(items,key,weights) {
    let total=0,sum=0;
    for(const item of items){
      if(!valid(item[key]))continue;
      const w=weights[item.id]||0;
      if(w<=0)continue;
      total+=w;sum+=w*item[key];
    }
    return total>0?sum/total:null;
  }
  // Pesos separados por variável: desempenho térmico não pode alterar chuva.
  function ensemble(reference, independent, calibration=null) {
    const models=independent.filter(m=>m&&(valid(m.temp)||valid(m.rain24)));
    const tempModels=models.filter(m=>valid(m.temp));
    const rainModels=models.filter(m=>valid(m.rain24));
    const values=tempModels.map(m=>m.temp),rainValues=rainModels.map(m=>m.rain24);
    const tSpread=tempModels.length>=2?Math.max(...values)-Math.min(...values):null;
    const rSpread=rainModels.length>=2?Math.max(...rainValues)-Math.min(...rainValues):null;
    const sufficient=tempModels.length>=2;
    const medT=median(values),medRain=median(rainValues);
    const verified=calibration?.version===2&&calibration?.weights&&typeof calibration.weights==='object';
    const tempWeights={},rainWeights={};
    function factor(variable,id){
      const w=verified ? calibration.weights?.[variable]?.[id] : null;
      return valid(w)&&w>0?clamp(w*3,0.5,1.8):1;
    }
    for(const m of models){
      const meta=METAS.find(x=>x.id===m.id);
      if(!meta||meta.role!=='independent')continue;
      if(valid(m.temp)){
        const penalty=1/(1+Math.abs(m.temp-medT)/3.5);
        tempWeights[m.id]=meta.weight*factor('temp',m.id)*penalty;
      }
      if(valid(m.rain24)){
        const penalty=1/(1+Math.abs(m.rain24-medRain)/Math.max(4,medRain+4));
        rainWeights[m.id]=meta.weight*factor('rain',m.id)*penalty;
      }
    }
    const temp=sufficient?weighted(tempModels,'temp',tempWeights):reference?.temp??null;
    const rain24=rainModels.length>=2?weighted(rainModels,'rain24',rainWeights):reference?.rain24??null;
    // Mede convergência, não acerto verificado ou probabilidade meteorológica.
    const agreement=sufficient ? Math.round(clamp(
      100-Math.min(tSpread*9,40)-(valid(rSpread)?Math.min(rSpread*2.5,35):16)-(4-tempModels.length)*7,15,96
    )) : null;
    const label=!sufficient?'Comparação limitada':agreement>=80?'Convergência alta':agreement>=55?'Convergência moderada':'Divergência elevada';
    const description=!sufficient?
      'Há menos de dois modelos independentes disponíveis; exibição da referência Best Match.' :
      agreement>=80?'Os modelos independentes estão próximos entre si. Isso não garante maior acerto.':
      agreement>=55?'Os modelos independentes apresentam diferenças; consulte as linhas por hora.':
      'Os modelos independentes divergem bastante. Acompanhe as atualizações antes de tomar decisões.';
    const calibrationApplied=verified&&models.some(m=>
      valid(calibration.weights?.temp?.[m.id])||valid(calibration.weights?.rain?.[m.id]));
    return {
      summary:{ ...(reference||models[0]),temp,rain24,code:reference?.code??models[0]?.code },
      confidence:agreement,agreement,label,description,
      weightedModels:models.map(m=>({...m,weight:tempWeights[m.id]||null,rainWeight:rainWeights[m.id]||null})),
      tempSpread:tSpread,rainSpread:rSpread,modelsOnline:tempModels.length,
      worstCaseRain:rainValues.length?Math.max(...rainValues):reference?.rain24??null,
      rainChance:reference?.next12MaxChance??null,
      calibrationUsed:calibrationApplied,calibrationMeta:calibrationApplied?calibration:null
    };
  }
  return {valid,median,hours,summary,ensemble,METAS,timeKey};
});

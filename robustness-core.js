/* ClimaRadar v1.3 — diagnostico de robustez amostral por estacao.
 * Reamostragem explora a variabilidade das estacoes enviadas; NAO e garantia de
 * precisao futura nem intervalo populacional valido para todo o Brasil.
 * Nenhum ajuste de modelo e aplicado na previsao operacional por este modulo.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ClimaRobustness=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const mean=x=>x.length ? x.reduce((s,v)=>s+v,0)/x.length:null;
  function quantile(sorted,p){
    const x=(sorted.length-1)*p, i=Math.floor(x), frac=x-i;
    return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*frac;
  }
  function bootstrap(deltas,repeats=1000){
    if(!Array.isArray(deltas)||deltas.length<3||deltas.some(x=>!finite(x)))return null;
    // Semente deterministica para testes reproduziveis (nao usa amostras externas).
    let seed=0x5f3762ad;
    const random=()=>{
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      return (seed>>>0)/4294967296;
    };
    const draws=[];
    const n=deltas.length;
    for(let i=0;i<repeats;i++){
      let sum=0;
      for(let j=0;j<n;j++)sum+=deltas[Math.floor(random()*n)];
      draws.push(sum/n);
    }
    draws.sort((a,b)=>a-b);
    return {low:quantile(draws,.05),high:quantile(draws,.95),iterations:repeats};
  }
  function analyze(result,kind){
    const details=(result?.stations||[]).filter(s=>s.valid && finite(s.baseMae) && finite(s.tunedMae));
    const deltas=details.map(s=>s.baseMae-s.tunedMae);
    const n=details.length;
    const improved=details.filter(s=>s.baseMae-s.tunedMae>1e-9).length;
    const worsened=details.filter(s=>s.tunedMae-s.baseMae>1e-9).length;
    const stable=n-improved-worsened;
    const gains=mean(deltas);
    const leaveOneOut=n>=3?details.map((item,i)=>({stationId:item.id,gain:mean(deltas.filter((_,j)=>j!==i))})):[];
    const range=bootstrap(deltas);
    const minStations=5;
    // Robusto significa apenas "resultado nao concentrado em uma estacao" NA AMOSTRA.
    // Nao implica ganho operacional nem significancia estatistica nacional.
    const consistent=n>=minStations && improved>=Math.ceil(.8*n) &&
      range!==null && range.low>0 && leaveOneOut.every(x=>x.gain>0);
    const reasons=[];
    if(n<minStations)reasons.push(`Apenas ${n} estações elegíveis (mínimo ${minStations} para avaliar consistência).`);
    if(n>=minStations && improved<Math.ceil(.8*n))reasons.push('A melhoria não se repetiu em pelo menos 80% das estações.');
    if(n>=minStations && range?.low<=0)reasons.push('A faixa exploratória inclui ausência de ganho ou piora.');
    if(n>=minStations && leaveOneOut.some(x=>x.gain<=0))reasons.push('A melhoria desaparece ao remover uma estação da amostra.');
    if(consistent)reasons.push('Melhoria consistente na amostra importada; sem certificação de acurácia futura.');
    return {kind,n,improved,worsened,stable,gain:gains,range,leaveOneOut,
      minLeaveOneOut:leaveOneOut.length?Math.min(...leaveOneOut.map(x=>x.gain)):null,
      maxLeaveOneOut:leaveOneOut.length?Math.max(...leaveOneOut.map(x=>x.gain)):null,
      consistent,limited:n<minStations,reason:reasons.join(' ')||'Sem melhora consistente na amostra.'};
  }
  function summarize(result){
    return {temp:analyze(result?.temp,'temp'),rain:analyze(result?.rain,'rain')};
  }
  return {bootstrap,analyze,summarize};
});

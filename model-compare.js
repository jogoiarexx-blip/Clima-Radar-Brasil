/* Gráfico exploratório de linhas por modelo (SVG sem dependências). */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const COLORS={bestmatch:'#ccd9e6',ecmwf:'#79dfcb',gfs:'#69aef2',icon:'#f5c27f',gem:'#dc9af3'};
  const LABELS={bestmatch:'Best Match',ecmwf:'ECMWF IFS',gfs:'NOAA GFS',icon:'DWD ICON',gem:'GEM Canadá'};
  const state={metric:'temp',series:[],target:null};
  const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  const getTime=t=>String(t||'').slice(11,16);
  const niceTicks=(lo,hi,count=4)=>Array.from({length:count+1},(_,i)=>lo+(hi-lo)*(i/count));
  function toAligned(model,target) {
    const list=model?.hourly||[];
    const lookup=new Map(list.map(x=>[x.time,x]));
    return target.map(t=>lookup.get(t)||null);
  }
  function render() {
    const target=$('#comparisonGraph');if(!target)return;
    const series=state.series.filter(s=>s.points.some(p=>p&&Number.isFinite(p[state.metric])));
    if(series.length<2){target.textContent='Aguardando pelo menos duas séries horárias com dados comparáveis.';return;}
    const metric=state.metric, values=series.flatMap(s=>s.points.map(p=>p?.[metric]).filter(Number.isFinite));
    if(!values.length){target.textContent='Valores não disponíveis nesta variável.';return;}
    let minimum=Math.min(...values),maximum=Math.max(...values);
    const pad=Math.max((maximum-minimum)*.17,metric==='temp'?1:.25);
    minimum=metric==='rain'?Math.max(0,minimum-pad):Math.floor(minimum-pad);
    maximum=Math.ceil((maximum+pad)*10)/10;
    const width=1020,height=300,left=45,right=20,top=20,bottom=42;
    const innerW=width-left-right,innerH=height-top-bottom;
    const x=i=>left+innerW*i/23;
    const y=value=>top+(maximum-value)/Math.max(.1,maximum-minimum)*innerH;
    const guides=niceTicks(minimum,maximum).map(v=>`<line x1="${left}" x2="${width-right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="3,7"/><text x="5" y="${(y(v)+4).toFixed(1)}" fill="#9badbf" font-size="12">${fmt(v)}${metric==='temp'?'°':''}</text>`).join('');
    const curves=series.map(s=>{
      let d='',open=false;
      s.points.forEach((p,i)=>{const v=p?.[metric];if(Number.isFinite(v)){d+=(open?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)+' ';open=true;}else open=false;});
      return `<path d="${d.trim()}" fill="none" stroke="${COLORS[s.id]}" stroke-width="${s.id==='bestmatch'?2.2:3.2}" stroke-dasharray="${s.id==='bestmatch'?'6,6':''}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join('');
    const ticks=[0,4,8,12,16,20,23].map(i=>`<text x="${x(i).toFixed(1)}" y="${height-12}" text-anchor="middle" fill="#9badbf" font-size="12">${getTime(state.target[i])}</text>`).join('');
    const label=metric==='temp'?'temperatura em graus Celsius':'precipitação em milímetros por hora';
    target.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparação das próximas 24 horas: ${label}">${guides}${curves}${ticks}</svg>`;
    const desc=$('#comparisonDetails');
    if(desc)desc.textContent=`${series.length} séries disponíveis. Cada curva corresponde ao mesmo horário local. A linha Best Match é referência e não conta como modelo independente.`;
    const legend=$('#comparisonLegend');
    if(legend){legend.replaceChildren(...series.map(s=>{const item=document.createElement('span');item.className='model-legend-item';const mark=document.createElement('i');mark.style.background=COLORS[s.id];const text=document.createElement('span');text.textContent=LABELS[s.id];item.append(mark,text);return item;}));}
  }
  function update(models,primary){
    if(!primary?.hourly?.length)return;
    state.target=primary.hourly.map(x=>x.time).slice(0,24);
    state.series=models.filter(Boolean).map(model=>({id:model.id,points:toAligned(model,state.target)}));
    render();
  }
  $('#compareTemp')?.addEventListener('click',()=>{state.metric='temp';$('#compareTemp').classList.add('is-active');$('#compareRain').classList.remove('is-active');render();});
  $('#compareRain')?.addEventListener('click',()=>{state.metric='rain';$('#compareRain').classList.add('is-active');$('#compareTemp').classList.remove('is-active');render();});
  document.addEventListener('climaradar:models-ready',e=>update(e.detail.models,e.detail.primary));
})();

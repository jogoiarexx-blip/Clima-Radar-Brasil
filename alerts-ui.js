/* Os avisos oficiais são consultados via espelho de terceiros; riscos derivados são apenas indicativos. */
(()=>{"use strict";
 const engine=window.ClimaAlerts,officialRoot=document.getElementById("officialAlertResults"),forecastRoot=document.getElementById("forecastAlertResults");
 if(!engine||!officialRoot||!forecastRoot)return;
 const officialCard=document.getElementById("officialAlertCard"),forecastCard=document.getElementById("forecastAlertCard"),status=document.getElementById("alertsStatus");
 const label={storm:"Tempestade",rain:"Chuva intensa",wind:"Ventos fortes"};let seq=0,ctrl=null;
 function el(tag,value,cls){const x=document.createElement(tag);x.textContent=String(value);if(cls)x.className=cls;return x;}
 function message(root,t){root.replaceChildren(el("div",t,"alert-subtle"));}
 function item(root,title,level,reason,time){
  const row=el("article","","alert-item "+(["high","Perigo","Grande Perigo"].includes(level)?"severe":"warning"));
  const top=el("div","","alert-item-top");top.append(el("strong",title),el("em",level==="high"?"Alto":level==="moderate"?"Atenção":level));
  row.append(top,el("p",reason));if(time)row.append(el("p","Período: "+time));root.append(row);
 }
 function renderForecast(data){
  const report=engine.hourRisk(data,{hours:48});forecastCard.classList.remove("has-alert","has-danger");forecastRoot.replaceChildren();
  if(report.items.length){forecastCard.classList.add("has-alert");if(report.items.some(x=>x.level==="high"))forecastCard.classList.add("has-danger");
   for(const x of report.items)item(forecastRoot,label[x.kind]||"Condição adversa",x.level,x.reason,x.time?.slice(0,16).replace("T"," "));
  }else if(report.status==="ok")message(forecastRoot,"Nenhum limite preventivo foi acionado nas próximas 48 horas. Isso não elimina a possibilidade de tempo severo.");
  else message(forecastRoot,"Dados insuficientes ou desatualizados para avaliar os riscos. Consulte os avisos oficiais.");
  if(report.status==="partial")forecastRoot.append(el("p","Avaliação parcial: faltam dados de chuva, rajadas ou condição meteorológica.","alerts-fineprint"));
  status.textContent=report.items.length?report.items.length+" categoria(s) de risco estimado identificada(s)":"Monitoramento de riscos estimados";
 }
 async function request(url,signal){const r=await fetch(url,{signal,cache:"no-cache"});if(!r.ok)throw Error("Fonte indisponível");const d=await r.json();if(!d||typeof d!=="object")throw Error("Resposta inesperada");return d;}
 async function loadOfficial(place,token,signal){
  officialCard.classList.remove("has-alert","has-danger");message(officialRoot,"Verificando avisos oficiais para o município…");
  const uf=engine.getUf(place?.admin1||place?.uf||place?.estado);
  if(!uf||!place?.name||String(place.name).toLowerCase().includes("localização")){message(officialRoot,"Município não confirmado. Consulte o portal oficial do INMET.");return;}
  try{
   const cityData=await request("https://radarmeteorologico.com.br/api/v1/cidades?q="+encodeURIComponent(place.name),signal);
   if(token!==seq)return;
   const city=engine.resolveCity(cityData,place);
   if(!city){message(officialRoot,"Não foi possível confirmar o código IBGE da cidade. Um aviso estadual não será atribuído indevidamente ao município.");return;}
   const alertsData=await request("https://radarmeteorologico.com.br/api/v1/alertas?uf="+uf,signal);
   if(token!==seq)return;
   const report=engine.official(alertsData,city);
   if(report.status!=="verified"){message(officialRoot,"Consulta inconclusiva ou desatualizada. Verifique os avisos diretamente no INMET.");return;}
   officialRoot.replaceChildren();
   if(!report.items.length)message(officialRoot,"Nenhum aviso INMET identificado para "+city.name+" nesta consulta. Confira o portal oficial, pois avisos podem mudar.");
   else{
    officialCard.classList.add("has-alert");if(report.items.some(x=>x.level>=2))officialCard.classList.add("has-danger");
    for(const a of report.items){item(officialRoot,a.title,a.severity,a.risks.join(" ").slice(0,390)||"Consulte detalhes no INMET.",[a.start,a.end].filter(Boolean).join(" até "));
     if(a.instructions.length)officialRoot.append(el("p","Orientação: "+a.instructions.join(" ").slice(0,450),"alerts-fineprint"));
    }
   }
   officialRoot.append(el("p","Fonte: INMET, reprodução via RadarMeteorológico. Atualização do espelho: "+new Date(report.updatedAt).toLocaleString("pt-BR")+".","alerts-fineprint"));
  }catch(e){if(token!==seq||e?.name==="AbortError")return;message(officialRoot,"Não foi possível consultar os avisos INMET. Falha de consulta NÃO significa ausência de alertas. Abra o portal oficial.");}
 }
 document.addEventListener("climaradar:place",ev=>{const token=++seq;if(ctrl)ctrl.abort();ctrl=new AbortController();message(forecastRoot,"Aguardando previsão da cidade…");officialCard.classList.remove("has-alert","has-danger");forecastCard.classList.remove("has-alert","has-danger");status.textContent="Verificando condições…";loadOfficial(ev.detail,token,ctrl.signal);});
 document.addEventListener("climaradar:forecast-ready",ev=>renderForecast(ev.detail?.data));
 const initial=window.ClimaRadarCurrentPlace;if(initial){const token=++seq;ctrl=new AbortController();loadOfficial(initial,token,ctrl.signal);}
})();
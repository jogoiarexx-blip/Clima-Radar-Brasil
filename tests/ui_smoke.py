import json, re, base64
from pathlib import Path
from datetime import datetime,timedelta
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
css=(root/'styles.css').read_text()+'\n'+(root/'premium.css').read_text()
html=html.replace('<link rel="stylesheet" href="./styles.css" />','<style>'+css+'</style>').replace('<link rel="stylesheet" href="./premium.css" />','')
for f in (root/'assets').glob('*.svg'):
    html=html.replace('./assets/'+f.name,'data:image/svg+xml;base64,'+base64.b64encode(f.read_bytes()).decode())
now=datetime(2026,10,29,14,0)
times=[(now+timedelta(hours=i)).strftime('%Y-%m-%dT%H:00') for i in range(168)]
days=[(now+timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]
primary={"current":{"time":times[0],"temperature_2m":27.4,"apparent_temperature":29.6,"relative_humidity_2m":67,"precipitation":0.0,"weather_code":2,"wind_speed_10m":12},"hourly":{"time":times,"temperature_2m":[27+2*((i%24)/24) for i in range(168)],"precipitation":[0.6 if i%11==0 else 0 for i in range(168)],"precipitation_probability":[42 if i%11==0 else 15 for i in range(168)],"weather_code":[2]*168},"daily":{"time":days,"weather_code":[2,3,61,2,0,2,61],"temperature_2m_max":[32,31,30,33,34,30,29],"temperature_2m_min":[21,22,21,20,21,22,20],"precipitation_probability_max":[25,30,67,34,10,32,72]}}
def model(offset):
    return {"current":{"time":times[0],"temperature_2m":27+offset,"weather_code":2,"precipitation":0},"hourly":{"time":times,"temperature_2m":[27+offset for _ in times],"precipitation":[.2 if i%9==0 else 0 for i in range(168)],"weather_code":[2]*168}}
mocks={"primary":primary,"ecmwf":model(.1),"gfs":model(-.5),"icon":model(.4),"gem":model(-.15)}
shim='<script>const MOCKS='+json.dumps(mocks,ensure_ascii=False)+';window.fetch=async(url)=>{url=String(url);let type=url.includes("models=ecmwf_ifs")?"ecmwf":url.includes("models=ncep_gfs_seamless")?"gfs":url.includes("models=icon_global")?"icon":url.includes("models=cmc_gem_seamless")?"gem":"primary";if(url.includes("/weather-maps.json"))return {ok:true,json:async()=>({host:"https://tilecache.rainviewer.com",radar:{past:[]}})};if(url.includes("/search"))return {ok:true,json:async()=>({results:[]})};return {ok:true,json:async()=>MOCKS[type]}};</script>'
for src in ['forecast-core.js','reliability-core.js','source-diagnostics.js','app.js','model-compare.js','audit-core.js','validation-core.js','audit-ui.js','network-core.js','network-ui.js','radar-core.js','radar.js','mobile.js']:
    html=html.replace(f'<script src="./{src}" defer></script>','<script>'+(root/src).read_text()+'</script>')
html=html.replace('<script>\n',shim+'\n<script>\n',1) if '<script>\n' in html else html.replace('<script>',shim+'<script>',1)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    for width,name in [(1440,'desktop'),(390,'mobile')]:
        page=browser.new_page(viewport={'width':width,'height':915},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_timeout(1150)
        page.click('#compareRain')
        page.wait_for_timeout(50)
        result=page.evaluate('''() => ({title: document.title, city: document.querySelector('#cityName')?.textContent, temp:document.querySelector('#currentTemp')?.textContent, cards:document.querySelectorAll('.daily-card').length, graph:!!document.querySelector('#comparisonGraph svg'), agreement:document.querySelector('#confidenceScore').textContent, nav: getComputedStyle(document.querySelector('.mobile-tabbar')).display, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth, scrollWidth:document.documentElement.scrollWidth})''')
        out=Path('/mnt/data')/f'climaradar_v04_{name}_preview.png'
        page.screenshot(path=str(out),full_page=True)
        
        if width == 390:
            over=page.evaluate('''() => Array.from(document.querySelectorAll('*')).map(el=>({tag:el.tagName,id:el.id,cls:el.className?.baseVal||el.className||'',left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)})).filter(r=>r.right>window.innerWidth+1||r.left< -5).slice(0,20)''');print('overflow elements',over)
        print(name,result,'errors',errors[:4], 'preview',out)
        assert not errors, errors
        assert result['graph'] is True, result
        assert result['cards']==7, result
        assert result['horizontalOverflow'] is False, result
        page.close()
    browser.close()

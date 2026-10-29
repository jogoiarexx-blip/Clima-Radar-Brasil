# ClimaRadar Brasil — v0.9 (precisão verificada fora da amostra)

Site estático de meteorologia, otimizado para GitHub Pages, com visualização de radar observado e comparação de modelos meteorológicos. **Não é um serviço de alertas oficial.**

## v0.9 — relatório por região e por antecedência (29/10/2026)

- **Novo panorama regional descritivo** gerado somente com os CSVs INMET enviados pelo usuário; **não é** um boletim nacional nem uma medição da acurácia de todos os estados.
- Leitura de UF/estado diretamente do cabeçalho do CSV. Estados não documentados no arquivo **não são inferidos por latitude/longitude**: aparecem como `UF não informada`.
- Agregação por região IBGE e por **24, 48 e 72 h** de antecedência, com seleção de variável (temperatura ou precipitação), modelo e erro de consenso.
- **Mesmo peso por estação elegível**, independentemente do número de observações horárias; medições ou previsões ausentes não contam como zero.
- Modo "Todas (24/48/72h)" consulta seis variáveis históricas em uma requisição por modelo/estação, evitando triplicar o número de chamadas; mantém limite de três solicitações simultâneas.
- Importação, radar, calibração local e modo de antecedência única permanecem preservados. Exportação CSV inclui detalhe por estação e agregados regionais.
- Avaliação espacial com estação reservada + embargo temporal permanece intacta. Resultados de pequena amostra são explicitamente rotulados.

**Limitação metodológica:** com 3 a 6 estações importadas, os resultados são diagnósticos para a amostra, não comprovam precisão nacional. Os dados são processados no navegador e só consultam a API para obter previsões históricas, sem enviar o conteúdo dos CSVs a um servidor do ClimaRadar.

**Testes:** `node --test tests/*.test.js`, `python3 tests/network_smoke.py`, `python3 tests/ui_smoke.py`, `python3 tests/calibration_smoke.py`. Os smoke tests usam dados meteorológicos simulados.

---

## Melhorias desta versão

- **Comparação realmente multimodelo:** ECMWF IFS, NOAA GFS, DWD ICON e GEM Canada, mais Best Match como **referência não independente**. Utiliza parâmetros de modelo documentados na API Forecast do Open-Meteo.
- **Gráfico horário comparativo:** temperatura (°C) e precipitação (mm/h) para 24 horas; alternância pelo usuário. Séries alinhadas pela hora local sem fabricar pontos ausentes.
- **Consenso mais rigoroso:** mediana e pesos para modelos independentes; quando há apenas um modelo independente disponível, não mostra falsa pontuação de concordância.
- **Índice de concordância, não de acerto:** 0–100 mede dispersão entre modelos independentes; não equivale a precisão validada.
- **Probabilidade de chuva honesta:** maior probabilidade horária nas próximas 12h, fornecida pela fonte de referência. Não é probabilidade de chover em qualquer momento do período.
- **Qualidade dos dados:** precipitação ausente não é interpretada como zero e acumulado de 24h só aparece com 24 horas válidas.
- **Radar RainViewer:** histórico observado, quadros anterior/próximo e consulta manual; respeita zoom e limites da API pública.
- **UX:** cidades recentes guardadas somente no navegador, visual responsivo e ícones SVG próprios.
- **Auditoria local:** CSV de estação INMET e estatísticas de erro, sem prometer melhora de previsão automaticamente.

## Bibliotecas/projetos open source pesquisados

- [Leaflet](https://leafletjs.com/) — biblioteca BSD-2-Clause para mapa interativo, carregada sob demanda.
- [Open-Meteo](https://open-meteo.com/en/docs) — API e código aberto; uso gratuito condicionado à licença aplicável (não comercial no plano gratuito).
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — dados ODbL, tiles sujeitos à política de uso/atribuição.

O gráfico comparativo foi implementado em SVG nativo, sem dependência extra de uma biblioteca de gráficos.

## APIs e termos

- Previsão: `https://api.open-meteo.com/v1/forecast` com modelos `ecmwf_ifs`, `ncep_gfs_seamless`, `icon_global`, `cmc_gem_seamless` e Best Match padrão.
- Geocodificação: Open-Meteo Geocoding/GeoNames.
- Radar histórico: `https://api.rainviewer.com/public/weather-maps.json`, para uso pessoal/educacional e pequenas comunidades; atribuição à RainViewer visível na página. A API pública **não fornece quadros futuros em 2026**.
- IPMet, INMET e CPTEC/INPE: links oficiais de monitoramento; nenhuma reprodução de imagens IPMet foi embutida sem autorização.

**Limitações:** convergência dos modelos não prova que a previsão ficou mais precisa. Para demonstrar ganho objetivo, serão necessárias amostras históricas independentes e métricas de erro separadas por temperatura, chuva, estação e antecedência. Uma API ou camada de radar pode ficar indisponível e não existe garantia de cobertura local.

## Estrutura

- `index.html`: home e controles
- `styles.css`, `premium.css`: layout responsivo
- `forecast-core.js`: alinhamento e consenso isolados com testes
- `app.js`: consulta de cidade e modelos
- `model-compare.js`: gráfico 24h SVG
- `radar-core.js`, `radar.js`: mapa Leaflet + RainViewer
- `audit-core.js`, `audit-ui.js`: auditoria INMET
- `network-core.js`, `network-ui.js`: auditoria entre estações
- `regional-core.js`: agregação descritiva por região e antecedência
- `mobile.js`: navegação mobile
- `assets/`: SVGs originais
- `tests/`: testes de cálculo, radar e smoke test de navegador (dados simulados)

## Testes

```bash
node --test tests/*.test.js
python3 tests/ui_smoke.py
```

O teste de navegador usa dados **simulados**, não comprova que a API meteorológica ou os tiles RainViewer estejam disponíveis online.

## Publicar no GitHub Pages

Copie todo o conteúdo da pasta para a **raiz da branch `main`** do repositório e mantenha GitHub Pages configurado para publicar a partir de `main` e `/ (root)`. Não é preciso build, servidor nem chaves secretas.

## v0.6 — auditoria comparável e calibração separada (29/10/2026)

Esta revisão mantém a interface premium, radar observado e gráficos da v0.5, e melhora a auditoria:

1. **Quatro modelos na auditoria**: ECMWF (`ecmwf_ifs`), GFS (`ncep_gfs_seamless`), ICON (`icon_global`) e GEM (`cmc_gem_seamless`). IDs alinhados à API Forecast oficial.
2. **Mesmo conjunto de horas**: temperatura e precipitação são avaliadas somente nos horários que têm medição e previsão válida para todos os modelos elegíveis. Com menos de dois modelos ou menos de 24 horas comuns, a classificação é desabilitada; não compara amostras diferentes como se fossem iguais.
3. **Erro de chuva em horas chuvosas**: mostra o MAE somente quando houve chuva medida (limiar 0,2 mm/h), além do MAE total. Não usa a taxa de acertos de horas secas como indicador universal de precisão.
4. **Pesos locais v2**: temperatura calibrada pelo inverso do erro absoluto médio térmico; chuva calibrada separadamente pelo erro em horas chuvosas, se houver pelo menos cinco horas com chuva medida e 72 horas comuns de precipitação.
5. **Proteções**: 72 horas comuns e dois modelos para habilitar calibração térmica; somente auditoria com 24 h de antecedência, CSV terminado nos últimos 45 dias e localização consultada até 50 km da estação. Sem amostra suficiente, os pesos originais são preservados.
6. **Compatibilidade**: pesos locais antigos v1 não são usados para evitar influência cruzada indevida; o usuário pode executar nova auditoria.

O ajuste de pesos é **exploratório**: o desempenho dentro da amostra histórica não demonstra ganho de precisão fora dela. A previsão de chuva no painel não usa um percentual derivado da concordância entre modelos.

### Testes v0.6

```bash
node --test tests/*.test.js
python3 tests/ui_smoke.py
python3 tests/calibration_smoke.py
```

`calibration_smoke.py` usa CSV e respostas de modelos **simulados**. Não comprova que os servidores externos estejam disponíveis. Para medir melhoria real de precisão, é preciso testar períodos futuros reservados (fora da amostra de calibração), com várias estações INMET.


## v0.7 — validação cronológica sem vazamento (29/10/2026)

A próxima melhoria de precisão é **não promover pesos calibrados apenas porque melhoram o período usado no treinamento**.

- Novo módulo `validation-core.js` (sem dependência de navegador) e suíte `tests/validation.test.js`.
- Para cada variável, só entram os modelos com pelo menos 96 horas com previsões e observações válidas. As amostras devem ter pelo menos dois modelos; as observações são alinhadas pela **mesma hora UTC**, sem substituir ausências por zero.
- **Treino:** dados antigos comuns com pelo menos 72 horas válidas. **Embargo:** 24 horas anteriores ao teste, para reduzir vazamento temporal. **Validação:** últimos dois dias UTC da amostra, exigindo ao menos 24 horas válidas.
- Os pesos são estimados exclusivamente no treino, e seu erro é comparado aos pesos padrão no bloco de validação, usando a mesma metodologia aproximada de combinação robusta por variável.
- **Aprovação térmica:** redução de MAE de pelo menos 2% e 0,05 °C. **Aprovação de chuva:** redução de MAE de pelo menos 2% e 0,02 mm/h, sem aumento do erro nos eventos chuvosos; são exigidas pelo menos 5 horas de chuva no treino e 3 no teste.
- Apenas variáveis aprovadas têm pesos salvos como **v3**. Se não houver ganho, o botão de calibração é bloqueado; a versão v2 anterior não é aplicada automaticamente.
- A aplicação continua limitada a **24h de antecedência, 50 km da estação e 45 dias da última observação**.
- A interface da auditoria mostra uma comparação do **erro original × erro após ajuste** nos dias reservados, junto à cobertura da amostra e a justificativa quando não aprovado. A exportação CSV também contém as estatísticas da validação.

**Limitações importantes:** os últimos dois dias são uma amostra pequena, sujeita a sorte e mudanças de regime meteorológico. O teste é retrospectivo e não comprova ganho futuro ou regional; com uma estação, não se extrapola para todo o Brasil. A comparação de chuva avalia precipitação horária, enquanto o painel oferece acumulado de 24h; os resultados não são diretamente equivalentes. Para comprovação mais forte, será necessário validar meses futuros e várias estações, sem refazer o ajuste com esses dados.

### Testes da v0.7

```bash
node --test tests/*.test.js
python3 tests/ui_smoke.py
python3 tests/calibration_smoke.py
```

Os testes automatizados usam valores **sintéticos**, e não confirmam disponibilidade ou desempenho das APIs reais.


## v0.8 — validação multiação espacial com até 60 dias (29/10/2026)

- Novo laboratório `#rede`: seleção de **3 a 6 CSVs INMET** com latitudes e longitudes; arquivos lidos no navegador e limitados a 8 MB cada. Não envia os CSVs a terceiros.
- Histórico por estação de **30, 45 ou 60 dias** e seleção de antecedência de **24, 48 ou 72 horas**. Cada estação gera até quatro consultas ao endpoint público `previous-runs-api.open-meteo.com`, com até três requisições simultâneas.
- **Modelos independentes:** ECMWF, GFS, ICON e GEM; modelos ausentes em alguma estação são retirados da comparação comum. Dados incompletos não são substituídos por zero.
- **Validação geográfica com embargo temporal:** para testar uma estação, os pesos são estimados exclusivamente em **outras duas ou mais estações**, com observações anteriores ao início do período reservado por pelo menos 24 horas. Os últimos dois dias da estação ficam separados para teste.
- A comparação reporta MAE médio por estação e a média **macro por estações**, não o total de horas somado (evita cidades muito amostradas dominarem a avaliação).
- **Critérios de uso:** requer três estações com testes válidos e ao menos dois modelos comuns; melhoria mínima de 2% e ganho absoluto; bloqueio se uma estação piorar muito ou se a chuva piorar durante eventos chuvosos.
- Resultados por variável e estação, com **exportação CSV**. Mesmo quando há ganho retrospectivo, **não ativa automaticamente os pesos no painel**: a calibração ao vivo permanece local, temporária e sujeita às regras da v0.7.
- Novos módulos `network-core.js`, `network-ui.js` e `tests/network.test.js`.

### Teste

```bash
node --test tests/*.test.js
python3 tests/ui_smoke.py
python3 tests/calibration_smoke.py
python3 tests/network_smoke.py
```

**Atenção:** os testes offline usam dados simulados. Para demonstrar ganho meteorológico real, importe ao menos três CSVs independentes de diferentes estações do INMET e valide as séries históricas das APIs. A aprovação no teste retrospectivo não significa garantia de previsão futura. A API Previous Runs conserva antecedências fixas e, conforme a documentação do provedor, sua cobertura histórica depende do modelo.


## Imagens WebP otimizadas

Ícone 160×160; radar 400×300; logotipo 780×260; favicon 64×64 e banner social 1200×630 em WebP. A hero image de 1050×591 continua no desktop; o celular usa uma versão 520×293 via picture. O PNG de favicon e o JPG social são preservados como arquivos de compatibilidade.


## Revisão técnica de estabilidade e transparência (29/10/2026)

- Pesos de calibração agora respeitam a aprovação separada de temperatura e chuva, inclusive com pesos antigos ainda salvos.
- Série horária encerrada não é apresentada como atual. Dados parciais são identificados no painel.
- Resposta principal incompleta mostra erro controlado em vez de interromper o carregamento.
- Indicador de chuva explicitamente identificado como estimativa de modelo, não medição observada.
- Favicon SVG com fallback PNG; imagem de compartilhamento JPG para maior compatibilidade, mantendo os WebPs leves na interface.
- Três novos testes de regressão, além dos testes de interface em desktop e mobile com dados meteorológicos simulados.

**Limite:** não foi realizada comprovação de maior acurácia meteorológica com observações reais nesta revisão.

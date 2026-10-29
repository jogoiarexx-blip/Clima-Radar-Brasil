# ClimaRadar Brasil — v0.7 (precisão verificada fora da amostra)

Site estático de meteorologia, otimizado para GitHub Pages, com visualização de radar observado e comparação de modelos meteorológicos. **Não é um serviço de alertas oficial.**

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

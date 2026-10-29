# ClimaRadar Brasil — v0.4, Radar + Home Premium + Mobile

Site estático de meteorologia para GitHub Pages com identidade visual própria, comparação entre modelos, radar histórico interativo e auditoria de previsões.

## O que mudou

- Interface editorial redesenhada, com hierarquia mais clara, cartões limpos e artes originais em SVG.
- Layout mobile com navegação fixa inferior, rolagem horizontal de previsões horárias e semanais, mapa responsivo e áreas de toque maiores.
- Radar de chuva com mapa Leaflet, tiles OpenStreetMap e camada RainViewer exibindo somente **quadros históricos observados**, sem prometer nowcast.
- Linha do tempo de quadros disponíveis (arraste e solte para selecionar). Sem autoplay para evitar requisições excessivas.
- Zoom radar até nível nativo 7, seguindo regras atuais da API; acima disso o Leaflet amplia imagens existentes.
- Carregamento do mapa apenas ao aproximar a seção na rolagem e fallback com link para IPMet em caso de indisponibilidade.
- Atribuição visível para RainViewer e OpenStreetMap.
- Linguagem mais cuidadosa: a concordância entre modelos não mede probabilidade de acerto.
- Ajuste de calibração por CSV limitado a municípios até 50 km da estação usada; não é verificação científica de ganho futuro.

## Arquivos

- `index.html`, `styles.css`, `premium.css`
- `app.js` — previsão multimodelo
- `audit-core.js`, `audit-ui.js` — auditoria INMET e calibração
- `radar-core.js`, `radar.js` — seleção de quadros, mapas, créditos e fallbacks
- `mobile.js` — navegação por seções em telas pequenas
- `assets/` — marca, isóbaras decorativas, estados de radar e ícones SVG
- `tests/` — testes Node e teste visual local com amostras simuladas

## Publicação

Publicar o conteúdo desta pasta **na raiz** do repositório `jogoiarexx-blip/Clima-Radar-Brasil`, branch `main`, com Pages configurado para raiz da branch. Não carregar a pasta `climaradar-brasil` como subdiretório.

## Dependências e limites

- Open-Meteo: dados de previsão e geocodificação; sujeito às condições de licença do provedor.
- RainViewer: histórico de radar das últimas duas horas, somente para uso pessoal, educacional ou comunitário de pequena escala sob regras de atribuição. API sem garantia de disponibilidade; desde janeiro/2026 não fornece nowcast futuro e limita zoom nativo a 7.
- OpenStreetMap: tiles em visualização interativa normal, sem prefetch ou downloads em lote, com atribuição. Para grande volume de visitantes, migrar para fornecedor comercial/autohospedado adequado.
- Leaflet 1.9.4: biblioteca carregada por CDN (arquivo com integridade SRI). Se o CDN falhar, há fallback textual e links oficiais.
- A linha de quadros do radar tem **dados observados**, não uma previsão de curto prazo. Uma área sem cor pode significar ausência de cobertura de radar, não garantia de tempo seco.
- O índice de concordância dos modelos não é uma medição de precisão; para calibrar acerto, comparar previsões históricas contra estações reais e testar em dados fora da amostra.

## Testes

```sh
node --test tests/*.test.js
```

`tests/ui_smoke.py` é um teste de interface com dados **simulados**, não é teste das APIs reais.

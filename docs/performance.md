# IGF TR — Performance: como funciona e como manter batendo

Página: **/performance** (menu lateral → Performance). Motor: `backend/finance/perf/`.

## O que a página calcula

| Bloco | Fonte |
|---|---|
| Cota oficial de fim de mês (série líder) | Relatórios *NAV Calculation* do administrador (upload na página) |
| Cota diária até 11/06/2026 | `NAVPosition` (histórico oficial já carregado no site) |
| Posições e P&L por ativo até o corte (24/03/2026) | `bloomberg.PositionSnapshot` (base antiga CS/Bloomberg) |
| Posições depois do corte | posições do corte + extrato UBS (data de negociação) + ajustes manuais |
| Preços depois do corte | snapshots Bloomberg do Portfolio — o snapshot tirado após o fechamento americano de cada dia |
| Cota diária entre fechamentos | P&L dos ativos − taxa adm (1% a.a.) − provisão de performance (10% acima da marca d'água), reescalada para bater exatamente na cota oficial de cada fim de mês |
| Benchmarks | `HistIndexPrice` (SPX, CCMP, SOFR) e, depois da última data, variação de SPY/QQQ |

Captações entram como cotas novas na data de cotização (último dia útil do mês; dinheiro que chega nos 12 primeiros dias do mês vai para a cotização do mês anterior). Quando existe relatório do administrador, valem os valores e as cotas dele.

## Rotina

**Todo dia — automático.** Cada upload do Portfolio (macro Bloomberg, várias vezes ao dia) recalcula esta base em segundo plano. Para cada dia útil vale o snapshot tirado depois do fechamento americano; no dia corrente, antes do fechamento, vale o último upload intraday.

**Quantidades.** Depois da última data coberta por extrato, as posições são as quantidades do Portfolio. Compras e vendas são inferidas pela mudança de quantidade e valoradas ao preço de fechamento do dia, então atualize a quantidade na planilha no dia da operação. Cupons de bonds de taxa fixa entram pelo calendário (taxa/2 × valor de face). Dividendos de ações só aparecem na cota oficial do mês.

**Todo mês — relatório do administrador.** Quando chegar o *Excel NAV Calculation – IGFWM Total Class A MM.AAAA*, envie pelo botão *Enviar extrato / relatório adm* (sem senha). A cota do mês fica oficial e a página confere a quantidade de cada ativo contra a custódia.

**Captações.** Lance em IGF TR → Captações e Resgates (manual) até o relatório do administrador chegar; depois valem os números dele.

**Extrato (opcional).** Se enviar o extrato da UBS, ele tem prioridade nas datas que cobre: preços reais de execução, dividendos, cupons e a conciliação de caixa.

## Quando uma verificação ficar amarela ou vermelha

| Sinal | O que fazer |
|---|---|
| Quantidade diferente do administrador | Falta operação: veja se foi em outra conta (subconta CAD, CSWML) e lance em *Ajustes manuais*. |
| Caixa diferente do administrador | Falta um pedaço do extrato (envie o período que falta) ou há lançamento fora da conta. |
| Lançamento sem ativo cadastrado | Ativo novo: Django admin → *Asset aliases* → adicionar (id, nome, classe, ISIN, tickers do Bloomberg) e Recalcular. |
| Lançamento não classificado (OTHER) | Django admin → *Bank transactions* → preencher *type override*. |
| Dias sem preço | A macro Bloomberg não rodou depois do fechamento; a página usa o último preço disponível. |

## Configuração inicial (uma vez, depois do deploy)

1. Envie o extrato completo desde 11/12/2025 e todos os relatórios do administrador disponíveis (abr/2026 em diante).
2. Em *Ajustes manuais*, lance a venda da Constellation (CSU) feita na subconta CAD: data 26/03/2026, tipo SELL, ativo CSU, quantidade −230, valor 400.115,32 (o valor convertido para USD que entrou na conta em 26/03).
3. Clique em *Recalcular*. Todas as conciliações de posição e caixa devem ficar verdes.

## Linha de comando

```
python manage.py rebuild_performance --statement extrato.xlsx --admin "NAV Calculation 09.2026.xlsx"
```

Importa os arquivos (opcional) e recalcula, imprimindo a cota e as verificações.

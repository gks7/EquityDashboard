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

**Todo dia — automático.** A macro Bloomberg continua subindo os snapshots do Portfolio. A página se recalcula sozinha quando há snapshot novo (ou no botão *Recalcular*).

**Toda semana — extrato.** Exporte o extrato de transações da conta UBS 308-152481 em Excel e envie pelo botão *Enviar extrato / relatório adm*. Pode mandar períodos que se sobrepõem; linhas repetidas são reconhecidas pelo nº da transação.

**Todo mês — relatório do administrador.** Quando chegar o *Excel NAV Calculation – IGFWM Total Class A MM.AAAA*, envie pelo mesmo botão (vários arquivos de uma vez funcionam). Se o arquivo vier com senha, abra no Excel e salve uma cópia sem senha. A partir daí a cota do mês fica oficial e a página confere:

- quantidade de cada ativo vs custódia do administrador;
- saldo da conta 308-152481 (soma do extrato) vs saldo do administrador;
- retorno estimado do mês vs retorno oficial (alerta acima de 25 bps; em maio/novembro a diferença costuma ser a taxa de performance cristalizada).

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

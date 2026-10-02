# Revisão de UX — 2 de outubro de 2026

Escopo: frontend local, dashboard e componentes compartilhados. Identidade visual existente preservada. Avaliação de código independente por ux_review; detector e navegador por qa_evidence. Implementação e revisão visual pelo agente principal.

## Melhorias implementadas
- Quatro indicadores principais no dashboard; seis indicadores adicionais disponíveis em seção expansível por teclado.
- Atalhos para carteira e operações; textos mais diretos.
- Falha inicial do dashboard com ação de tentar novamente, sem carregamento infinito aparente.
- Cabeçalho identifica a seção atual e não afirma conexão/sincronização sem evidência.
- Atualização de cotações com bloqueio de cliques repetidos, espera, sucesso, resultado parcial e falha recuperável.
- Foco contido nos diálogos e menu móvel; Escape fecha e devolve foco ao disparador. Exclusão inicia no botão Cancelar.
- Busca compartilhada com limpeza em um clique e retorno do foco.
- Link para pular navegação; rótulos de navegação acentuados; estado selecionado com peso e aria-current.
- Foco e barras de rolagem seguem tokens do tema; movimentos reduzidos respeitados via CSS.

## Evidências
- 45/45 testes existentes do client passaram.
- Typecheck e lint do client passaram; lint neste projeto executa TypeScript.
- Build de produção do client passou após a última correção.
- 13/13 verificações Playwright em Edge/Chromium headless passaram: 1440x1000 e 390x844. Respostas de API simuladas e isoladas, sem escrever em dados reais.
- Verificados: limpeza de busca, Tab/Escape/restauração de foco, menu móvel, falha e retry de cotações, erro e retry do dashboard, disclosure por teclado, overflow horizontal e erros JavaScript.
- Script reproduzível: scripts/ux-browser-check.cjs. Executar com frontend local iniciado; Playwright e Edge disponíveis. UX_QA_URL, UX_QA_CHANNEL e PLAYWRIGHT_MODULE permitem configurar ambiente.
- Detector Impeccable: zero achados. Lint de DESIGN.md: zero erros, nove avisos de mapeamento documental.
- Auditoria estática premium: 14 pendências preexistentes de convenções de formulários (10 de validação nativa e quatro de resize de textarea), registradas em ux-static-audit.json. Não desabilitamos validação obrigatória apenas para silenciar o auditor.

## Limitações e próximos riscos
Backend real, gravação/remoção de investimentos, Safari/Firefox, leitor de tela, zoom e contraste completo dos dois temas não foram certificados. AssetsPage ainda tem handlers CRUD sem recuperação local de erros; precisa de teste e correção por fluxo antes de uma aprovação de release completa. Capturas do dashboard mostram placeholders dos gráficos lazy, portanto não certificam os gráficos carregados. O script não cobre todos os formulários que usam os componentes compartilhados.

Resultado: melhorias verificadas no escopo descrito; não é aprovação integral para lançamento. DESIGN.md e UX-CONTRACT.md registram os padrões e as pendências de migração.

Questions skipped: o usuário já autorizou verificar e melhorar; as mudanças foram implementadas e verificadas sem decisão adicional necessária.

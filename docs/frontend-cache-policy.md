# Politica de cache do frontend

O cache de leitura fica centralizado em `apps/client/src/services/api-cache.ts`.

## TTL por dominio

- `dashboard`, `portfolio`, `monthlyPlanning`, `history`, `contributions`, `cashBoxes`, `market`, `cdi`, `ai` e `records`: 60 segundos.
- `dividends` e `goals`: 300 segundos.
- `settings`: 600 segundos.

## Nunca armazenar em cache

Mutations, projecoes, criacao/listagem direta de sessoes de chat, envio de mensagens, geracao de analises, refresh de mercado e refresh de CDI nao usam cache de resposta.

## Chaves

As chaves usam URL canonica com query parameters ordenados. Parametros `undefined`, `null` e vazios sao ignorados.

## Invalidacao

Toda mutation informa dominios afetados. Apenas esses dominios sao removidos do cache e sincronizados com a store.

## Erros e chamadas simultaneas

Respostas com erro nao sao armazenadas. Chamadas simultaneas com a mesma chave compartilham a mesma `Promise`; em sucesso ela popula o cache, em erro ela sai do mapa de deduplicacao.

## Sessao e memoria

O cache possui escopo por usuario/sessao, limite maximo de entradas e limpeza explicita para logout. Ao trocar o escopo, todo o cache anterior e removido para evitar compartilhamento de dados entre usuarios.

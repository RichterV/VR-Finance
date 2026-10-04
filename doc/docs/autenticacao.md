# Autenticação

O app exige login. Não existe cadastro público — a criação de novos usuários só pode ser feita
por um usuário **master**, autenticado, pelo painel de Administração.

## Regras

- Usuário master: username e senha definidos em `backend/.env` (`MASTER_USERNAME`/`MASTER_PASSWORD`),
  criado no banco via `seed_master.py` — ver [Setup - Backend](setup-backend.md)
- Dados financeiros (`gastos`, `receitas`, `recorrencias`, `dropdown_options`, `vehicles`,
  `vehicle_services`, `operacoes_bolsa`, `devedores`, `attachments`, `notificacoes`) são **separados
  por usuário** — o `user_id` vem sempre do token, nunca do cliente
- O master também usa o app normalmente (cadastra os próprios gastos/receitas), além de administrar
  as outras contas
- Somente o master pode criar, editar (username, nome, senha, módulos) ou excluir outros usuários —
  regra fixa, não delegável (não existe "promover outro usuário a master")
- O usuário master não pode ser excluído, nem por ele mesmo — validado pelo `role`, não pelo username,
  então vale pra qualquer usuário que algum dia tenha `role == master`
- Excluir um usuário apaga em cascata todos os dados dele (inclusive os anexos em disco) — diferente
  do soft delete de categoria/veículo, aqui é exclusão real, já que o usuário inteiro está saindo
- Todo usuário pode editar a própria conta (username, nome, sobrenome) e trocar a própria senha
- Senhas são sempre armazenadas com hash (bcrypt) — nunca em texto puro no banco

## Fluxo

1. `POST /auth/login` com `username` e `password` (form-encoded, padrão OAuth2) → retorna um JWT
   válido por 7 dias (não há refresh token)
2. O frontend guarda o token e o envia em `Authorization: Bearer <token>` em toda chamada às demais
   rotas (um `HttpInterceptor` faz isso num lugar só)
3. `GET /auth/me` retorna os dados do usuário logado — nome (saudação da Home), `role` (mostra ou não
   a Administração), `modules` (monta o menu) e `must_change_password`
4. Se `must_change_password` estiver ligado, o app vai pra tela **Defina sua senha** antes de liberar
   qualquer outra coisa (ver [Troca obrigatória de senha](#troca-obrigatoria-de-senha))
5. Logout é só local (não existe endpoint de logout) — o frontend descarta o token guardado. "Sair"
   fica no menu lateral e no modal de Perfil

## JWT e revogação

O token (HS256, chave `SECRET_KEY` do `.env`) carrega:

| claim | conteúdo |
|---|---|
| `sub` | username |
| `uid` | id do usuário |
| `tv` | `users.token_version` no momento da emissão |
| `iat` | instante da emissão, **com fração de segundo** |
| `exp` | expiração (7 dias) |
| `imp` | `true` só em token gerado por "Mudar pra conta teste" (ver [Impersonação](#conta-de-teste-e-impersonacao)) |

A cada requisição o backend busca o usuário por `uid` e recusa (401) se o username não bater com o
`sub`, se a versão não bater com `tv` ou se o token foi emitido antes de `users.created_at`:

- **Revogação por senha**: trocar a própria senha ou ter a senha resetada pelo master incrementa
  `token_version` — todos os tokens emitidos antes deixam de valer, em todos os aparelhos. Quem
  trocou a senha recebe um token novo na própria resposta (`PUT /auth/me/password` devolve
  `access_token`), então o aparelho que fez a troca continua logado.
- **Por que `iat` vs. `created_at`**: o SQLite reaproveita o id de um usuário excluído. Só `uid` +
  `tv` deixariam um token antigo de uma conta excluída valer pra uma conta **nova** criada com o
  mesmo username (mesmo id, `token_version` de novo em 0). Comparar o instante de emissão com a
  criação da conta fecha essa brecha — e por isso o `iat` precisa da fração de segundo. Esse caso
  foi pego por teste, não estava no plano original.
- Token sem `uid`/`tv` (emitido antes dessa regra existir) não vale mais — custou um login a mais,
  uma vez só, depois do deploy.

## Limite de tentativas de login

`app/login_guard.py`, em memória (o uvicorn roda com um worker só; reiniciar o backend zera os
contadores, o que é aceitável):

- **5 falhas do mesmo username em 15 minutos** → `429 Too Many Requests` com `Retry-After`, até a
  janela passar. Um login bem-sucedido zera o contador daquele username.
- **Teto global de 30 falhas por minuto**, somando todos os usernames — freia tentativas espalhadas
  por vários nomes.
- **Por que não por IP**: o tráfego que chega pelo Tailscale (`tailscale serve` → nginx → backend)
  aparece pro backend sempre como `127.0.0.1`. Limitar por IP bloquearia todo mundo ao mesmo tempo.

Quando o username não existe, o backend ainda roda um bcrypt contra um hash fixo
(`verify_password_dummy`): sem isso, a resposta "usuário inexistente" voltaria bem mais rápido que
"senha errada", e o tempo de resposta revelaria quais usernames existem.

## Módulos opcionais por usuário

Além de Início (resumos, Gastos, Receitas, Categorias — sempre disponível), cada usuário tem um
conjunto de **módulos opcionais** habilitados (tabela `user_modules`, ver
[Modelo de dados](modelo-de-dados.md#user_modules)):

| chave | o que libera |
|---|---|
| `veiculos` | Manutenção Veículos |
| `operacoes_bolsa` | Operações Bolsa |
| `devedores` | Devedores (e o badge de pendências no menu) |
| `ferramentas` | Ferramentas (calculadoras, só frontend) |
| `exportar_dados` | Exportar Dados |
| `analise_inflacionaria` | seção Análise inflacionária da Home e os toggles de cesta em Categorias (módulo sem tela própria) |

- O master sempre tem todos. Usuário novo começa **sem nenhum** — o master marca no formulário.
- **Bloqueio nas duas pontas**, de propósito: o frontend esconde o item do menu e um `moduleGuard`
  redireciona a rota pra `/home`; o backend responde `403` via `require_module(...)` no router de
  cada módulo (inclusive anexos e exportação desses módulos — ver
  [API](api.md#modulos-opcionais)). Esconder só no frontend deixaria a API aberta pra quem
  chamasse direto.
- Vale na hora, sem novo login: o usuário (e seus módulos) é relido do banco a cada requisição.
- Desabilitar um módulo só esconde/bloqueia — os dados continuam no banco e voltam a aparecer se o
  módulo for reabilitado.

## Painel de Administração

Página `/admin`, só pro master (`masterGuard` no frontend, `require_master` no backend). Concentra
tudo que mexe em **outras** contas:

- Lista de usuários com nome, username, perfil, **última atividade** ("Nunca" se a conta ainda não
  usou o app), módulos habilitados e o marcador "Troca de senha pendente"
- Criar/editar usuário (username, nome, sobrenome, senha inicial ou reset opcional, um toggle por
  módulo). Ao editar a própria linha, o master não troca o username por ali (isso é feito pelo
  Perfil, que já cuida do token novo)
- Excluir usuário (com confirmação — exclusão em cascata, sem "Desfazer")
- "Mudar pra conta teste"

`last_activity_at` é gravado a cada requisição autenticada (no máximo uma escrita por minuto por
usuário, pra não escrever no SQLite a cada chamada) e também no login.

## Troca obrigatória de senha

Toda conta criada pelo master, e toda conta cuja senha o master resetou no admin, fica com
`must_change_password = true` — o master conhece aquela senha, então o dono precisa definir uma
própria antes de usar o app.

- **Backend**: enquanto a flag estiver ligada, todo endpoint responde `403` ("Troca de senha
  obrigatória antes de continuar"). As únicas exceções são `GET /auth/me` e
  `PUT /auth/me/password`, que usam uma dependência separada
  (`get_current_user_allow_password_change`).
- **Frontend**: o `authGuard` manda pra `/trocar-senha` (fora do layout principal, com o visual do
  login e um link "Sair"). A senha nova precisa ser diferente da atual; trocar zera a flag e segue
  pra Home.
- Não vale pro master resetando a própria senha pelo admin (ele mesmo escolheu a senha).

## Editar a própria conta (Perfil)

O modal de Perfil só mexe na conta logada: username, nome e sobrenome (`PUT /auth/me`), troca de
senha (`PUT /auth/me/password`) e "Sair".

Como o `sub` do JWT é o username, trocar o username invalidaria o token atual — por isso o endpoint
devolve `{access_token, user}` e o frontend substitui o token guardado. O username continua único
no banco (400 se já existir). A troca de username/senha também atualiza a credencial lembrada no
armazenamento seguro do celular (ver abaixo), senão o login por digital passaria a falhar.

## Conta de teste e impersonação

`POST /auth/switch-to-teste` (só master) gera um token para o usuário `teste` sem pedir a senha
dele — usado pelo botão "Mudar pra conta teste" do painel de Administração, pra testar/demonstrar o
app com a base mocada sem tocar nos dados reais. Não existe endpoint pra "voltar": trocar de volta
exige logout + login manual (decisão deliberada — o endpoint só existe pra essa direção e pra essa
conta específica, não é um mecanismo genérico de impersonação de qualquer usuário).

O token gerado leva `"imp": true`. Com ele, as requisições **não** atualizam a última atividade da
conta `teste` (quem está usando é o master), e a marca é preservada no token novo que `PUT /auth/me`
devolve. O switch também não conta como login (`last_login_at`).

## Tratamento de 401/403 no frontend

O `authInterceptor` (`core/auth.interceptor.ts`) trata as respostas num lugar só:

- **401** com o token usado ainda sendo o guardado → logout (uma vez só: as outras requisições em
  voo que voltarem com 401 depois não disparam nada de novo). Cobre sessão expirada e token
  revogado mesmo com a tela parada — antes isso só era percebido ao navegar.
- **403 de troca de senha pendente** → navega pra `/trocar-senha`.
- As mensagens de erro dos modais usam o `detail` devolvido pelo backend.

## No app Android (APK)

Duas camadas extras existem só no APK nativo — ambas **locais**, nenhuma muda o token de 7 dias nem
a validação do backend:

- **Login por digital**: depois de um login manual com "Lembrar usuário e senha", o app oferece
  ativar a digital. A credencial fica no armazenamento seguro nativo do Android; nas próximas
  aberturas, a digital libera essa credencial, que é reenviada pro `POST /auth/login` de verdade
  (gera um JWT novo — não há refresh token pra reaproveitar). Desmarcar "Lembrar" apaga também a
  preferência de digital.
- **Bloqueio ao voltar pro app**: depois de X minutos em segundo plano (imediatamente / 1 / 5 / 15
  min / nunca, escolhido no Perfil e guardado por aparelho; padrão de 5 min se a digital estiver
  ativa), uma tela por cima de tudo pede a digital (com o PIN/padrão do aparelho como alternativa).
  É um overlay, não uma navegação — o que estava aberto embaixo continua intacto. Também bloqueia
  na abertura a frio com token salvo (o Android costuma matar o processo em segundo plano). Abrir a
  câmera, o seletor de arquivos ou a folha de compartilhar não dispara o bloqueio na volta. "Sair e
  entrar com senha" faz logout.

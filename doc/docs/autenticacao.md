# Autenticação

O app exige login. Não existe cadastro público — a criação de novos usuários só pode ser feita
por um usuário **master**, autenticado, através de um endpoint restrito.

## Regras

- Usuário master: username e senha definidos em `backend/.env` (`MASTER_USERNAME`/`MASTER_PASSWORD`),
  criado no banco via `seed_master.py` — ver [Setup - Backend](setup-backend.md)
- Dados financeiros (`gastos`, `receitas`, `dropdown_options`, `operacoes_bolsa`, `devedores`,
  `attachments`, além de `vehicles`/`vehicle_services`) são **separados por usuário**
- O master também usa o app normalmente (cadastra os próprios gastos/receitas), além de poder criar
  novos usuários
- Somente o master pode criar, editar (username e/ou resetar senha) ou excluir outros usuários — regra
  fixa, não delegável a outros usuários (não existe "promover outro usuário a master")
- O usuário master não pode ser excluído, nem por ele mesmo — validado pelo `role`, não pelo username,
  então vale pra qualquer usuário que algum dia tenha `role == master`
- Excluir um usuário apaga em cascata todos os dados dele (`gastos`, `receitas`, `dropdown_options`,
  `vehicles`, `vehicle_services`, `operacoes_bolsa`, `devedores`, `attachments`) — diferente do soft
  delete de item/veículo, aqui é exclusão real
- Usuários comuns podem trocar a própria senha; só o master pode criar contas novas
- Senhas são sempre armazenadas com hash (bcrypt) — nunca em texto puro no banco

## Fluxo

1. `POST /auth/login` com `username` e `password` (form-encoded, padrão OAuth2) → retorna um JWT
2. O frontend guarda o token e o envia em `Authorization: Bearer <token>` em toda chamada às demais rotas
3. `GET /auth/me` retorna os dados do usuário logado (para exibir nome/role na UI e decidir se mostra
   a opção "Criar usuário")
4. `PUT /auth/me/password` troca a própria senha (exige a senha atual)
5. `POST /auth/users` cria um novo usuário — só funciona se quem está autenticado tiver `role == master`,
   senão retorna `403 Forbidden`
6. Logout é só local (não existe endpoint de logout) — o frontend descarta o token guardado. O botão
   "Sair" fica disponível tanto no menu lateral quanto no modal de Perfil
7. `POST /auth/switch-to-teste` (só master) troca o token guardado pelo do usuário `teste`, sem pedir
   senha dele — usado pelo botão "Mudar pra conta teste" no Perfil, pra testar/demonstrar o app com
   dados mocados sem deslogar. Não existe endpoint pra "voltar": trocar de volta pro usuário master
   exige logout + login manual de novo (decisão deliberada — o endpoint só existe pra essa direção
   específica, não é um mecanismo genérico de impersonação de qualquer usuário)

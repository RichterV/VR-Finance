export const environment = {
  production: true,
  apiUrl: 'https://seu-servidor.seu-tailnet.ts.net/api',
  // Tentado primeiro (rede de casa, direto no nginx); sem resposta, usa o apiUrl (Tailscale).
  // Ver core/api-base.ts. Vazio desliga a tentativa.
  localApiUrl: 'http://ip-local-do-servidor:8080/api',
};

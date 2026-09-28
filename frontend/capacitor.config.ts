import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.vrfinance',
  appName: 'VR Finance',
  webDir: 'www',
  // Sem `server.androidScheme`: o app volta ao padrao do Capacitor (https://localhost). Enquanto a
  // API era http:// puro, o app precisava ser servido em http tambem pra nao cair no bloqueio de
  // "conteudo misto" do WebView; desde que o servidor passou a ter HTTPS via Tailscale, os dois
  // lados sao https e esse contorno deixou de ser necessario.
  // allowMixedContent: o app (https://localhost) tenta primeiro o servidor pelo IP da rede local,
  // que e http puro (o certificado do Tailscale so vale pro hostname) -- ver core/api-base.ts. O
  // cleartext em si so e liberado pra esse IP, em res/xml/network_security_config.xml.
  android: {
    allowMixedContent: true,
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.vrfinance',
  appName: 'VR Finance',
  webDir: 'www',
  // Capacitor serve as paginas do app em https://localhost por padrao. Como a API roda em
  // http:// puro (via Tailscale, sem certificado), isso seria bloqueado como "conteudo misto"
  // pelo motor do WebView -- independente do network_security_config.xml (esse resolve bloqueio
  // de cleartext do Android, mas nao bloqueio de mixed content do navegador). Servindo o proprio
  // app em http:// tambem, os dois lados ficam no mesmo esquema e a chamada deixa de ser bloqueada.
  server: {
    androidScheme: 'http',
  },
};

export default config;

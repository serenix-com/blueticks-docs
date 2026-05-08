export interface AppConfig {
  APP_ENDPOINT: string;
}

const configs = {
  local: { APP_ENDPOINT: 'http://localhost:3010' },
  staging: { APP_ENDPOINT: 'https://staging--blueticks-app.netlify.app' },
  prod: { APP_ENDPOINT: 'https://app.blueticks.co' },
} as const satisfies Record<string, AppConfig>;

export function getAppConfig(hostname: string | undefined): AppConfig {
  if (!hostname) return configs.prod;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return configs.local;
  }
  if (hostname.includes('staging') || hostname.startsWith('dev.')) {
    return configs.staging;
  }
  return configs.prod;
}

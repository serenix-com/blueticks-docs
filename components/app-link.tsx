'use client';

import { useEffect, useState } from 'react';
import { getAppConfig } from '@/lib/app-config';

const PROD_HOST = 'app.blueticks.co';

interface AppLinkProps {
  path?: string;
  children?: React.ReactNode;
  showHost?: boolean;
}

export function AppLink({ path = '/', children, showHost = false }: AppLinkProps) {
  const [endpoint, setEndpoint] = useState(getAppConfig(undefined).APP_ENDPOINT);

  useEffect(() => {
    setEndpoint(getAppConfig(window.location.hostname).APP_ENDPOINT);
  }, []);

  const href = endpoint.replace(/\/$/, '') + path;
  const displayText = PROD_HOST + path;

  return (
    <a href={href} target="_blank" rel="noreferrer" suppressHydrationWarning>
      {showHost ? displayText : (children ?? displayText)}
    </a>
  );
}

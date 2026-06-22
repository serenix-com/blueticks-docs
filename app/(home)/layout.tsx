import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { ForceDarkTheme } from './force-dark-theme';

// The home page is designed dark-only, so we force real dark mode here and drop
// the theme toggle. The /docs pages keep the light/dark switch — they don't run
// this script/component, and we never persist the forced value to localStorage.
//
// This inline script runs before paint on hard loads (and after next-themes'
// own script, since the home subtree is nested below RootProvider) so the page
// never flashes the stored light theme. <ForceDarkTheme> handles client-side
// navigation and restores the user's real theme when they leave the home route.
const FORCE_DARK = `try{var e=document.documentElement;e.classList.add('dark');e.classList.remove('light');e.style.colorScheme='dark';}catch(_){}`;

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: FORCE_DARK }} />
      <ForceDarkTheme />
      <HomeLayout {...baseOptions()} themeSwitch={{ enabled: false }}>
        {children}
      </HomeLayout>
    </>
  );
}

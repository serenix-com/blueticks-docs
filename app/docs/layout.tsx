import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { getResolvedServerCount } from '@/lib/openapi';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const serverCount = getResolvedServerCount();
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      <div data-api-server-count={serverCount} className="contents">
        {children}
      </div>
    </DocsLayout>
  );
}

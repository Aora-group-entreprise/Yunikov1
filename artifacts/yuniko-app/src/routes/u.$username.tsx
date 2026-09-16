import { createFileRoute } from '@tanstack/react-router';
import App from '../App';

export const Route = createFileRoute('/u/$username')({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} · Yuniko` },
      {
        name: 'description',
        content: `View @${params.username} on Yuniko.`,
      },
      { property: 'og:title', content: `@${params.username} · Yuniko` },
    ],
  }),
  component: App,
});

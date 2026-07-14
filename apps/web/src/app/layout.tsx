import type { ReactNode } from 'react';

export const metadata = {
  title: 'MasalAI',
  description: 'Personalized AI storybooks for children',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

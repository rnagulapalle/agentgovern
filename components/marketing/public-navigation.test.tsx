import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import LandingPage from '@/app/page';
import { ProductOverview } from './product-overview';

it('public home links never send anonymous visitors to disabled platform workspaces', () => {
  const html = renderToStaticMarkup(<LandingPage />);
  const protectedLinks = [...html.matchAll(/href="(\/control-plane[^\"]*)"/g)].map(match => match[1]);
  expect(protectedLinks.length).toBeGreaterThan(0);
  expect(new Set(protectedLinks)).toEqual(new Set(['/control-plane/quotes']));
  expect(html).toContain('independent approval');
  expect(html).toContain('simulated confirmation email');
  expect(html).not.toContain('no model runs');
});

it('every rendered home section link and product explanation anchor has a destination', () => {
  const home = renderToStaticMarkup(<LandingPage />);
  const overview = renderToStaticMarkup(<ProductOverview quoteOnly />);
  for (const match of home.matchAll(/href="(?:\/)?#([^\"]+)"/g)) expect(home).toContain(`id="${match[1]}"`);
  for (const match of home.matchAll(/href="\/platform#([^\"]+)"/g)) expect(overview).toContain(`id="${match[1]}"`);
  for (const id of ['workflow-boundaries', 'approved-execution', 'verified-outcomes']) expect(overview).toContain(`id="${id}"`);
});

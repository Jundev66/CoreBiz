import { apiForRequest } from '@/api/session';
import { AppFrame } from '@/ui/shell';

/**
 * The frame of every screen inside the application, mounted once.
 *
 * Each page used to render the frame itself. On a client navigation that meant the menu,
 * the account area and the assistant were rendered again and sent again with the next
 * page's data, and nothing changed on screen until all of it was ready: a click on
 * "Products" left "Customers" frozen in place for as long as the server took.
 *
 * A layout is kept across navigations inside its group. Only the page below it is fetched,
 * and each module's `loading.tsx` shows a skeleton the moment the link is clicked.
 *
 * The route group `(app)` changes no URL. What stays OUTSIDE it is exactly what must not
 * carry the frame: the account screens, the public landing, the demo door, the wait screen
 * and the print view of a delivery note.
 *
 * `apiForRequest()` is wrapped in React's `cache()`, so a page rendered in the same request
 * as this layout reuses the session instead of asking the API twice.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ctx, session } = await apiForRequest();

  return (
    <AppFrame ctx={ctx} session={session}>
      {children}
    </AppFrame>
  );
}

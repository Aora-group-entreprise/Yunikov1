/* eslint-disable */
// This file is kept in source control for typecheck/CI; TanStack Start regenerates it from src/routes during Vite builds.
import { Route as rootRoute } from './routes/__root';
import { Route as indexRoute } from './routes/index';
import { Route as usernameRoute } from './routes/u.$username';

const IndexRoute = indexRoute.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as never);
const UsernameRoute = usernameRoute.update({
  id: '/u/$username',
  path: '/u/$username',
  getParentRoute: () => rootRoute,
} as never);

export const routeTree = rootRoute.addChildren([IndexRoute, UsernameRoute]);

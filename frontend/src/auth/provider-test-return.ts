export function isProviderTestReturn(location: Pick<Location, 'pathname' | 'search'>): boolean {
  return location.pathname === '/authentication-settings'
    && typeof new URLSearchParams(location.search).get('test') === 'string';
}

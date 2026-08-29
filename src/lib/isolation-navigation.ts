const ISOLATED_PATH = "/view";

function pathForHref(currentPathname: string, href: string) {
  if (href.startsWith("#") || href.startsWith("?")) return currentPathname;
  return href.split(/[?#]/, 1)[0];
}

export function crossesIsolationBoundary(currentPathname: string, href: string) {
  return (currentPathname === ISOLATED_PATH) !== (pathForHref(currentPathname, href) === ISOLATED_PATH);
}

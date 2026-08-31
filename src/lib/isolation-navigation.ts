const ISOLATED_PATH = /^\/(?:en|zh-CN|es|de|fr|ja|pt|ru|ko|it)\/view\/?$/;

function pathForHref(currentPathname: string, href: string) {
  if (href.startsWith("#") || href.startsWith("?")) return currentPathname;
  return href.split(/[?#]/, 1)[0];
}

export function crossesIsolationBoundary(currentPathname: string, href: string) {
  return ISOLATED_PATH.test(currentPathname) !== ISOLATED_PATH.test(pathForHref(currentPathname, href));
}

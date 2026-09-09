// Public identifiers, not API secrets. Add an entry to connect another site.
const projects: Record<string, readonly string[]> = {
  anyfile: ["https://www.anyfile.top", "https://anyfile.top"],
};

export function isAllowedOrigin(project: string, origin: string, local: boolean): boolean {
  if (!Object.hasOwn(projects, project)) return false;
  return projects[project].includes(origin)
    || (local && ["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin));
}

import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import {
  NavigationMenu, NavigationMenuContent, NavigationMenuItem,
  NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

type NavigationGroup = {
  label: string;
  links: { href: string; label: string; formats: string }[];
};

export function SiteNavigation({ groups, label, categoriesLabel }: {
  groups: NavigationGroup[];
  label: string;
  categoriesLabel: string;
}) {
  return <>
    <NavigationMenu className="hidden lg:flex" aria-label={label}>
      <NavigationMenuList>
        {groups.map((group) => <NavigationMenuItem key={group.label}>
          <NavigationMenuTrigger>{group.label}</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="flex w-72 flex-col gap-1">
              {group.links.map((link) => <li key={link.href}>
                <NavigationMenuLink closeOnClick render={<IsolationBoundaryLink href={link.href} />}>
                  <span className="flex flex-col gap-1"><span className="font-medium">{link.label}</span><span className="text-xs text-muted-foreground">{link.formats}</span></span>
                </NavigationMenuLink>
              </li>)}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>)}
      </NavigationMenuList>
    </NavigationMenu>
    <NavigationMenu align="center" className="lg:hidden" aria-label={label}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>{categoriesLabel}</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="flex max-h-[70dvh] w-72 max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto p-2">
              {groups.map((group) => <div key={group.label}>
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
                <ul>
                  {group.links.map((link) => <li key={link.href}>
                    <NavigationMenuLink closeOnClick render={<IsolationBoundaryLink href={link.href} />}>
                      <span className="flex flex-col gap-1"><span>{link.label}</span><span className="text-xs text-muted-foreground">{link.formats}</span></span>
                    </NavigationMenuLink>
                  </li>)}
                </ul>
              </div>)}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  </>;
}

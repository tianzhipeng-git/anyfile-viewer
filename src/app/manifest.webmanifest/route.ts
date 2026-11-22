import { webAppManifestResponse } from "@/lib/pwa/manifest";

export const dynamic = "force-static";

export function GET() {
  return webAppManifestResponse("en");
}

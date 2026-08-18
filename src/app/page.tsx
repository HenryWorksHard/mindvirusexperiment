import { LiveDashboard } from "@/components/live/LiveDashboard";
import { getLiveSnapshot, getSiteLinks } from "@/lib/public-data";
import { getCurrentExperiment } from "@/lib/experiment/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [current, links] = await Promise.all([getCurrentExperiment(), getSiteLinks()]);
  const snapshot = await getLiveSnapshot(current?.id ?? null, { messageLimit: 200, eventLimit: 150 });
  return <LiveDashboard initial={snapshot} links={links} />;
}

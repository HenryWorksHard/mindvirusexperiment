import { notFound } from "next/navigation";
import { ExperimentArchiveView } from "@/components/archive/ExperimentArchiveView";
import { getAdoptionTimeline, getExperimentByNumber, getLiveSnapshot, getSiteLinks } from "@/lib/public-data";
import { expNo } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return { title: `EXPERIMENT ${expNo(Number(number))}` };
}

export default async function ExperimentPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const exp = await getExperimentByNumber(n);
  if (!exp) notFound();
  const [snapshot, timeline, links] = await Promise.all([getLiveSnapshot(exp.id, { messageLimit: 400, eventLimit: 300 }), getAdoptionTimeline(exp.id), getSiteLinks()]);
  return <ExperimentArchiveView snapshot={snapshot} timeline={timeline} links={links} />;
}

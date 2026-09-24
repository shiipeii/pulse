import { notFound } from "next/navigation";
import { loadChannel } from "@/lib/ingest";
import { HostedForm } from "./HostedForm";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
// Room for the background classification that runs after a submission.
export const maxDuration = 60;

/** Public Pulse-hosted feedback form. Shareable / embeddable link. */
export default async function FormPage({ params }: { params: { channelId: string } }) {
  const channel = await loadChannel(params.channelId);
  if (!channel || channel.type !== "form") notFound();
  const session = await getSession();
  const signedInEmail = session?.email?.includes("@") ? session.email : null;

  return (
    <div className="mx-auto max-w-xl">
      <HostedForm channelId={channel.id} channelName={channel.name} signedInEmail={signedInEmail} />
    </div>
  );
}

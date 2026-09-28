import { redirect } from "next/navigation";
import { getProduct } from "@/lib/product";
import { getStaff } from "@/lib/auth-server";
import { AdminHome } from "@/components/home/AdminHome";
import { PmHome } from "@/components/home/PmHome";
import { EngineerHome } from "@/components/home/EngineerHome";
import { StakeholderHome } from "@/components/home/StakeholderHome";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Home: everyone lands here after signing in, and sees the page built for
 * their role (PRD → Information architecture → Role-based home pages).
 *   admin       → master view (every feature, View as, setup check)
 *   pm          → Needs a decision
 *   engineer    → My bugs
 *   stakeholder → Summary
 */
export default async function Home({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const product = await getProduct(searchParams.product);
  if (!product) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold">Can&apos;t load Teacher&apos;s Workspace</h1>
        <p className="mt-2 text-sm text-slate-500">
          Either the database setup (<code>SETUP_ALL.sql</code>) hasn&apos;t been run, or Pulse can&apos;t reach Supabase. Check{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> in Vercel matches Supabase → Connect, then redeploy.
        </p>
      </div>
    );
  }

  switch (staff.role) {
    case "admin":
      return <AdminHome product={product} staff={staff} />;
    case "pm":
      return <PmHome product={product} staff={staff} />;
    case "engineer":
      return <EngineerHome product={product} staff={staff} who={searchParams.who || undefined} />;
    default:
      return <StakeholderHome product={product} staff={staff} />;
  }
}

import { LoginForms } from "./LoginForms";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="mx-auto mt-12 max-w-sm space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pulse — staff sign-in</h1>
        <p className="text-sm text-slate-500">For product, tech and stakeholder teams.</p>
      </div>
      <LoginForms next={searchParams.next ?? "/"} passwordEnabled={Boolean(process.env.DASHBOARD_PASSWORD)} />
      <p className="text-xs text-slate-500">
        Teachers: see your own feedback at <a href="/me" className="text-pulse-600 hover:underline">Your feedback</a>.
      </p>
    </div>
  );
}

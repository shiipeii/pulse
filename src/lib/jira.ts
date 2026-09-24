/**
 * Minimal Jira Cloud client (REST v3). Configure with JIRA_BASE_URL,
 * JIRA_EMAIL, JIRA_API_TOKEN and JIRA_PROJECT_KEY. Without them, tickets are
 * still drafted in Pulse and can be copied into Jira by hand.
 */
export function jiraConfigured(): boolean {
  return Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN && process.env.JIRA_PROJECT_KEY);
}

function headers() {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" };
}

const base = () => process.env.JIRA_BASE_URL!.replace(/\/$/, "");

/** Plain text → Atlassian Document Format (one paragraph per line). */
function adf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line.trim() ? [{ type: "text", text: line }] : [],
    })),
  };
}

export async function createJiraIssue(args: { title: string; body: string; category: string }): Promise<{ key: string; url: string }> {
  const issuetype =
    args.category === "bug" ? process.env.JIRA_BUG_ISSUE_TYPE ?? "Bug" : process.env.JIRA_FEATURE_ISSUE_TYPE ?? "Story";
  const res = await fetch(`${base()}/rest/api/3/issue`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY },
        summary: args.title.slice(0, 250),
        description: adf(args.body),
        issuetype: { name: issuetype },
        labels: ["pulse"],
      },
    }),
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { key: string };
  return { key: data.key, url: `${base()}/browse/${data.key}` };
}

export async function commentOnJiraIssue(key: string, text: string): Promise<void> {
  const res = await fetch(`${base()}/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ body: adf(text) }),
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

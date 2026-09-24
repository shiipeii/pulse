import { NextRequest, NextResponse } from "next/server";
import { createChannel } from "@/lib/channels";
import { getProduct } from "@/lib/product";
import { supabaseRead } from "@/lib/supabase";
import type { ChannelType, Decoder, MappingConfig } from "@/lib/types";
import { requireStaff, ForbiddenError } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/channels?product=tw — list channels for the tenant. */
export async function GET(req: NextRequest) {
  const product = await getProduct(req.nextUrl.searchParams.get("product") ?? undefined);
  if (!product) return NextResponse.json({ error: "No product" }, { status: 404 });

  const { data, error } = await supabaseRead()
    .from("channels")
    .select("id, name, type, decoder, inbound_address, sender_allowlist, is_active, created_at")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data });
}

interface CreateBody {
  name: string;
  type: ChannelType;
  decoder?: Decoder;
  mappingConfig?: MappingConfig;
  senderAllowlist?: string[];
  formsgSecret?: string;
  mailboxAddress?: string;
  product?: string;
}

/**
 * POST /api/channels — the add-channel wizard's backend. Creates the channel
 * record and returns the copy-paste artifact (form link / webhook URL / email).
 */
export async function POST(req: NextRequest) {
  try {
    await requireStaff(["admin", "pm"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.type) {
    return NextResponse.json({ error: "name and type are required" }, { status: 422 });
  }
  if (!["form", "webhook", "email", "mailbox"].includes(body.type)) {
    return NextResponse.json({ error: "type must be form | webhook | email | mailbox" }, { status: 422 });
  }
  if (body.type === "webhook" && body.decoder === "formsg" && !body.formsgSecret) {
    return NextResponse.json(
      { error: "FormSG channels require formsgSecret (storage-mode secret key)" },
      { status: 422 },
    );
  }

  const product = await getProduct(body.product);
  if (!product) return NextResponse.json({ error: "No product" }, { status: 404 });

  try {
    const created = await createChannel({
      productId: product.id,
      name: body.name,
      type: body.type,
      decoder: body.decoder,
      mappingConfig: body.mappingConfig,
      senderAllowlist: body.senderAllowlist,
      formsgSecret: body.formsgSecret,
      mailboxAddress: body.mailboxAddress,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

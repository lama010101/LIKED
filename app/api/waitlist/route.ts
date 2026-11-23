import { NextResponse } from "next/server";
import { isProductionDeployment, isValidEmailShape } from "@/lib/landing/waitlist";

// STUB (V2-LANDING-002-A, UI only). The real waitlist route (storage, rate
// limiting, Turnstile, double opt-in...) is a LATER task and will REPLACE this
// file. Until then: outside production it validates the email shape and
// answers {"ok":true} WITHOUT storing or logging anything; in production it is
// a 404 so nothing can be submitted to a stub.
export async function POST(request: Request) {
  if (isProductionDeployment()) {
    return new NextResponse(null, { status: 404 });
  }

  let email: unknown;
  let honeypot: unknown;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      email = body.email;
      honeypot = body.website;
    } else {
      const form = await request.formData();
      email = form.get("email");
      honeypot = form.get("website");
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  // Honeypot filled => a bot. Answer like a success so it learns nothing.
  if (typeof honeypot === "string" && honeypot !== "") {
    return NextResponse.json({ ok: true });
  }
  if (!isValidEmailShape(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

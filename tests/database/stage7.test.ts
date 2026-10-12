import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import sharp from "sharp";
import { createBillingHarness } from "./billing-harness";
import { reconcileBatch } from "../../lib/payments/reconciliation";
import { razorpay } from "../../lib/payments/razorpay";
import {
  reconcilePayment,
  fingerprint,
  checkedRpc,
  type PaymentService,
} from "../../lib/payments/server";
const {
  sql,
  as,
  ids,
  literal,
  concurrentSql,
  value,
  plan,
  planTerms,
  admin,
  getQuote,
  accept,
  clock,
  account,
  service: serviceSql,
  prepared,
  captured,
  observe,
} = createBillingHarness(true);
const config = {
  keyId: "rzp_test_local",
  keySecret: "local-fixture-secret",
  webhookSecret: "local-webhook-secret",
};
const orders = new Map<
  string,
  {
    id: string;
    receipt: string;
    amount: number;
    currency: string;
    status: string;
  }
>();
const payments = new Map<
  string,
  {
    id: string;
    order_id: string;
    amount: number;
    currency: string;
    status: string;
    amount_refunded: number;
  }
>();
let server: Server,
  origin: string,
  requests = 0;
before(async () => {
  server = createServer(async (req, res) => {
    requests++;
    res.setHeader("Content-Type", "application/json");
    // Synchronous Docker SQL calls can outlast idle keep-alive timers in this fixture.
    // Close local sockets rather than retrying an uncertain financial POST.
    res.setHeader("Connection", "close");
    if (
      req.headers.authorization !==
      `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`
    ) {
      res.writeHead(401).end("{}");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : null;
    const path = req.url ?? "";
    let result: unknown;
    if (path === "/v1/orders" && req.method === "POST") {
      const id = `order_${orders.size + 1}`;
      result = { id, ...body, status: "created" };
      orders.set(
        id,
        result as {
          id: string;
          receipt: string;
          amount: number;
          currency: string;
          status: string;
        },
      );
    } else if (path.startsWith("/v1/orders/") && path.endsWith("/payments"))
      result = orders.has(path.split("/")[3])
        ? {
            items: [...payments.values()].filter(
              (p) => p.order_id === path.split("/")[3],
            ),
          }
        : undefined;
    else if (path.startsWith("/v1/orders/"))
      result = orders.get(path.split("/")[3]);
    else if (path.endsWith("/refund")) {
      const p = payments.get(path.split("/")[3]);
      if (p) {
        p.amount_refunded += body.amount;
        if (p.amount_refunded === p.amount) p.status = "refunded";
        result = { id: `rfnd_${payments.size}` };
      }
    } else if (path.startsWith("/v1/payments/"))
      result = payments.get(path.split("/")[3]);
    res.writeHead(result ? 200 : 404).end(JSON.stringify(result ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
const transport = (async (url: RequestInfo | URL, init?: RequestInit) =>
  fetch(
    String(url).replace("https://api.razorpay.com", origin),
    init,
  )) as typeof fetch;
const gateway = razorpay(config, transport);
const service = {
  rpc: async (name: string, params: Record<string, unknown>) => {
    assert.ok(
      [
        "cv_gateway_order_context",
        "cv_process_gateway_payment",
        "cv_gateway_event_seen",
        "cv_consume_request_budget",
        "cv_reconciliation_candidates",
        "cv_note_reconciliation",
      ].includes(name),
    );
    const args = Object.entries(params)
      .map(([key, v]) => {
        assert.match(key, /^p_[a-z_]+$/);
        return `${key}=>${typeof v === "boolean" || typeof v === "number" ? String(v) : literal(String(v))}`;
      })
      .join(",");
    const result = sql(serviceSql(`select public.${name}(${args})`), false);
    return {
      data:
        result.status === 0
          ? result.out === "t"
            ? true
            : result.out === "f"
              ? false
              : result.out
                ? JSON.parse(result.out)
                : null
          : null,
      error: result.status === 0 ? null : { message: "isolated SQL rejection" },
    };
  },
} as unknown as PaymentService;
async function checkout(
  a = account("individual"),
  p = plan(planTerms({ included_seats: 1, certificate_limit: 2 })),
  intent = "start",
) {
  const q = getQuote(p, a, intent, "", 1),
    i = accept(q.id, a),
    t = value(`select public.cv_prepare_checkout('${i.payment_intent_id}')`, a);
  const order = await gateway.createOrder({
    receipt: t.receipt,
    amount: t.amount_minor,
    currency: t.currency,
  });
  sql(
    serviceSql(
      `select public.cv_bind_gateway_order('${t.id}','${order.id}','${order.receipt}',${order.amount},'${order.currency}')`,
    ),
  );
  const id = `pay_${payments.size + 1}`;
  payments.set(id, {
    id,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    status: "captured",
    amount_refunded: 0,
  });
  orders.get(order.id)!.status = "paid";
  await reconcilePayment(gateway, service, id);
  return { a, p, q, i, t, order, payment: id };
}
function template(a: string) {
  const id = randomUUID();
  sql(
    as(
      ids.owner,
      a,
      `insert into public.certificate_templates(id,user_id,account_id,name) values('${id}','${ids.owner}','${a}','Integrated template')`,
    ),
  );
  return id;
}
function issue(a: string, t: string, user = ids.owner) {
  return as(
    user,
    a,
    `insert into public.certificates(user_id,account_id,template_id,certificate_id,status) values('${user}','${a}','${t}','CV-${randomUUID()}','Active') returning id`,
  );
}
function publicCertificate(id: string) {
  const reference = sql(
    `select public_verification_id from public.certificates where id='${id}'`,
  ).out;
  return JSON.parse(
    sql(
      `begin;set local role anon;select public.cv_public_certificate('${reference}');commit;`,
    ).out,
  );
}
test("Scenario A: isolated individual paid checkout, template, private/public fields, QR formats and public verification", async () => {
  const c = await checkout(),
    t = template(c.a),
    id = sql(issue(c.a, t)).out;
  sql(
    as(
      ids.owner,
      c.a,
      `insert into public.certificate_field_values(certificate_id,field_name,field_type,field_value,is_public,display_order) values('${id}','Professional','text','Fixture Professional',true,0),('${id}','Private','text','Confidential fixture',false,1)`,
    ),
  );
  const record = publicCertificate(id);
  assert.equal(record.status, "Active");
  assert.equal(JSON.stringify(record).includes("Confidential fixture"), false);
  assert.equal(
    value("select public.cv_subscription_status()", c.a).period
      .certificates_created,
    1,
  );
  const png = await QRCode.toBuffer(
    `https://certverify.example/verify/${record.public_verification_id}`,
    { type: "png" },
  );
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal((await sharp(png).jpeg().toBuffer())[0], 255);
});
test("Scenario B: paid organization promotes an invited admin, accepts a member, issues and revokes membership", () => {
  const c = prepared(account(), plan(planTerms({ included_seats: 5 })));
  captured(c);
  const t = template(c.a),
    hash = "b".repeat(64);
  sql(
    as(
      ids.owner,
      c.a,
      `select public.cv_prepare_invitation('recipient@example.test','${hash}')`,
    ),
  );
  sql(
    as(
      ids.recipient,
      null,
      `select public.cv_accept_invitation('${hash}','Invited administrator')`,
    ),
  );
  value(
    `select public.cv_manage_member((select id from public.account_members where account_id='${c.a}' and user_id='${ids.recipient}'),'admin',false)`,
    c.a,
  );
  const memberHash = "d".repeat(64);
  sql(
    as(
      ids.recipient,
      c.a,
      `select public.cv_prepare_invitation('member@example.test','${memberHash}')`,
    ),
  );
  sql(
    as(
      ids.member,
      null,
      `select public.cv_accept_invitation('${memberHash}','Invited member')`,
    ),
  );
  const id = sql(issue(c.a, t, ids.member)).out;
  value(
    `select public.cv_manage_member((select id from public.account_members where account_id='${c.a}' and user_id='${ids.member}'),null,true)`,
    c.a,
  );
  assert.equal(
    sql(
      `select status from public.account_members where account_id='${c.a}' and user_id='${ids.member}'`,
    ).out,
    "removed",
  );
  assert.notEqual(sql(issue(c.a, t, ids.member), false).status, 0);
  assert.equal(publicCertificate(id).status, "Active");
  assert.ok(
    Number(
      sql(
        `select count(*) from public.cv_audit_events where account_id='${c.a}' and action='member.removed'`,
      ).out,
    ) > 0,
  );
});
test("Scenario C: trial to verified paid period, quota, renewal, expiry and continued public verification", async () => {
  const a = account("individual"),
    p = plan(
      planTerms({ included_seats: 1, certificate_limit: 2, trial_days: 7 }),
    );
  const q = getQuote(p, a, "trial", "", 1);
  accept(q.id, a);
  const t = template(a),
    id = sql(issue(a, t)).out;
  const c = await checkout(a, p, "renewal");
  assert.equal(
    value("select public.cv_subscription_status()", a).status,
    "trial",
  );
  clock(8);
  const active = value("select public.cv_subscription_status()", a);
  assert.equal(active.period.payment_status, "captured");
  assert.equal(active.period.certificates_created, 0);
  sql(issue(a, t));
  sql(issue(a, t));
  assert.notEqual(sql(issue(a, t), false).status, 0);
  clock(45);
  assert.equal(
    value("select public.cv_subscription_status()", a).entitled,
    false,
  );
  assert.notEqual(sql(issue(a, t), false).status, 0);
  assert.equal(publicCertificate(id).status, "Active");
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, a).settlement,
    "active",
  );
  clock();
});
test("Scenario D: cross-account access, forged signatures, concurrent quota issuance and invalid service privileges are denied", async () => {
  const c = await checkout(),
    t = template(c.a);
  assert.notEqual(
    sql(
      as(ids.owner, ids.a, `select public.cv_payment_attempt('${c.t.id}')`),
      false,
    ).status,
    0,
  );
  const raw = Buffer.from(
    JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: c.payment } } },
    }),
  );
  assert.throws(() => gateway.verifyWebhook(raw, "0".repeat(64), "forged"));
  const result = await Promise.all([
    concurrentSql(issue(c.a, t)),
    concurrentSql(issue(c.a, t)),
    concurrentSql(issue(c.a, t)),
  ]);
  assert.equal(result.filter((r) => r.status === 0).length, 2);
  assert.notEqual(
    sql(
      `begin;set local role service_role;select * from public.cv_gateway_attempts;commit;`,
      false,
    ).status,
    0,
  );
});
test("Scenario E: branding approval, old issuer preservation, revocation and replacement linkage", async () => {
  const c = await checkout(
      account("individual"),
      plan(planTerms({ included_seats: 1, certificate_limit: 3 })),
    ),
    t = template(c.a);
  const original = sql(issue(c.a, t)).out;
  const before = publicCertificate(original).issuer_name;
  const request = sql(
    as(
      ids.owner,
      c.a,
      `select public.cv_request_branding('Approved New Professional','Professional details',null,'Business identity change')`,
    ),
  ).out;
  admin(
    `select public.cv_review_branding('${request}','approve','Verified identity request')`,
  );
  const after = sql(issue(c.a, t)).out;
  assert.equal(publicCertificate(original).issuer_name, before);
  assert.equal(
    publicCertificate(after).issuer_name,
    "Approved New Professional",
  );
  value(
    `select public.cv_change_certificate_status('${original}','Revoked','Internal reason','Withdrawn by issuer')`,
    c.a,
  );
  assert.equal(publicCertificate(original).status, "Revoked");
  assert.equal(
    publicCertificate(original).public_revocation_reason,
    "Withdrawn by issuer",
  );
  const replacement = randomUUID();
  sql(
    as(
      ids.owner,
      c.a,
      `insert into public.certificates(id,user_id,account_id,template_id,certificate_id,status,replaces_certificate_id) values('${replacement}','${ids.owner}','${c.a}','${t}','Replacement-${replacement}','Active','${original}')`,
    ),
  );
  assert.equal(
    sql(
      `select replaces_certificate_id from public.certificates where id='${replacement}'`,
    ).out,
    original,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        c.a,
        `select public.cv_change_certificate_status('${original}','Active','Attempted restoration',null)`,
      ),
      false,
    ).status,
    0,
  );
});
test("persistent replay recognition ignores changed unsigned event IDs and conflicting identity fails", async () => {
  const c = await checkout();
  const raw = Buffer.from(
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: c.payment } } },
      }),
    ),
    signature = createHmac("sha256", config.webhookSecret)
      .update(raw)
      .digest("hex");
  const notice = gateway.verifyWebhook(raw, signature, "signed_event");
  await reconcilePayment(
    gateway,
    service,
    notice.paymentId,
    `webhook:${notice.id}`,
    fingerprint(raw),
  );
  const before = requests;
  assert.equal(
    await checkedRpc(service, "cv_gateway_event_seen", {
      p_event: "webhook:changed_unsigned_header",
      p_fingerprint: fingerprint(raw),
      p_payment: c.payment,
    }),
    true,
  );
  assert.equal(requests, before);
  await assert.rejects(
    checkedRpc(service, "cv_gateway_event_seen", {
      p_event: "webhook:signed_event",
      p_fingerprint: "f".repeat(64),
      p_payment: c.payment,
    }),
  );
});
test("central request budgets serialize concurrent requests and cannot be written by customer or service role", async () => {
  const hash = "c".repeat(64);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      concurrentSql(
        serviceSql(`select public.cv_consume_request_budget('${hash}',2)`),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.out === "t").length, 2);
  assert.equal(
    sql(
      `select requests from public.cv_request_budgets where key_hash='${hash}'`,
    ).out,
    "2",
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        `select public.cv_consume_request_budget('${hash}',120)`,
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(serviceSql(`update public.cv_request_budgets set requests=0`), false)
      .status,
    0,
  );
});
test("authoritative local HTTP refunds block the linked period while preserving certificate verification", async () => {
  const c = await checkout(),
    t = template(c.a),
    id = sql(issue(c.a, t)).out;
  const cmd = JSON.parse(
    admin(
      `select public.cv_prepare_refund('${c.t.id}',${c.t.amount_minor},'Approved fixture refund')`,
    ),
  );
  const refund = await gateway.refund({
    paymentId: c.payment,
    amount: c.t.amount_minor,
    reference: cmd.reference,
  });
  sql(serviceSql(`select public.cv_bind_refund('${cmd.id}','${refund.id}')`));
  await reconcilePayment(gateway, service, c.payment);
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  assert.equal(publicCertificate(id).status, "Active");
});

test("refunding a scheduled paid renewal preserves the current period and cannot activate the refunded future period", () => {
  const c = prepared();
  captured(c);
  const old = value("select public.cv_subscription_status()", c.a).period.id;
  const renewal = prepared(c.a, c.p);
  captured(renewal);
  sql(observe(renewal, { refund: renewal.t.amount_minor, status: "refunded" }));
  assert.equal(
    value("select public.cv_subscription_status()", c.a).period.id,
    old,
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    true,
  );
  clock(32);
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  clock();
});

test("bounded reconciliation jobs fetch actual local HTTP order payments and record checked attempts", async () => {
  const c = await checkout();
  const result = await reconcileBatch(gateway, service);
  assert.ok(result.checked > 0);
  assert.ok(result.failed > 0); // SQL-only fixtures have no gateway order; failures remain retryable.
  assert.equal(
    sql(
      `select count(*) from public.cv_reconciliation_checks where attempt_id='${c.t.id}'`,
    ).out,
    "1",
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    true,
  );
});
test("manual financial recovery records the MFA administrator actor and ordinary owners cannot forge that audit", () => {
  const c = prepared();
  assert.notEqual(
    sql(
      as(
        ids.owner,
        c.a,
        `select public.cv_record_payment_admin_action('reconcile',null,'${c.payment}')`,
      ),
      false,
    ).status,
    0,
  );
  assert.equal(
    admin(
      `select public.cv_record_payment_admin_action('bind_order','${c.t.id}','${c.order}')`,
    ),
    "t",
  );
  assert.equal(
    sql(
      `select actor_id from public.cv_platform_audit_events where action='payment.admin_bind_order_requested' and subject_id='${c.t.id}'`,
    ).out,
    ids.other,
  );
  assert.equal(
    sql(
      `select has_function_privilege('service_role','public.cv_record_payment_admin_action(text,uuid,text)','EXECUTE')`,
    ).out,
    "f",
  );
});
test("prepaid renewal cancellation preserves booked access and non-renewing preference", () => {
  const c = prepared();
  captured(c);
  const old = value("select public.cv_subscription_status()", c.a).period.id;
  const renewal = prepared(c.a, c.p);
  captured(renewal);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        c.a,
        `select public.cv_subscription_action('cancel_request','${renewal.q.id}')`,
      ),
      false,
    ).status,
    0,
  );
  value("select public.cv_subscription_action('cancel_renewal')", c.a);
  assert.equal(
    sql(
      `select status from public.cv_billing_quotes where id='${renewal.q.id}'`,
    ).out,
    "scheduled",
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).period.id,
    old,
  );
  clock(32);
  const next = value("select public.cv_subscription_status()", c.a);
  assert.notEqual(next.period.id, old);
  assert.equal(next.period.payment_status, "captured");
  assert.equal(next.cancel_at_period_end, true);
  assert.equal(next.status, "non_renewing");
  clock();
});
test("unpaid renewal cancellation still closes checkout and any later capture needs review", () => {
  const c = prepared();
  value("select public.cv_subscription_action('cancel_renewal')", c.a);
  assert.equal(
    sql(`select status from public.cv_billing_quotes where id='${c.q.id}'`).out,
    "cancelled",
  );
  captured(c);
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, c.a).state,
    "review",
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
});
test("quote budgets apply to direct RPCs across accounts, and private budget cleanup cannot delete financial evidence", () => {
  const a = account(),
    p = plan();
  let denied = false;
  for (let n = 0; n < 125; n++) {
    const result = sql(
      as(
        ids.owner,
        a,
        `select public.cv_quote_subscription('${p}',5,null,'start')`,
      ),
      false,
    );
    if (result.status !== 0) {
      assert.match(result.error, /Quote request budget exceeded/);
      denied = true;
      break;
    }
  }
  assert.equal(denied, true);
  assert.notEqual(
    sql(as(ids.owner, a, "select public.cv_prune_request_budgets()"), false)
      .status,
    0,
  );
  clock(2);
  assert.ok(
    Number(sql(serviceSql("select public.cv_prune_request_budgets()")).out) > 0,
  );
  clock();
});
test("all staged definer entrypoints have fixed search paths and financial roles retain least privilege", () => {
  assert.equal(
    sql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cv_%' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=\"\"'],false)",
    ).out,
    "0",
  );
  assert.equal(
    sql(
      "select has_table_privilege('service_role','public.cv_request_budgets','SELECT')",
    ).out,
    "f",
  );
  sql(readFileSync("supabase/inspection/stage7-readonly.sql", "utf8"));
});

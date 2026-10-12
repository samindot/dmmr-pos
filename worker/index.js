const LOYVERSE_API = "https://api.loyverse.com/v1.0";
const BATCH_SIZE = 100;
const MAX_PAGES = 20;
const OVERLAP_HOURS = 72;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "dmmr-pos-loyverse-sync" });
    }

    if (request.method === "POST" && url.pathname === "/sync") {
      if (!env.SYNC_TRIGGER_SECRET) {
        return json({ error: "SYNC_TRIGGER_SECRET is not configured" }, 503);
      }
      if (request.headers.get("authorization") !== `Bearer ${env.SYNC_TRIGGER_SECRET}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      try {
        const result = await runSync(env);
        return json(result);
      } catch (error) {
        console.error("Manual sync failed:", safeError(error));
        return json({ error: safeError(error) }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSync(env).catch(error => {
      console.error("Scheduled sync failed:", safeError(error));
      throw error;
    }));
  }
};

async function runSync(env) {
  requireEnv(env, ["LOYVERSE_ACCESS_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const startedAt = new Date().toISOString();
  let receiptsSeen = 0;
  let itemsUpserted = 0;
  let paymentsUpserted = 0;

  try {
    // An overlap makes the job resilient to delayed receipts and retries.
    // Existing historical rows in Supabase are retained; the free-plan API
    // may not allow re-reading receipts older than its available history window.
    const updatedAtMin = new Date(Date.now() - OVERLAP_HOURS * 60 * 60 * 1000).toISOString();
    const receipts = await fetchReceipts(env.LOYVERSE_ACCESS_TOKEN, updatedAtMin);
    receiptsSeen = receipts.length;

    // Safe by default: deploying the Worker does not write to Supabase until
    // ENABLE_WRITES is explicitly set to "true" after key compatibility is checked.
    if (env.ENABLE_WRITES !== "true") {
      return {
        status: "dry_run",
        writes_enabled: false,
        receipts_seen: receiptsSeen,
        sample_receipts: receipts.slice(0, 5).map(r => ({
          receipt_number: r.receipt_number || null,
          api_has_id: Boolean(r.id),
          line_items: Array.isArray(r.line_items) ? r.line_items.length : 0,
          payments: Array.isArray(r.payments) ? r.payments.length : 0
        })),
        updated_at_min: updatedAtMin,
        note: "No database writes performed. Set ENABLE_WRITES=true only after validating identifier compatibility."
      };
    }

    for (const receipt of receipts) {
      const receiptKey = String(receipt.id || receipt.receipt_number || "");
      if (!receiptKey) {
        throw new Error("Loyverse returned a receipt without id or receipt_number.");
      }

      const receiptRow = mapReceipt(receipt, receiptKey);
      await supabaseUpsert(env, "receipts", [receiptRow], "loyverse_receipt_id");

      const lineItems = Array.isArray(receipt.line_items) ? receipt.line_items : [];
      const itemRows = lineItems.map((item, index) => mapLineItem(item, receipt, receiptKey, index));
      if (itemRows.length) {
        await supabaseUpsert(env, "sales_items", itemRows, "loyverse_line_item_key");
        itemsUpserted += itemRows.length;
      }

      const receiptPayments = Array.isArray(receipt.payments) ? receipt.payments : [];
      const paymentRows = receiptPayments.map((payment, index) => mapPayment(payment, receipt, receiptKey, index));
      if (paymentRows.length) {
        await supabaseUpsert(env, "payments", paymentRows, "loyverse_payment_key");
        paymentsUpserted += paymentRows.length;
      }
    }

    await writeSyncRun(env, {
      source: "loyverse-api-worker",
      status: "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      receipts_seen: receiptsSeen,
      receipts_inserted: 0,
      receipts_updated: receiptsSeen,
      items_upserted: itemsUpserted,
      payments_upserted: paymentsUpserted,
      metadata: { updated_at_min: updatedAtMin, overlap_hours: OVERLAP_HOURS }
    });

    return {
      status: "success",
      receipts_seen: receiptsSeen,
      items_upserted: itemsUpserted,
      payments_upserted: paymentsUpserted,
      updated_at_min: updatedAtMin,
      finished_at: new Date().toISOString()
    };
  } catch (error) {
    try {
      await writeSyncRun(env, {
        source: "loyverse-api-worker",
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        receipts_seen: receiptsSeen,
        receipts_inserted: 0,
        receipts_updated: 0,
        items_upserted: itemsUpserted,
        payments_upserted: paymentsUpserted,
        error_message: safeError(error).slice(0, 1500),
        metadata: { overlap_hours: OVERLAP_HOURS }
      });
    } catch (logError) {
      console.error("Could not write failed sync log:", safeError(logError));
    }
    throw error;
  }
}

async function fetchReceipts(token, updatedAtMin) {
  const all = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${LOYVERSE_API}/receipts`);
    url.searchParams.set("limit", "250");
    url.searchParams.set("updated_at_min", updatedAtMin);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Loyverse API ${response.status}: ${body.slice(0, 500)}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload.receipts)) {
      throw new Error("Unexpected Loyverse API response: missing receipts array.");
    }
    all.push(...payload.receipts);
    cursor = payload.cursor || null;
    if (!cursor) return all;
  }
  throw new Error(`Loyverse pagination exceeded ${MAX_PAGES} pages; stopped to avoid a partial sync.`);
}

function mapReceipt(r, receiptKey) {
  return {
    loyverse_receipt_id: receiptKey,
    receipt_number: r.receipt_number || null,
    receipt_date: r.receipt_date || r.created_at || null,
    receipt_type: r.receipt_type || null,
    total_money: num(r.total_money),
    total_tax: num(r.total_tax),
    total_discount: num(r.total_discount ?? r.total_discounts_money),
    total_tendered: num(r.total_tendered),
    store_id: r.store_id || null,
    store_name: r.store_name || r.store?.name || null,
    pos_device_id: r.pos_device_id || null,
    pos_device_name: r.pos_device_name || r.pos_device?.name || null,
    employee_id: r.employee_id || null,
    employee_name: r.employee_name || r.employee?.name || null,
    customer_id: r.customer_id || null,
    customer_name: r.customer_name || r.customer?.name || null,
    source_updated_at: r.updated_at || null,
    raw_json: r
  };
}

function mapLineItem(item, receipt, receiptKey, index) {
  const lineKey = String(item.id || item.line_item_id || `${receiptKey}:${index}`);
  return {
    loyverse_line_item_key: lineKey,
    loyverse_receipt_id: receiptKey,
    item_id: item.item_id || null,
    variant_id: item.variant_id || null,
    item_name: item.item_name || item.name || null,
    variant_name: item.variant_name || null,
    sku: item.sku || null,
    quantity: num(item.quantity),
    price: num(item.price),
    gross_total_money: num(item.gross_total_money ?? item.gross_total),
    total_money: num(item.total_money ?? item.total),
    cost: num(item.cost),
    cost_total: num(item.cost_total),
    total_discount: num(item.total_discount ?? item.discount),
    line_note: item.line_note || null,
    raw_json: { source_raw: item, modifiers: item.line_modifiers || item.modifiers || [] }
  };
}

function mapPayment(payment, receipt, receiptKey, index) {
  const paymentKey = String(payment.id || payment.payment_id ||
    `${receiptKey}:${payment.payment_type_id || payment.payment_type_name || "payment"}:${index}`);
  return {
    loyverse_payment_key: paymentKey,
    loyverse_receipt_id: receiptKey,
    payment_type_id: payment.payment_type_id || null,
    payment_type_name: payment.payment_type_name || payment.name || null,
    money_amount: num(payment.money_amount ?? payment.amount),
    raw_json: payment
  };
}

async function supabaseUpsert(env, table, rows, conflict) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
    url.searchParams.set("on_conflict", conflict);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(rows.slice(i, i + BATCH_SIZE))
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase ${table} upsert ${response.status}: ${body.slice(0, 700)}`);
    }
  }
}

async function writeSyncRun(env, row) {
  const response = await fetch(new URL("/rest/v1/sync_runs", env.SUPABASE_URL), {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(row)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase sync_runs insert ${response.status}: ${body.slice(0, 700)}`);
  }
}

function requireEnv(env, names) {
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw new Error(`Missing required Worker secrets/vars: ${missing.join(", ")}`);
}
function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

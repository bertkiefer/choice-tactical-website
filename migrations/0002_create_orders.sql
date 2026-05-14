-- migrations/0002_create_orders.sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  short_id TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_total INTEGER NOT NULL,
  amount_shipping INTEGER NOT NULL,
  amount_tax INTEGER NOT NULL,
  currency TEXT NOT NULL,
  line_items_json TEXT NOT NULL,
  shipping_address_json TEXT NOT NULL,
  shipping_rate_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','shipped','delivered','cancelled')),
  carrier TEXT,
  tracking_number TEXT,
  payment_intent_id TEXT,
  paid_at INTEGER NOT NULL,
  shipped_at INTEGER,
  notes TEXT
);

CREATE INDEX idx_orders_status_paid ON orders(status, paid_at DESC);
CREATE INDEX idx_orders_email ON orders(customer_email);

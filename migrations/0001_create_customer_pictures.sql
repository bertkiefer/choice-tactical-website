-- migrations/0001_create_customer_pictures.sql
CREATE TABLE customer_pictures (
  id TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  caption TEXT NOT NULL,
  photo_keys TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved')),
  submitted_at INTEGER NOT NULL,
  moderated_at INTEGER,
  ip_hash TEXT
);

CREATE INDEX idx_product_status ON customer_pictures(product_slug, status);
CREATE INDEX idx_status_submitted ON customer_pictures(status, submitted_at);
CREATE INDEX idx_ip_submitted ON customer_pictures(ip_hash, submitted_at);

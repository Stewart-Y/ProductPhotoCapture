CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  image_url TEXT,
  brand TEXT,
  year TEXT,
  category TEXT,
  size TEXT,
  subcategory TEXT,
  abv TEXT,
  weight TEXT,
  case_size TEXT,
  par_level TEXT,
  description TEXT,
  extra_field_1 TEXT,
  extra_field_2 TEXT,
  extra_field_3 TEXT,
  upc TEXT,
  requires_extra_scan INTEGER DEFAULT 0,
  ignore_from_sales INTEGER DEFAULT 0,
  discontinued INTEGER DEFAULT 0,
  warehouse_shelf TEXT,
  warehouse_row TEXT,
  warehouse_column TEXT
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

export type Item = { 
  id: string;
  sku: string | null;
  name: string;
  image_url?: string | null;
  brand?: string | null;
  year?: string | null;
  category?: string | null;
  size?: string | null;
  subcategory?: string | null;
  abv?: string | null;
  weight?: string | null;
  case_size?: string | null;
  par_level?: string | null;
  description?: string | null;
  extra_field_1?: string | null;
  extra_field_2?: string | null;
  extra_field_3?: string | null;
  upc?: string | null;
  requires_extra_scan?: number;
  ignore_from_sales?: number;
  discontinued?: number;
  warehouse_shelf?: string | null;
  warehouse_row?: string | null;
  warehouse_column?: string | null;
};

export type Photo = { id: string; item_id: string; url: string; thumb_url?: string; file_name: string; created_at: string };

export async function fetchItems(): Promise<Item[]> {
  const r = await fetch('/api/items');
  if (!r.ok) throw new Error('Failed to fetch items');
  return r.json();
}

export async function fetchItem(id: string): Promise<Item> {
  const r = await fetch(`/api/items/${id}`);
  if (!r.ok) throw new Error('Failed to fetch item');
  return r.json();
}

export async function updateItem(id: string, data: Partial<Item>): Promise<Item> {
  const r = await fetch(`/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('Failed to update item');
  return r.json();
}

export async function uploadItemImage(id: string, file: File): Promise<Item> {
  const formData = new FormData();
  formData.append('image', file);
  
  const r = await fetch(`/api/items/${id}/upload-image`, {
    method: 'POST',
    body: formData
  });
  if (!r.ok) throw new Error('Failed to upload image');
  return r.json();
}

export async function fetchPhotos(id: string): Promise<Photo[]> {
  const r = await fetch(`/api/items/${id}/photos`);
  if (!r.ok) throw new Error('Failed to fetch photos');
  return r.json();
}

export type Item = { id: string; sku: string | null; name: string };
export type Photo = { id: string; item_id: string; url: string; file_name: string; created_at: string };

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

export async function fetchPhotos(id: string): Promise<Photo[]> {
  const r = await fetch(`/api/items/${id}/photos`);
  if (!r.ok) throw new Error('Failed to fetch photos');
  return r.json();
}

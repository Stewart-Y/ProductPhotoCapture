// API base URL - use environment variable or default to relative path
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function fetchItems() {
  const r = await fetch(`${API_BASE_URL}/api/items`);
  if (!r.ok) throw new Error('Failed to fetch items');
  return r.json();
}

export async function fetchItem(id) {
  const r = await fetch(`${API_BASE_URL}/api/items/${id}`);
  if (!r.ok) throw new Error('Failed to fetch item');
  return r.json();
}

export async function updateItem(id, data) {
  const r = await fetch(`${API_BASE_URL}/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('Failed to update item');
  return r.json();
}

export async function uploadItemImage(id, file) {
  const formData = new FormData();
  formData.append('image', file);
  
  const r = await fetch(`${API_BASE_URL}/api/items/${id}/upload-image`, {
    method: 'POST',
    body: formData
  });
  if (!r.ok) throw new Error('Failed to upload image');
  return r.json();
}

export async function fetchPhotos(id) {
  const r = await fetch(`${API_BASE_URL}/api/items/${id}/photos`);
  if (!r.ok) throw new Error('Failed to fetch photos');
  return r.json();
}

export async function syncFrom3JMS() {
  const r = await fetch(`${API_BASE_URL}/api/tjms/import`, { method: 'POST' });
  if (!r.ok) throw new Error('Sync failed');
  return r.json();
}

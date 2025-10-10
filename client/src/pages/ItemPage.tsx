import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchItem, fetchPhotos, type Item, type Photo } from "../lib/api";
import Header from "../components/Header";

export default function ItemPage() {
  const { id } = useParams();
  const [item, setItem] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchItem(id).then(setItem).catch(e => setErr(String(e)));
    fetchPhotos(id).then(setPhotos).catch(e => setErr(String(e)));
  }, [id]);

  return (
    <div>
      <Header />
      <div style={{ padding: 16 }}>
        <Link to="/">{'← Back'}</Link>
        <h2>{item ? item.name : "Loading..."}</h2>
        {err && <div style={{ color: "red" }}>{err}</div>}
        <p>Photos will appear here in Phase 2.</p>
        {photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,120px)', gap: 8 }}>
            {photos.map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type Photo = { id: string; url: string; created_at: string };

export default function PhotoGallery({ photos, onDelete }: { photos: Photo[]; onDelete?: (id: string) => void }) {
  if (!photos?.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 120px)", gap: 8, marginTop: 12 }}>
      {photos.map(p => (
        <div key={p.id} style={{ position: "relative" }}>
          <a href={p.url} target="_blank" rel="noreferrer" title={new Date(p.created_at).toLocaleString()}>
            <img src={p.url} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, display: "block" }} />
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(p.id)}
              title="Delete"
              style={{ 
                position: "absolute", 
                top: 4, 
                right: 4, 
                fontSize: 12, 
                backgroundColor: "rgba(0,0,0,0.6)", 
                color: "white", 
                border: "none", 
                borderRadius: "50%", 
                width: 24, 
                height: 24, 
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

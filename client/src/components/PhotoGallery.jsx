import { useState } from "react";

export default function PhotoGallery({ 
  photos, 
  onDelete
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  if (!photos?.length) return null;
  
  const currentPhoto = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;
  
  const goToPrev = () => {
    if (hasPrev) setCurrentIndex(currentIndex - 1);
  };
  
  const goToNext = () => {
    if (hasNext) setCurrentIndex(currentIndex + 1);
  };
  
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ 
        position: "relative", 
        width: "100%", 
        maxWidth: 400,
        aspectRatio: "1",
        backgroundColor: "#f5f5f5",
        borderRadius: 8,
        overflow: "hidden"
      }}>
        <a href={currentPhoto.url} target="_blank" rel="noreferrer">
          <img 
            src={currentPhoto.url} 
            alt="" 
            style={{ 
              width: "100%", 
              height: "100%", 
              objectFit: "contain",
              display: "block"
            }} 
          />
        </a>
        
        {onDelete && (
          <button
            onClick={() => onDelete(currentPhoto.id)}
            title="Delete"
            style={{ 
              position: "absolute", 
              top: 8, 
              right: 8, 
              fontSize: 16, 
              backgroundColor: "rgba(0,0,0,0.7)", 
              color: "white", 
              border: "none", 
              borderRadius: "50%", 
              width: 32, 
              height: 32, 
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10
            }}
          >✕</button>
        )}
        
        {hasPrev && (
          <button
            onClick={goToPrev}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10
            }}
          >‹</button>
        )}
        
        {hasNext && (
          <button
            onClick={goToNext}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10
            }}
          >›</button>
        )}
      </div>
      
      <div style={{ 
        marginTop: 8, 
        fontSize: 14, 
        color: "#666",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <span>{currentIndex + 1} / {photos.length}</span>
        <span style={{ fontSize: 12, color: "#999" }}>
          {new Date(currentPhoto.created_at).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { fetchItems, type Item } from "../lib/api";
import { Link } from "react-router-dom";
import Header from "../components/Header";

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchItems().then(setItems).catch(e => setErr(String(e)));
  }, []);

  return (
    <div>
      <Header />
      <div style={{ padding: 16 }}>
        <h2>Inventory</h2>
        {err && <div style={{ color: "red" }}>{err}</div>}
        <ul>
          {items.map(it => (
            <li key={it.id}>
              <Link to={`/items/${it.id}`}>{it.name} {it.sku ? `(${it.sku})` : ""}</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

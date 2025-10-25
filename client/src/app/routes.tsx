import { createBrowserRouter } from "react-router-dom";
import InventoryPage from "../pages/InventoryPage.tsx";
import ItemPage from "../pages/ItemPage.tsx";

export const router = createBrowserRouter([
  { path: "/", element: <InventoryPage /> },
  { path: "/items/:id", element: <ItemPage /> }
]);

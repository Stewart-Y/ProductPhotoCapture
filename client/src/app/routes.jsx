import { createBrowserRouter } from "react-router-dom";
import InventoryPage from "../pages/InventoryPage.jsx";
import ItemPage from "../pages/ItemPage.jsx";

export const router = createBrowserRouter([
  { path: "/", element: <InventoryPage /> },
  { path: "/items/:id", element: <ItemPage /> }
]);

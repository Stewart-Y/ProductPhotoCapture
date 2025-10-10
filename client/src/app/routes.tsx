import { createBrowserRouter } from "react-router-dom";
import InventoryPage from "../pages/InventoryPage";
import ItemPage from "../pages/ItemPage";

export const router = createBrowserRouter([
  { path: "/", element: <InventoryPage /> },
  { path: "/items/:id", element: <ItemPage /> }
]);

import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { LiveMap } from "./pages/LiveMap";
import { Orders } from "./pages/Orders";
import { Visits } from "./pages/Visits";
import { Employees } from "./pages/Employees";
import { Products } from "./pages/Products";
import { Dashboard } from "./pages/Dashboard";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<LiveMap />} />
        <Route path="orders" element={<Orders />} />
        <Route path="visits" element={<Visits />} />
        <Route path="employees" element={<Employees />} />
        <Route path="products" element={<Products />} />
        <Route path="dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;

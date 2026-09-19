import { Router as WouterRouter } from "wouter";
import { ClerkApp } from "./app/ClerkApp";
import { AppRoutes } from "./app/routes";
import { basePath } from "./app/config";

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkApp>
        <AppRoutes />
      </ClerkApp>
    </WouterRouter>
  );
}

export default App;
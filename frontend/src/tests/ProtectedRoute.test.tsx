import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "@/auth/ProtectedRoute";

let mockUser: { role: "hr" | "candidate" } | null = null;
let mockLoading = false;

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/jobs" element={<div>CANDIDATE JOBS</div>} />
        <Route path="/hr" element={<div>HR DASHBOARD</div>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<ProtectedRoute roles={["hr"]} />}>
            <Route path="/hr/secret" element={<div>HR SECRET</div>} />
          </Route>
          <Route element={<ProtectedRoute roles={["candidate"]} />}>
            <Route path="/me/secret" element={<div>CANDIDATE SECRET</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("<ProtectedRoute />", () => {
  it("redirects an unauthenticated user to /login", () => {
    mockUser = null;
    mockLoading = false;
    renderAt("/hr/secret");
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("redirects a candidate away from an HR-only route", () => {
    mockUser = { role: "candidate" };
    mockLoading = false;
    renderAt("/hr/secret");
    // Candidates land back on /jobs, never the HR-only page.
    expect(screen.queryByText("HR SECRET")).not.toBeInTheDocument();
    expect(screen.getByText("CANDIDATE JOBS")).toBeInTheDocument();
  });

  it("redirects an HR away from a candidate-only route", () => {
    mockUser = { role: "hr" };
    mockLoading = false;
    renderAt("/me/secret");
    expect(screen.queryByText("CANDIDATE SECRET")).not.toBeInTheDocument();
    expect(screen.getByText("HR DASHBOARD")).toBeInTheDocument();
  });

  it("lets the matching role through", () => {
    mockUser = { role: "hr" };
    mockLoading = false;
    renderAt("/hr/secret");
    expect(screen.getByText("HR SECRET")).toBeInTheDocument();
  });

  it("shows a loading state while auth is bootstrapping", () => {
    mockUser = null;
    mockLoading = true;
    renderAt("/hr/secret");
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

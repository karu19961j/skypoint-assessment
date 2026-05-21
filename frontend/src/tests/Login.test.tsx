import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/pages/Login";

const loginMock = vi.fn();

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: loginMock,
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("<LoginPage />", () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it("shows a validation error when email is missing", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/password/i), "anything");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("calls login() with the entered credentials", async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValueOnce({
      id: 1,
      email: "hr@test.com",
      full_name: "HR",
      role: "hr",
      created_at: new Date().toISOString(),
    });
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "hr@test.com");
    await user.type(screen.getByLabelText(/password/i), "Hr@1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith("hr@test.com", "Hr@1234");
  });

  it("surfaces backend auth errors in a banner", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@/api/client");
    loginMock.mockRejectedValueOnce(new ApiError(401, "Invalid email or password."));
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "hr@test.com");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });
});

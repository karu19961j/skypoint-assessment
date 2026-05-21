import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pagination } from "@/components/Pagination";

describe("<Pagination />", () => {
  it("renders nothing when total fits in one page", () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={5} onChange={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when total is zero", () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={0} onChange={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the right item range and page count", () => {
    render(
      <Pagination
        page={3}
        pageSize={10}
        total={47}
        onChange={() => undefined}
        itemLabel="applicants"
      />,
    );
    // 5 pages total at 10 / page; on page 3 → items 21–30
    expect(screen.getByText(/Showing/)).toHaveTextContent("21");
    expect(screen.getByText(/Showing/)).toHaveTextContent("30");
    expect(screen.getByText(/Showing/)).toHaveTextContent("47");
    expect(screen.getByText(/applicants/)).toBeInTheDocument();
  });

  it("clamps the last item to total (not page * pageSize)", () => {
    // 47 items / 10 per page → last page shows items 41–47, not 41–50
    render(
      <Pagination page={5} pageSize={10} total={47} onChange={() => undefined} />,
    );
    expect(screen.getByText(/Showing/)).toHaveTextContent("41");
    expect(screen.getByText(/Showing/)).toHaveTextContent("47");
  });

  it("disables Prev on the first page and Next on the last", () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={10} total={30} onChange={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).not.toBeDisabled();

    rerender(
      <Pagination page={3} pageSize={10} total={30} onChange={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: /previous page/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("calls onChange with the right page when a number is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Pagination page={1} pageSize={10} total={30} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /go to page 3/i }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("marks the current page with aria-current", () => {
    render(
      <Pagination page={2} pageSize={10} total={30} onChange={() => undefined} />,
    );
    const current = screen.getByRole("button", { name: /go to page 2/i });
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("collapses long page lists with ellipses around the current window", () => {
    // 20 pages total; page 10 should render 1 … 8 9 [10] 11 12 … 20
    render(
      <Pagination page={10} pageSize={10} total={200} onChange={() => undefined} />,
    );
    const nav = screen.getByRole("navigation", { name: /pagination/i });
    // Both ellipses present (first/last page anchored either side).
    expect(within(nav).getAllByText("…").length).toBe(2);
    // First + last pages always reachable directly. Use exact regex
    // so "page 1" doesn't accidentally match "page 10" / "page 11".
    expect(within(nav).getByRole("button", { name: /^go to page 1$/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /^go to page 20$/i })).toBeInTheDocument();
  });
});

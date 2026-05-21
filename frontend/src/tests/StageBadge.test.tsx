import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StageBadge } from "@/components/StageBadge";

describe("<StageBadge />", () => {
  it("renders the human label for the given stage", () => {
    render(<StageBadge stage="interview" />);
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("uses a distinct colour for hired vs rejected", () => {
    const { container, rerender } = render(<StageBadge stage="hired" />);
    const hired = container.firstChild as HTMLElement;
    expect(hired.className).toMatch(/emerald/);
    rerender(<StageBadge stage="rejected" />);
    const rejected = container.firstChild as HTMLElement;
    expect(rejected.className).toMatch(/rose/);
  });
});

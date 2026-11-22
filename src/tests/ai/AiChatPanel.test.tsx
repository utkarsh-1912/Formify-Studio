import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AiChatPanel from "../../components/ai/AiChatPanel";
import { FakeProvider } from "../../ai/providers/fake";
import { themeMap } from "../../utils/appTheme";

const addPhone = JSON.stringify([
  { op: "add", path: "/fields/-", value: { id: "phone", type: "text", label: "Phone" } }
]);

const provider = () =>
  new FakeProvider((opts) => {
    const sys = opts.messages[0].content;
    if (sys.includes("Schema Author")) return addPhone;
    if (sys.includes("Intent Planner")) return '{"summary":"s","fields":[]}';
    if (sys.includes("Logic Agent")) return "[]";
    return '{"issues":[]}';
  });

const schema = { formTitle: "T", fields: [] as any[] };

describe("AiChatPanel", () => {
  test("shows a diff and does NOT apply until Accept is clicked", async () => {
    const onApply = vi.fn();
    render(<AiChatPanel schema={schema} themeTokens={themeMap.light} onApply={onApply} providers={[provider()]} />);
    fireEvent.change(screen.getByLabelText(/describe your form/i), { target: { value: "add phone" } });
    fireEvent.click(screen.getByText("Suggest changes"));

    await screen.findByTestId("ai-proposal");
    expect(screen.getByText(/Add \/fields\/-/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Accept"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].fields[0].id).toBe("phone");
  });

  test("Reject discards the proposal without applying", async () => {
    const onApply = vi.fn();
    render(<AiChatPanel schema={schema} themeTokens={themeMap.light} onApply={onApply} providers={[provider()]} />);
    fireEvent.change(screen.getByLabelText(/describe your form/i), { target: { value: "add phone" } });
    fireEvent.click(screen.getByText("Suggest changes"));
    await screen.findByTestId("ai-proposal");
    fireEvent.click(screen.getByText("Reject"));
    await waitFor(() => expect(screen.queryByTestId("ai-proposal")).toBeNull());
    expect(onApply).not.toHaveBeenCalled();
  });

  test("Undo restores the previous schema", async () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <AiChatPanel schema={schema} themeTokens={themeMap.light} onApply={onApply} providers={[provider()]} />
    );
    fireEvent.change(screen.getByLabelText(/describe your form/i), { target: { value: "add phone" } });
    fireEvent.click(screen.getByText("Suggest changes"));
    await screen.findByTestId("ai-proposal");
    fireEvent.click(screen.getByText("Accept"));
    const applied = onApply.mock.calls[0][0];
    rerender(<AiChatPanel schema={applied} themeTokens={themeMap.light} onApply={onApply} providers={[provider()]} />);
    fireEvent.click(screen.getByText("Undo"));
    expect(onApply.mock.calls[1][0]).toEqual(schema);
  });

  test("read-only users cannot run the assistant", () => {
    render(<AiChatPanel schema={schema} themeTokens={themeMap.light} onApply={vi.fn()} providers={[provider()]} readOnly />);
    expect(screen.getByText("Suggest changes").closest("button")).toBeDisabled();
  });

  test("surfaces provider errors", async () => {
    const down = new FakeProvider(() => {
      throw new Error("model offline");
    });
    render(<AiChatPanel schema={schema} themeTokens={themeMap.light} onApply={vi.fn()} providers={[down]} />);
    fireEvent.change(screen.getByLabelText(/describe your form/i), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Suggest changes"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/model offline/);
  });
});
